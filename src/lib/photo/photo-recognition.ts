import { base } from '$app/paths';
import { createWorker, OEM, PSM, type Worker } from 'tesseract.js';
import type { Digit } from '$lib/domain/types';
import { findGridQuadrilateral, perspectiveCoefficients, projectPoint } from './grid-extraction';

export type PhotoRecognitionPhase = 'preparing' | 'finding-grid' | 'loading-reader' | 'reading-digits' | 'checking-puzzle';

export interface PhotoRecognitionProgress {
  phase: PhotoRecognitionPhase;
  completed: number;
  total: number;
}

export interface PhotoRecognitionResult {
  values: Array<Digit | null>;
  confidence: number[];
  uncertainCells: number[];
  detectedCellCount: number;
  previewDataUrl: string;
}

interface CellImage {
  cell: number;
  canvas: HTMLCanvasElement;
  componentHeight: number;
  inkRed: number;
  inkGreen: number;
  inkBlue: number;
}

interface CellReading {
  image: CellImage;
  value: Digit | null;
  confidence: number;
}

const MAX_PHOTO_EDGE = 1400;
const WARP_SIZE = 900;
const CELL_SIZE = WARP_SIZE / 9;

function assetUrl(path: string): string {
  return new URL(`${base}/ocr/${path}`, window.location.origin).href;
}

async function decodePhoto(file: File): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let cleanup = (): void => {};
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    cleanup = () => (source as ImageBitmap).close();
  } catch {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('This photo could not be read. Try a JPEG or PNG image.'));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });
    source = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('This photo format is not supported by this browser.'));
      image.src = dataUrl;
    });
  }

  const sourceWidth = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const sourceHeight = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) {
    cleanup();
    throw new Error('This photo has no readable image area.');
  }
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    cleanup();
    throw new Error('This browser cannot prepare photos for recognition.');
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  cleanup();
  return canvas;
}

function grayscale(image: ImageData): Uint8Array {
  const output = new Uint8Array(image.width * image.height);
  for (let index = 0; index < output.length; index += 1) {
    const offset = index * 4;
    output[index] = Math.round(
      image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114
    );
  }
  return output;
}

function adaptiveDark(gray: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width + 1;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += gray[(y - 1) * width + x - 1];
      integral[y * stride + x] = integral[(y - 1) * stride + x] + rowSum;
    }
  }
  const radius = Math.max(8, Math.round(Math.min(width, height) / 55));
  const output = new Uint8Array(gray.length);
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width - 1, x + radius);
      const sum = integral[(bottom + 1) * stride + right + 1] -
        integral[top * stride + right + 1] -
        integral[(bottom + 1) * stride + left] +
        integral[top * stride + left];
      const mean = sum / ((right - left + 1) * (bottom - top + 1));
      const value = gray[y * width + x];
      output[y * width + x] = value < 205 && value < mean - 10 ? 1 : 0;
    }
  }
  return output;
}

interface WarpedGrid {
  gray: Uint8Array;
  color: Uint8ClampedArray;
}

function warpGrid(
  gray: Uint8Array,
  image: ImageData,
  coefficients: readonly number[]
): WarpedGrid {
  const output = new Uint8Array(WARP_SIZE * WARP_SIZE);
  const color = new Uint8ClampedArray(WARP_SIZE * WARP_SIZE * 3);
  const { width, height } = image;
  for (let y = 0; y < WARP_SIZE; y += 1) {
    const v = y / (WARP_SIZE - 1);
    for (let x = 0; x < WARP_SIZE; x += 1) {
      const source = projectPoint(coefficients, x / (WARP_SIZE - 1), v);
      const sourceX = Math.max(0, Math.min(width - 1, source.x));
      const sourceY = Math.max(0, Math.min(height - 1, source.y));
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const horizontal = sourceX - x0;
      const vertical = sourceY - y0;
      const top = gray[y0 * width + x0] * (1 - horizontal) + gray[y0 * width + x1] * horizontal;
      const bottom = gray[y1 * width + x0] * (1 - horizontal) + gray[y1 * width + x1] * horizontal;
      output[y * WARP_SIZE + x] = Math.round(top * (1 - vertical) + bottom * vertical);
      for (let channel = 0; channel < 3; channel += 1) {
        const topColor = image.data[(y0 * width + x0) * 4 + channel] * (1 - horizontal) +
          image.data[(y0 * width + x1) * 4 + channel] * horizontal;
        const bottomColor = image.data[(y1 * width + x0) * 4 + channel] * (1 - horizontal) +
          image.data[(y1 * width + x1) * 4 + channel] * horizontal;
        color[(y * WARP_SIZE + x) * 3 + channel] = Math.round(topColor * (1 - vertical) + bottomColor * vertical);
      }
    }
  }
  return { gray: output, color };
}

