export interface Point {
  x: number;
  y: number;
}

export interface GridQuadrilateral {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

interface ComponentCandidate {
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

function quadrilateralArea(quad: GridQuadrilateral): number {
  const points = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft];
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

interface LineFamily {
  normalX: number;
  normalY: number;
  first: number;
  last: number;
  score: number;
}

interface GridLine {
  normalX: number;
  normalY: number;
  rho: number;
}

function strongestNineCellSpan(
  dark: Uint8Array,
  width: number,
  height: number,
  quad: GridQuadrilateral,
  direction: Point,
  approximateSpan: number
): LineFamily | null {
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1) return null;
  const baseAngle = Math.atan2(direction.y / length, direction.x / length) + Math.PI / 2;
  const minX = Math.max(0, Math.floor(Math.min(quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(quad.topLeft.x, quad.topRight.x, quad.bottomRight.x, quad.bottomLeft.x)));
  const minY = Math.max(0, Math.floor(Math.min(quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(quad.topLeft.y, quad.topRight.y, quad.bottomRight.y, quad.bottomLeft.y)));
  const minSpacing = Math.max(8, Math.floor(approximateSpan / 13));
  const maxSpacing = Math.ceil(approximateSpan / 7);
  let best: LineFamily | null = null;

  for (let offset = -4; offset <= 4; offset += 1) {
    const angle = baseAngle + offset * Math.PI / 360;
    const normalX = Math.cos(angle);
    const normalY = Math.sin(angle);
    const cornerRhos = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
      .map((point) => point.x * normalX + point.y * normalY);
    const rhoMin = Math.floor(Math.min(...cornerRhos)) - 4;
    const rhoMax = Math.ceil(Math.max(...cornerRhos)) + 4;
    const histogram = new Uint32Array(rhoMax - rhoMin + 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!dark[y * width + x]) continue;
        const index = Math.round(x * normalX + y * normalY) - rhoMin;
        if (index >= 0 && index < histogram.length) histogram[index] += 1;
      }
    }
    const strength = new Uint32Array(histogram.length);
    for (let index = 0; index < histogram.length; index += 1) {
      for (let delta = -2; delta <= 2; delta += 1) {
        const neighbor = index + delta;
        if (neighbor >= 0 && neighbor < histogram.length) strength[index] += histogram[neighbor];
      }
    }
    for (let spacing = minSpacing; spacing <= maxSpacing; spacing += 1) {
      for (let start = 0; start + spacing * 9 < strength.length; start += 1) {
        let total = 0;
        let weakest = Number.POSITIVE_INFINITY;
        for (let line = 0; line <= 9; line += 1) {
          const value = strength[start + line * spacing];
          total += value;
          weakest = Math.min(weakest, value);
        }
        const score = total + weakest * 4;
        if (!best || score > best.score) {
          best = {
            normalX,
            normalY,
            first: start + rhoMin,
            last: start + spacing * 9 + rhoMin,
            score
          };
        }
      }
    }
  }
  return best;
}

function refineGridLine(
  dark: Uint8Array,
  width: number,
  height: number,
  coarse: GridQuadrilateral,
  family: LineFamily,
  rho: number
): GridLine {
  const minX = Math.max(0, Math.floor(Math.min(coarse.topLeft.x, coarse.topRight.x, coarse.bottomRight.x, coarse.bottomLeft.x)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(coarse.topLeft.x, coarse.topRight.x, coarse.bottomRight.x, coarse.bottomLeft.x)));
  const minY = Math.max(0, Math.floor(Math.min(coarse.topLeft.y, coarse.topRight.y, coarse.bottomRight.y, coarse.bottomLeft.y)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(coarse.topLeft.y, coarse.topRight.y, coarse.bottomRight.y, coarse.bottomLeft.y)));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const anchorOffset = rho - center.x * family.normalX - center.y * family.normalY;
  const anchor = {
    x: center.x + family.normalX * anchorOffset,
    y: center.y + family.normalY * anchorOffset
  };
  const baseAngle = Math.atan2(family.normalY, family.normalX);
  const searchRadius = Math.max(3, Math.floor(Math.abs(family.last - family.first) / 24));
  let best: (GridLine & { score: number }) | null = null;
  for (let offset = -12; offset <= 12; offset += 1) {
    const angle = baseAngle + offset * Math.PI / 360;
    const normalX = Math.cos(angle);
    const normalY = Math.sin(angle);
    const expectedRho = anchor.x * normalX + anchor.y * normalY;
    const histogram = new Map<number, number>();
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!dark[y * width + x]) continue;
        const projected = Math.round(x * normalX + y * normalY);
        histogram.set(projected, (histogram.get(projected) ?? 0) + 1);
      }
    }
    for (let delta = -searchRadius; delta <= searchRadius; delta += 1) {
      const candidateRho = expectedRho + delta;
      let score = 0;
      for (let band = -2; band <= 2; band += 1) score += histogram.get(Math.round(candidateRho) + band) ?? 0;
      if (!best || score > best.score) best = { normalX, normalY, rho: candidateRho, score };
    }
  }
  return best ?? { normalX: family.normalX, normalY: family.normalY, rho };
}

