// Board-cell coordinates, shared by the interactive board and vector printouts.
// Leave room above the top edge for the upper half of a cage sum.
export const CAGE_TOP_INSET = .12;

type Point = [number, number];
type Edge = { start: Point; end: Point; direction: number };
const key = ([x, y]: Point) => `${x},${y}`;
const equal = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
const direction = (a: Point, b: Point): Point => [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])];
const rounded = (n: number) => Math.round(n * 1000) / 1000;

export function cageContours(cells: number[], inset = .08, topInset = inset): Point[][] {
  const occupied = new Set(cells);
  const edges: Edge[] = [];
  for (const cell of cells) {
    const x = cell % 9, y = Math.floor(cell / 9);
    if (!occupied.has(cell - 9)) edges.push({ start: [x, y], end: [x + 1, y], direction: 0 });
    if (x === 8 || !occupied.has(cell + 1)) edges.push({ start: [x + 1, y], end: [x + 1, y + 1], direction: 1 });
    if (!occupied.has(cell + 9)) edges.push({ start: [x + 1, y + 1], end: [x, y + 1], direction: 2 });
    if (x === 0 || !occupied.has(cell - 1)) edges.push({ start: [x, y + 1], end: [x, y], direction: 3 });
  }
  const outgoing = new Map<string, Edge[]>();
  for (const edge of edges) outgoing.set(key(edge.start), [...outgoing.get(key(edge.start)) ?? [], edge]);
  const unused = new Set(edges);
  const contours: Point[][] = [];
  for (const first of edges) {
    if (!unused.has(first)) continue;
    const vertices: Point[] = [];
    let edge = first;
    do {
      vertices.push(edge.start);
      unused.delete(edge);
      // Keep the cage on our right, including where two boundary loops touch.
      const choices = outgoing.get(key(edge.end))!;
      const priority = (next: Edge) => [1, 0, 3, 2].indexOf((next.direction - edge.direction + 4) % 4);
      const next = choices.filter(candidate => unused.has(candidate) || candidate === first).sort((a, b) => priority(a) - priority(b))[0];
      if (!next) throw new Error('Cage boundary is not closed');
      edge = next;
    } while (edge !== first);
    const corners = vertices.filter((point, i) => !equal(
      direction(vertices[(i + vertices.length - 1) % vertices.length], point),
      direction(point, vertices[(i + 1) % vertices.length])
    ));
    contours.push(corners.map((point, i) => {
      const before = direction(corners[(i + corners.length - 1) % corners.length], point);
      const after = direction(point, corners[(i + 1) % corners.length]);
      const offsetY = (dx: number) => dx * (dx > 0 ? topInset : inset);
      return [
        rounded(point[0] - inset * (before[1] + after[1])),
        rounded(point[1] + offsetY(before[0]) + offsetY(after[0]))
      ];
    }));
  }
  return contours;
}

export function cagePaths(cells: number[]): { outline: string; corners: string } {
  const outlines: string[] = [], turns: string[] = [];
  for (const contour of cageContours(cells, .08, CAGE_TOP_INSET)) {
    const arcs = contour.map((point, i) => {
      const before = direction(contour[(i + contour.length - 1) % contour.length], point);
      const after = direction(point, contour[(i + 1) % contour.length]);
      const start: Point = [rounded(point[0] - before[0] * .04), rounded(point[1] - before[1] * .04)];
      const end: Point = [rounded(point[0] + after[0] * .04), rounded(point[1] + after[1] * .04)];
      return { start: start.join(' '), curve: `Q ${point.join(' ')} ${end.join(' ')}` };
    });
    outlines.push(arcs.map((arc, i) => `${i ? 'L' : 'M'} ${arc.start} ${arc.curve}`).join(' ') + ' Z');
    // A dash gap must never erase a corner, especially a concave one.
    turns.push(...arcs.map(arc => `M ${arc.start} ${arc.curve}`));
  }
  return { outline: outlines.join(' '), corners: turns.join(' ') };
}