function otsuThreshold(values: readonly number[]): number {
  const histogram = new Uint32Array(256);
  values.forEach((value) => histogram[value] += 1);
  let weightedTotal = 0;
  for (let value = 0; value < 256; value += 1) weightedTotal += value * histogram[value];
  let backgroundWeight = 0;
  let backgroundTotal = 0;
  let bestVariance = -1;
  let threshold = 160;
  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = values.length - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundTotal += value * histogram[value];
    const backgroundMean = backgroundTotal / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundTotal) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) { bestVariance = variance; threshold = value; }
  }
  return Math.max(75, Math.min(205, threshold));
}

function cellImages(warped: WarpedGrid): CellImage[] {
  const images: CellImage[] = [];
  for (let cell = 0; cell < 81; cell += 1) {
    const row = Math.floor(cell / 9);
    const column = cell % 9;
    const left = Math.round(column * CELL_SIZE + CELL_SIZE * 0.14);
    const top = Math.round(row * CELL_SIZE + CELL_SIZE * 0.13);
    const right = Math.round((column + 1) * CELL_SIZE - CELL_SIZE * 0.14);
    const bottom = Math.round((row + 1) * CELL_SIZE - CELL_SIZE * 0.13);
    const sample: number[] = [];
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) sample.push(warped.gray[y * WARP_SIZE + x]);
    }
    const threshold = otsuThreshold(sample);
    const sampleWidth = right - left;
    const sampleHeight = bottom - top;
    const ink = new Uint8Array(sample.length);
    const stride = sampleWidth + 1;
    const integral = new Uint32Array((sampleWidth + 1) * (sampleHeight + 1));
    for (let y = 1; y <= sampleHeight; y += 1) {
      let rowTotal = 0;
      for (let x = 1; x <= sampleWidth; x += 1) {
        rowTotal += sample[(y - 1) * sampleWidth + x - 1];
        integral[y * stride + x] = integral[(y - 1) * stride + x] + rowTotal;
      }
    }
    const contrastRadius = 7;
    sample.forEach((value, index) => {
      const x = index % sampleWidth;
      const y = Math.floor(index / sampleWidth);
      const localLeft = Math.max(0, x - contrastRadius);
      const localRight = Math.min(sampleWidth - 1, x + contrastRadius);
      const localTop = Math.max(0, y - contrastRadius);
      const localBottom = Math.min(sampleHeight - 1, y + contrastRadius);
      const localTotal = integral[(localBottom + 1) * stride + localRight + 1] -
        integral[localTop * stride + localRight + 1] -
        integral[(localBottom + 1) * stride + localLeft] +
        integral[localTop * stride + localLeft];
      const localMean = localTotal /
        ((localRight - localLeft + 1) * (localBottom - localTop + 1));
      ink[index] = value <= threshold && value < 210 && value < localMean - 11 ? 1 : 0;
    });

    const visited = new Uint8Array(ink.length);
    const queue = new Int32Array(ink.length);
    let largest: {
      count: number;
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
      pixels: number[];
    } | null = null;
    for (let start = 0; start < ink.length; start += 1) {
      if (!ink[start] || visited[start]) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      const startX = start % sampleWidth;
      const startY = Math.floor(start / sampleWidth);
      const component = { count: 0, minX: startX, minY: startY, maxX: startX, maxY: startY, pixels: [] as number[] };
      while (head < tail) {
        const index = queue[head++];
        const x = index % sampleWidth;
        const y = Math.floor(index / sampleWidth);
        component.count += 1;
        component.pixels.push(index);
        component.minX = Math.min(component.minX, x);
        component.minY = Math.min(component.minY, y);
        component.maxX = Math.max(component.maxX, x);
        component.maxY = Math.max(component.maxY, y);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nextX = x + dx;
            const nextY = y + dy;
            if (nextX < 0 || nextX >= sampleWidth || nextY < 0 || nextY >= sampleHeight) continue;
            const next = nextY * sampleWidth + nextX;
            if (ink[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
          }
        }
      }
      if (!largest || component.count > largest.count) largest = component;
    }
    if (!largest) continue;
    const componentWidth = largest.maxX - largest.minX + 1;
    const componentHeight = largest.maxY - largest.minY + 1;
    if (largest.count < 28 || componentHeight < sampleHeight * 0.22 || componentWidth < 3) continue;
    let inkRed = 0;
    let inkGreen = 0;
    let inkBlue = 0;
    for (const pixel of largest.pixels) {
      const x = left + pixel % sampleWidth;
      const y = top + Math.floor(pixel / sampleWidth);
      const colorOffset = (y * WARP_SIZE + x) * 3;
      inkRed += warped.color[colorOffset];
      inkGreen += warped.color[colorOffset + 1];
      inkBlue += warped.color[colorOffset + 2];
    }

    const crop = document.createElement('canvas');
    crop.width = 128;
    crop.height = 160;
    const context = crop.getContext('2d');
    if (!context) continue;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, crop.width, crop.height);
    const padding = 4;
    const cropWidth = componentWidth + padding * 2;
    const cropHeight = componentHeight + padding * 2;
    const scale = Math.min(92 / cropWidth, 124 / cropHeight);
    const drawnWidth = Math.max(1, Math.round(cropWidth * scale));
    const drawnHeight = Math.max(1, Math.round(cropHeight * scale));
    const offsetX = Math.round((crop.width - drawnWidth) / 2);
    const offsetY = Math.round((crop.height - drawnHeight) / 2);
    const normalized = context.createImageData(drawnWidth, drawnHeight);
    for (let y = 0; y < drawnHeight; y += 1) {
      for (let x = 0; x < drawnWidth; x += 1) {
        const sourceX = Math.floor(x / scale) + largest.minX - padding;
        const sourceY = Math.floor(y / scale) + largest.minY - padding;
        const dark = sourceX >= 0 && sourceX < sampleWidth && sourceY >= 0 && sourceY < sampleHeight &&
          ink[sourceY * sampleWidth + sourceX];
        const value = dark ? 0 : 255;
        const index = (y * drawnWidth + x) * 4;
        normalized.data[index] = value;
        normalized.data[index + 1] = value;
        normalized.data[index + 2] = value;
        normalized.data[index + 3] = 255;
      }
    }
    context.putImageData(normalized, offsetX, offsetY);
    images.push({
      cell,
      canvas: crop,
      componentHeight,
      inkRed: inkRed / largest.count,
      inkGreen: inkGreen / largest.count,
      inkBlue: inkBlue / largest.count
    });
  }
  return images;
}