function lineIntersection(a: GridLine, b: GridLine): Point | null {
  const determinant = a.normalX * b.normalY - b.normalX * a.normalY;
  if (Math.abs(determinant) < 1e-6) return null;
  return {
    x: (a.rho * b.normalY - b.rho * a.normalY) / determinant,
    y: (a.normalX * b.rho - b.normalX * a.rho) / determinant
  };
}

/** Refines a coarse connected-component outline to the outer lines of its 9×9 lattice. */
export function refineGridQuadrilateral(
  dark: Uint8Array,
  width: number,
  height: number,
  coarse: GridQuadrilateral
): GridQuadrilateral {
  const horizontalDirection = {
    x: (coarse.topRight.x - coarse.topLeft.x) + (coarse.bottomRight.x - coarse.bottomLeft.x),
    y: (coarse.topRight.y - coarse.topLeft.y) + (coarse.bottomRight.y - coarse.bottomLeft.y)
  };
  const verticalDirection = {
    x: (coarse.bottomLeft.x - coarse.topLeft.x) + (coarse.bottomRight.x - coarse.topRight.x),
    y: (coarse.bottomLeft.y - coarse.topLeft.y) + (coarse.bottomRight.y - coarse.topRight.y)
  };
  const horizontalSpan = (distance(coarse.topLeft, coarse.bottomLeft) + distance(coarse.topRight, coarse.bottomRight)) / 2;
  const verticalSpan = (distance(coarse.topLeft, coarse.topRight) + distance(coarse.bottomLeft, coarse.bottomRight)) / 2;
  const horizontal = strongestNineCellSpan(dark, width, height, coarse, horizontalDirection, horizontalSpan);
  const vertical = strongestNineCellSpan(dark, width, height, coarse, verticalDirection, verticalSpan);
  if (!horizontal || !vertical) return coarse;

  const horizontalFirst = refineGridLine(dark, width, height, coarse, horizontal, horizontal.first);
  const horizontalLast = refineGridLine(dark, width, height, coarse, horizontal, horizontal.last);
  const verticalFirst = refineGridLine(dark, width, height, coarse, vertical, vertical.first);
  const verticalLast = refineGridLine(dark, width, height, coarse, vertical, vertical.last);

  const intersections = [
    lineIntersection(horizontalFirst, verticalFirst),
    lineIntersection(horizontalFirst, verticalLast),
    lineIntersection(horizontalLast, verticalFirst),
    lineIntersection(horizontalLast, verticalLast)
  ];
  if (intersections.some((point) => !point)) return coarse;
  const points = intersections as Point[];
  const bySum = [...points].sort((a, b) => a.x + a.y - b.x - b.y);
  const byDifference = [...points].sort((a, b) => b.x - b.y - (a.x - a.y));
  const refined = {
    topLeft: bySum[0],
    topRight: byDifference[0],
    bottomRight: bySum[3],
    bottomLeft: byDifference[3]
  };
  if ([refined.topLeft, refined.topRight, refined.bottomRight, refined.bottomLeft]
    .some((point) => point.x < 0 || point.x >= width || point.y < 0 || point.y >= height)) return coarse;
  return refined;
}

function validGridShape(candidate: ComponentCandidate, width: number, height: number): boolean {
  const boxWidth = candidate.maxX - candidate.minX + 1;
  const boxHeight = candidate.maxY - candidate.minY + 1;
  if (boxWidth < width * 0.22 || boxHeight < height * 0.22) return false;
  const ratio = boxWidth / boxHeight;
  if (ratio < 0.58 || ratio > 1.72) return false;
  const quad = candidate as GridQuadrilateral;
  const sides = [
    distance(quad.topLeft, quad.topRight),
    distance(quad.topRight, quad.bottomRight),
    distance(quad.bottomRight, quad.bottomLeft),
    distance(quad.bottomLeft, quad.topLeft)
  ];
  if (Math.min(...sides) < Math.max(...sides) * 0.42) return false;
  return quadrilateralArea(quad) > width * height * 0.045;
}

/**
 * Finds the connected square lattice in a thresholded photograph. The input
 * uses 1 for dark ink and 0 for paper. A one-pixel dilation is performed while
 * traversing so small compression gaps in printed grid lines remain connected.
 */
