import type { Digit } from '$lib/domain/types';

export interface StylusPoint {
  x: number;
  y: number;
}

export type StylusStroke = StylusPoint[];

export interface StylusDigitRecognition {
  digit: Digit | null;
  confidence: number;
  distance: number;
}

interface Shape {
  points: StylusPoint[];
  aspect: number;
  strokeCount: number;
}

interface Template extends Shape {
  digit: Digit;
}

const RAW_TEMPLATES: Array<{ digit: Digit; strokes: StylusStroke[] }> = [
  { digit: 1, strokes: [[{ x: .5, y: .04 }, { x: .5, y: .96 }]] },
  { digit: 1, strokes: [[{ x: .26, y: .23 }, { x: .49, y: .04 }, { x: .49, y: .96 }], [{ x: .28, y: .96 }, { x: .72, y: .96 }]] },
  { digit: 2, strokes: [[{ x: .15, y: .24 }, { x: .25, y: .08 }, { x: .49, y: .02 }, { x: .73, y: .08 }, { x: .84, y: .25 }, { x: .78, y: .4 }, { x: .61, y: .56 }, { x: .2, y: .9 }, { x: .87, y: .9 }]] },
  { digit: 2, strokes: [[{ x: .18, y: .18 }, { x: .37, y: .03 }, { x: .65, y: .04 }, { x: .82, y: .2 }, { x: .78, y: .38 }, { x: .57, y: .57 }, { x: .19, y: .92 }, { x: .85, y: .92 }]] },
  { digit: 3, strokes: [[{ x: .18, y: .11 }, { x: .45, y: .02 }, { x: .7, y: .08 }, { x: .81, y: .25 }, { x: .74, y: .4 }, { x: .53, y: .49 }, { x: .72, y: .53 }, { x: .84, y: .7 }, { x: .78, y: .88 }, { x: .55, y: .98 }, { x: .23, y: .89 }]] },
  { digit: 3, strokes: [[{ x: .23, y: .08 }, { x: .54, y: .02 }, { x: .78, y: .16 }, { x: .75, y: .38 }, { x: .53, y: .49 }, { x: .77, y: .58 }, { x: .82, y: .81 }, { x: .62, y: .96 }, { x: .27, y: .9 }]] },
  { digit: 4, strokes: [[{ x: .68, y: .03 }, { x: .18, y: .65 }, { x: .88, y: .65 }], [{ x: .68, y: .03 }, { x: .68, y: .98 }]] },
  { digit: 4, strokes: [[{ x: .72, y: .04 }, { x: .21, y: .62 }, { x: .89, y: .62 }], [{ x: .7, y: .04 }, { x: .7, y: .96 }]] },
  { digit: 5, strokes: [[{ x: .82, y: .05 }, { x: .27, y: .05 }, { x: .21, y: .45 }, { x: .45, y: .4 }, { x: .7, y: .45 }, { x: .83, y: .63 }, { x: .79, y: .83 }, { x: .59, y: .97 }, { x: .32, y: .94 }, { x: .16, y: .8 }]] },
  { digit: 5, strokes: [[{ x: .8, y: .06 }, { x: .28, y: .06 }, { x: .23, y: .47 }, { x: .47, y: .41 }, { x: .72, y: .49 }, { x: .83, y: .7 }, { x: .7, y: .91 }, { x: .43, y: .97 }, { x: .19, y: .84 }]] },
  { digit: 6, strokes: [[{ x: .75, y: .08 }, { x: .52, y: .03 }, { x: .3, y: .19 }, { x: .18, y: .46 }, { x: .18, y: .73 }, { x: .32, y: .92 }, { x: .56, y: .97 }, { x: .77, y: .85 }, { x: .82, y: .64 }, { x: .7, y: .46 }, { x: .48, y: .4 }, { x: .27, y: .51 }, { x: .18, y: .7 }]] },
  { digit: 6, strokes: [[{ x: .72, y: .07 }, { x: .46, y: .06 }, { x: .25, y: .27 }, { x: .17, y: .57 }, { x: .23, y: .83 }, { x: .43, y: .97 }, { x: .68, y: .92 }, { x: .82, y: .72 }, { x: .76, y: .5 }, { x: .56, y: .4 }, { x: .31, y: .48 }, { x: .2, y: .67 }]] },
  { digit: 7, strokes: [[{ x: .12, y: .08 }, { x: .88, y: .08 }, { x: .55, y: .96 }]] },
  { digit: 7, strokes: [[{ x: .13, y: .07 }, { x: .87, y: .07 }, { x: .52, y: .96 }], [{ x: .35, y: .52 }, { x: .68, y: .52 }]] },
  { digit: 8, strokes: [[{ x: .51, y: .5 }, { x: .3, y: .42 }, { x: .21, y: .25 }, { x: .28, y: .08 }, { x: .49, y: .02 }, { x: .7, y: .09 }, { x: .79, y: .27 }, { x: .7, y: .43 }, { x: .51, y: .5 }, { x: .31, y: .58 }, { x: .2, y: .75 }, { x: .27, y: .92 }, { x: .5, y: .98 }, { x: .73, y: .91 }, { x: .81, y: .72 }, { x: .7, y: .56 }, { x: .51, y: .5 }]] },
  { digit: 8, strokes: [[{ x: .5, y: .49 }, { x: .3, y: .4 }, { x: .25, y: .2 }, { x: .38, y: .04 }, { x: .61, y: .04 }, { x: .75, y: .2 }, { x: .69, y: .4 }, { x: .5, y: .49 }], [{ x: .5, y: .49 }, { x: .29, y: .59 }, { x: .22, y: .79 }, { x: .38, y: .96 }, { x: .63, y: .96 }, { x: .79, y: .78 }, { x: .71, y: .58 }, { x: .5, y: .49 }]] },
  { digit: 9, strokes: [[{ x: .76, y: .49 }, { x: .58, y: .57 }, { x: .35, y: .52 }, { x: .22, y: .35 }, { x: .25, y: .15 }, { x: .44, y: .03 }, { x: .66, y: .08 }, { x: .78, y: .27 }, { x: .76, y: .49 }, { x: .73, y: .7 }, { x: .56, y: .96 }]] },
  { digit: 9, strokes: [[{ x: .75, y: .48 }, { x: .55, y: .58 }, { x: .31, y: .5 }, { x: .2, y: .29 }, { x: .3, y: .09 }, { x: .53, y: .03 }, { x: .73, y: .16 }, { x: .78, y: .4 }, { x: .75, y: .96 }]] }
];