function previewDataUrl(warped: Uint8Array): string {
  const canvas = document.createElement('canvas');
  canvas.width = WARP_SIZE;
  canvas.height = WARP_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const image = context.createImageData(WARP_SIZE, WARP_SIZE);
  warped.forEach((value, index) => {
    const offset = index * 4;
    image.data[offset] = value;
    image.data[offset + 1] = value;
    image.data[offset + 2] = value;
    image.data[offset + 3] = 255;
  });
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.82);
}

async function createDigitReader(): Promise<Worker> {
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: assetUrl('worker.min.js'),
    corePath: assetUrl('tesseract-core-lstm.wasm.js'),
    langPath: assetUrl(''),
    workerBlobURL: false,
    gzip: true
  }, {
    load_system_dawg: '0',
    load_freq_dawg: '0',
    load_unambig_dawg: '0',
    load_punc_dawg: '0',
    load_number_dawg: '0',
    load_bigram_dawg: '0'
  });
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_WORD,
    tessedit_char_whitelist: '123456789',
    user_defined_dpi: '300'
  });
  return worker;
}

interface GlyphStyle {
  height: number;
  heightTolerance: number;
  maximumColorBias: number | null;
  maximumInkLightness: number | null;
}

function colorBias(reading: CellReading): number {
  return Math.abs(reading.image.inkGreen - reading.image.inkRed);
}

function inkLightness(reading: CellReading): number {
  return (reading.image.inkRed + reading.image.inkGreen + reading.image.inkBlue) / 3;
}

function separatedThreshold(
  values: readonly number[],
  minimumGap: number,
  minimumUpperValue = Number.NEGATIVE_INFINITY
): number | null {
  const sorted = [...values].sort((left, right) => left - right);
  let best: { gap: number; threshold: number } | null = null;
  for (let index = 7; index <= sorted.length - 3; index += 1) {
    const lower = sorted[index - 1];
    const upper = sorted[index];
    const gap = upper - lower;
    if (upper < minimumUpperValue || gap < minimumGap || (best && gap <= best.gap)) continue;
    best = { gap, threshold: (lower + upper) / 2 };
  }
  return best?.threshold ?? null;
}