export function findGridQuadrilateral(dark: Uint8Array, width: number, height: number): GridQuadrilateral | null {
  if (dark.length !== width * height || width < 32 || height < 32) return null;
  const expanded = new Uint8Array(dark.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!dark[index]) continue;
      for (let dy = -1; dy <= 1; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nextX = x + dx;
          if (nextX >= 0 && nextX < width) expanded[nextY * width + nextX] = 1;
        }
      }
    }
  }

  const visited = new Uint8Array(dark.length);
  const queue = new Int32Array(dark.length);
  let best: { candidate: ComponentCandidate; score: number } | null = null;

  for (let start = 0; start < expanded.length; start += 1) {
    if (!expanded[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const startX = start % width;
    const startY = Math.floor(start / width);
    const candidate: ComponentCandidate = {
      count: 0,
      minX: startX,
      minY: startY,
      maxX: startX,
      maxY: startY,
      topLeft: { x: startX, y: startY },
      topRight: { x: startX, y: startY },
      bottomRight: { x: startX, y: startY },
      bottomLeft: { x: startX, y: startY }
    };
    let minimumSum = startX + startY;
    let maximumSum = minimumSum;
    let maximumDifference = startX - startY;
    let minimumDifference = maximumDifference;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = Math.floor(index / width);
      candidate.count += 1;
      candidate.minX = Math.min(candidate.minX, x);
      candidate.minY = Math.min(candidate.minY, y);
      candidate.maxX = Math.max(candidate.maxX, x);
      candidate.maxY = Math.max(candidate.maxY, y);
      const sum = x + y;
      const difference = x - y;
      if (sum < minimumSum) { minimumSum = sum; candidate.topLeft = { x, y }; }
      if (sum > maximumSum) { maximumSum = sum; candidate.bottomRight = { x, y }; }
      if (difference > maximumDifference) { maximumDifference = difference; candidate.topRight = { x, y }; }
      if (difference < minimumDifference) { minimumDifference = difference; candidate.bottomLeft = { x, y }; }

      for (let dy = -1; dy <= 1; dy += 1) {
        const nextY = y + dy;
        if (nextY < 0 || nextY >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextX = x + dx;
          if (nextX < 0 || nextX >= width) continue;
          const next = nextY * width + nextX;
          if (expanded[next] && !visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }

    if (!validGridShape(candidate, width, height)) continue;
    const boxArea = (candidate.maxX - candidate.minX + 1) * (candidate.maxY - candidate.minY + 1);
    const fill = candidate.count / boxArea;
    if (fill < 0.012 || fill > 0.48) continue;
    const squarePenalty = Math.min(
      (candidate.maxX - candidate.minX + 1) / (candidate.maxY - candidate.minY + 1),
      (candidate.maxY - candidate.minY + 1) / (candidate.maxX - candidate.minX + 1)
    );
    const score = quadrilateralArea(candidate) * squarePenalty;
    if (!best || score > best.score) best = { candidate, score };
  }

  if (!best) return null;
  const { topLeft, topRight, bottomRight, bottomLeft } = best.candidate;
  return refineGridQuadrilateral(dark, width, height, { topLeft, topRight, bottomRight, bottomLeft });
}

function solveLinearSystem(matrix: number[][]): number[] {
  const size = matrix.length;
  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row;
    }
    [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]];
    const divisor = matrix[pivot][pivot];
    if (Math.abs(divisor) < 1e-10) throw new Error('The photographed grid is too distorted to straighten.');
    for (let column = pivot; column <= size; column += 1) matrix[pivot][column] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = matrix[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        matrix[row][column] -= factor * matrix[pivot][column];
      }
    }
  }
  return matrix.map((row) => row[size]);
}

/** Returns a normalized-square-to-source projective transform. */
export function perspectiveCoefficients(quad: GridQuadrilateral): number[] {
  const destinations: Array<[number, number, Point]> = [
    [0, 0, quad.topLeft],
    [1, 0, quad.topRight],
    [1, 1, quad.bottomRight],
    [0, 1, quad.bottomLeft]
  ];
  const equations: number[][] = [];
  for (const [u, v, source] of destinations) {
    equations.push([u, v, 1, 0, 0, 0, -u * source.x, -v * source.x, source.x]);
    equations.push([0, 0, 0, u, v, 1, -u * source.y, -v * source.y, source.y]);
  }
  return solveLinearSystem(equations);
}

export function projectPoint(coefficients: readonly number[], u: number, v: number): Point {
  const denominator = coefficients[6] * u + coefficients[7] * v + 1;
  return {
    x: (coefficients[0] * u + coefficients[1] * v + coefficients[2]) / denominator,
    y: (coefficients[3] * u + coefficients[4] * v + coefficients[5]) / denominator
  };
}