function pathLength(stroke: StylusStroke): number {
  let length = 0;
  for (let index = 1; index < stroke.length; index += 1) {
    length += Math.hypot(stroke[index].x - stroke[index - 1].x, stroke[index].y - stroke[index - 1].y);
  }
  return length;
}

function normalize(strokes: StylusStroke[]): Shape | null {
  const usable = strokes
    .map((stroke) => stroke.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)))
    .filter((stroke) => stroke.length >= 2 && pathLength(stroke) > .015);
  if (!usable.length) return null;

  const source = usable.flat();
  const minX = Math.min(...source.map(({ x }) => x));
  const maxX = Math.max(...source.map(({ x }) => x));
  const minY = Math.min(...source.map(({ y }) => y));
  const maxY = Math.max(...source.map(({ y }) => y));
  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.max(width, height);
  if (size < .04) return null;

  const normalized = usable.map((stroke) => stroke.map(({ x, y }) => ({
    x: (x - (minX + maxX) / 2) / size,
    y: (y - (minY + maxY) / 2) / size
  })));
  const totalLength = normalized.reduce((total, stroke) => total + pathLength(stroke), 0);
  const spacing = 1 / 36;
  const points: StylusPoint[] = [];
  for (const stroke of normalized) {
    for (let index = 1; index < stroke.length; index += 1) {
      const from = stroke[index - 1];
      const to = stroke[index];
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const samples = Math.max(1, Math.ceil(distance / spacing));
      if (index === 1) points.push(from);
      for (let sample = 1; sample <= samples; sample += 1) {
        const ratio = sample / samples;
        points.push({
          x: from.x + (to.x - from.x) * ratio,
          y: from.y + (to.y - from.y) * ratio
        });
      }
    }
  }
  if (points.length < 5 || totalLength < .18) return null;
  return {
    points,
    aspect: Math.min(width, height) / Math.max(width, height),
    strokeCount: usable.length
  };
}

function nearestDistance(point: StylusPoint, candidates: StylusPoint[]): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    nearest = Math.min(nearest, Math.hypot(point.x - candidate.x, point.y - candidate.y));
  }
  return nearest;
}

function shapeDistance(input: Shape, template: Template): number {
  const inputToTemplate = input.points.reduce((sum, point) => sum + nearestDistance(point, template.points), 0) / input.points.length;
  const templateToInput = template.points.reduce((sum, point) => sum + nearestDistance(point, input.points), 0) / template.points.length;
  const aspectPenalty = Math.abs(input.aspect - template.aspect) * .12;
  const strokePenalty = Math.min(Math.abs(input.strokeCount - template.strokeCount), 2) * .012;
  return (inputToTemplate + templateToInput) / 2 + aspectPenalty + strokePenalty;
}

const TEMPLATES: Template[] = RAW_TEMPLATES.map(({ digit, strokes }) => {
  const shape = normalize(strokes);
  if (!shape) throw new Error(`Invalid stylus template for ${digit}`);
  return { digit, ...shape };
});

export function recognizeStylusDigit(strokes: StylusStroke[]): StylusDigitRecognition {
  const input = normalize(strokes);
  if (!input) return { digit: null, confidence: 0, distance: Number.POSITIVE_INFINITY };

  const byDigit = new Map<Digit, number>();
  for (const template of TEMPLATES) {
    const distance = shapeDistance(input, template);
    byDigit.set(template.digit, Math.min(byDigit.get(template.digit) ?? Number.POSITIVE_INFINITY, distance));
  }
  const ranked = [...byDigit.entries()].sort((left, right) => left[1] - right[1]);
  const [digit, distance] = ranked[0];
  const margin = ranked[1][1] - distance;
  const confidence = Math.max(0, Math.min(1, (1 - distance / .23) * .8 + Math.min(margin / .08, 1) * .2));
  const accepted = distance <= .2 && (margin >= .009 || distance <= .075);
  return { digit: accepted ? digit : null, confidence, distance };
}