function dominantGlyphStyle(readings: readonly CellReading[]): GlyphStyle | null {
  const reliable = readings.filter((reading) => reading.value !== null && reading.confidence >= 85);
  if (reliable.length < 8) return null;
  let bestHeight = 0;
  let bestSupport = 0;
  for (const reading of reliable) {
    const height = reading.image.componentHeight;
    const support = reliable
      .filter((candidate) => Math.abs(candidate.image.componentHeight - height) <= 3)
      .reduce((total, candidate) => total + candidate.confidence, 0);
    if (support > bestSupport) {
      bestHeight = height;
      bestSupport = support;
    }
  }
  const heightTolerance = Math.max(4, Math.round(bestHeight * 0.09));
  const matching = reliable.filter((reading) =>
    Math.abs(reading.image.componentHeight - bestHeight) <= heightTolerance
  ).length;
  if (matching < 8 || matching < reliable.length * 0.45) return null;

  // Solve work often differs from printed clues in hue (coloured ink) or darkness
  // (pencil). Only split a style when both groups have enough examples and a clear gap.
  const heightMatches = readings.filter((reading) =>
    reading.value !== null &&
    Math.abs(reading.image.componentHeight - bestHeight) <= heightTolerance
  );
  const maximumColorBias = separatedThreshold(
    heightMatches.map(colorBias),
    8,
    30
  );
  const monochromeMatches = maximumColorBias === null
    ? heightMatches
    : heightMatches.filter((reading) => colorBias(reading) <= maximumColorBias);
  const maximumInkLightness = separatedThreshold(monochromeMatches.map(inkLightness), 16);
  return { height: bestHeight, heightTolerance, maximumColorBias, maximumInkLightness };
}

function matchesGlyphStyle(reading: CellReading, style: GlyphStyle): boolean {
  if (Math.abs(reading.image.componentHeight - style.height) > style.heightTolerance) return false;
  if (style.maximumColorBias !== null && colorBias(reading) > style.maximumColorBias) return false;
  if (style.maximumInkLightness !== null && inkLightness(reading) > style.maximumInkLightness) return false;
  return true;
}

export async function recognizeSudokuPhoto(
  file: File,
  onProgress: (progress: PhotoRecognitionProgress) => void = () => {}
): Promise<PhotoRecognitionResult> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose an image captured as a photo.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  onProgress({ phase: 'preparing', completed: 0, total: 1 });
  const source = await decodePhoto(file);
  const context = source.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser cannot inspect the selected photo.');
  const sourceImage = context.getImageData(0, 0, source.width, source.height);
  const sourceGray = grayscale(sourceImage);
  onProgress({ phase: 'finding-grid', completed: 0, total: 1 });
  const dark = adaptiveDark(sourceGray, source.width, source.height);
  const quadrilateral = findGridQuadrilateral(dark, source.width, source.height);
  if (!quadrilateral) {
    throw new Error('No complete Sudoku grid was found. Fill the frame with one straight, well-lit puzzle and try again.');
  }
  const warped = warpGrid(sourceGray, sourceImage, perspectiveCoefficients(quadrilateral));
  const cells = cellImages(warped);
  if (cells.length < 10) {
    throw new Error('Too few printed digits were found. Move closer, avoid shadows, and try again.');
  }
  onProgress({ phase: 'loading-reader', completed: 0, total: 1 });
  const reader = await createDigitReader();
  const values = Array<Digit | null>(81).fill(null);
  const confidence = Array<number>(81).fill(100);
  const uncertain = new Set<number>();
  const readings: CellReading[] = [];
  try {
    for (let index = 0; index < cells.length; index += 1) {
      onProgress({ phase: 'reading-digits', completed: index, total: cells.length });
      const result = await reader.recognize(cells[index].canvas);
      const match = result.data.text.match(/[1-9]/);
      readings.push({
        image: cells[index],
        value: match ? Number(match[0]) as Digit : null,
        confidence: match ? Math.max(0, Math.min(100, result.data.confidence)) : 0
      });
    }
  } finally {
    await reader.terminate();
  }
  const glyphStyle = dominantGlyphStyle(readings);
  for (const reading of readings) {
    const cell = reading.image.cell;
    values[cell] = reading.value;
    confidence[cell] = reading.confidence;
    const mismatchedGlyph = glyphStyle !== null && !matchesGlyphStyle(reading, glyphStyle);
    // Tesseract is consistently cautious about a narrow printed 1 even when its style matches.
    const lowConfidence = reading.confidence < 72 && !(reading.value === 1 && reading.confidence >= 25);
    if (reading.value === null || lowConfidence || mismatchedGlyph) uncertain.add(cell);
  }
  onProgress({ phase: 'reading-digits', completed: cells.length, total: cells.length });
  return {
    values,
    confidence,
    uncertainCells: [...uncertain],
    detectedCellCount: glyphStyle
      ? readings.filter((reading) => matchesGlyphStyle(reading, glyphStyle)).length
      : cells.length,
    previewDataUrl: previewDataUrl(warped.gray)
  };
}
