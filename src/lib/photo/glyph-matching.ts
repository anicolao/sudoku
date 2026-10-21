export const GLYPH_SIZE = 28;

/** Center a glyph while retaining its aspect ratio. */
export function normalizeGlyph(canvas: HTMLCanvasElement): number[] {
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, right = -1, top = canvas.height, bottom = -1;
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    if (data[(y * canvas.width + x) * 4] < 128) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return Array(GLYPH_SIZE ** 2).fill(0);
  const normalized = document.createElement('canvas'); normalized.width = normalized.height = GLYPH_SIZE;
  const target = normalized.getContext('2d', { willReadFrequently: true })!;
  target.fillStyle = 'white'; target.fillRect(0, 0, GLYPH_SIZE, GLYPH_SIZE);
  const scale = 22 / Math.max(right - left + 1, bottom - top + 1);
  const width = (right - left + 1) * scale, height = (bottom - top + 1) * scale;
  target.drawImage(canvas, left, top, right - left + 1, bottom - top + 1, (GLYPH_SIZE - width) / 2, (GLYPH_SIZE - height) / 2, width, height);
  const output = target.getImageData(0, 0, GLYPH_SIZE, GLYPH_SIZE).data;
  return Array.from({ length: GLYPH_SIZE ** 2 }, (_, i) => output[i * 4] < 180 ? 1 : 0);
}

const fields = new WeakMap<readonly number[], number[]>();
function distanceField(pixels: readonly number[]): number[] {
  const cached = fields.get(pixels);
  if (cached) return cached;
  const field: number[] = pixels.map((value) => value ? 0 : 100);
  for (let y = 0; y < GLYPH_SIZE; y++) for (let x = 0; x < GLYPH_SIZE; x++) {
    const i = y * GLYPH_SIZE + x;
    if (x > 0) field[i] = Math.min(field[i], field[i - 1] + 1);
    if (y > 0) field[i] = Math.min(field[i], field[i - GLYPH_SIZE] + 1);
  }
  for (let y = GLYPH_SIZE - 1; y >= 0; y--) for (let x = GLYPH_SIZE - 1; x >= 0; x--) {
    const i = y * GLYPH_SIZE + x;
    if (x + 1 < GLYPH_SIZE) field[i] = Math.min(field[i], field[i + 1] + 1);
    if (y + 1 < GLYPH_SIZE) field[i] = Math.min(field[i], field[i + GLYPH_SIZE] + 1);
  }
  fields.set(pixels, field);
  return field;
}
export function glyphDistance(a: readonly number[], b: readonly number[]): number {
  const af = distanceField(a), bf = distanceField(b);
  let ac = 0, bc = 0, ad = 0, bd = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]) { ac++; ad += bf[i]; }
    if (b[i]) { bc++; bd += af[i]; }
  }
  return ac && bc ? (ad / ac + bd / bc) / 2 : 100;
}
