import { DIFFICULTY_BY_ID } from '$lib/domain/difficulty';
import { isSolvedGrid, parseGrid } from '$lib/domain/sudoku';
import type { PuzzleDefinition, PuzzleDifficulty } from '$lib/domain/types';
import { solveLogically } from './logical-solver';
import { createPrng } from './prng';
import { countSolutions } from './solve';

export interface GenerationResult {
  puzzle: PuzzleDefinition;
  traceLength: number;
  attempts: number;
}

const RATED_BASES: Record<PuzzleDifficulty, { givens: string; solution: string }> = {
  foundations: {
    givens: '.4..3.58..7.185..48...2.6....294387.49.6782......1.34..8..54.9.52.39..6.9.7....52',
    solution: '249736581376185924815429637152943876493678215768512349681254793524397168937861452'
  },
  intermediate: {
    givens: '3........2....8.47.4.26..898....7..5473..6......8.94.3......9..6...127.89.17..65.',
    solution: '389574216216398547547261389892437165473156892165829473738645921654912738921783654'
  },
  advanced: {
    givens: '21...5...4.8.2..9........1..7...15.....7.3.....125.8..1.46...57....3...43......62',
    solution: '216975438438126795795348216873461529529783641641259873184692357962537184357814962'
  },
  expert: {
    givens: '..521.48....4...59.........8.2....6.5..9...2....18.3....984...6.5.....1.4...6....',
    solution: '965217483127438659348695271812354967534976128796182345279841536653729814481563792'
  },
  master: {
    givens: '.9.8.......6.5..2.1....4...7...3..9..4...2.....89..6..3.7......4...29.3......71..',
    solution: '294876513876153924153294786762538491941762358538941672387415269415629837629387145'
  }
};

function shuffledUnitIndexes(random: ReturnType<typeof createPrng>): number[] {
  return random.shuffle([0, 1, 2]).flatMap((group) =>
    random.shuffle([0, 1, 2]).map((index) => group * 3 + index)
  );
}

function transformBase(
  base: { givens: string; solution: string },
  transformSeed: string
): { givens: string; solution: string } {
  const random = createPrng(transformSeed);
  const rows = shuffledUnitIndexes(random);
  const columns = shuffledUnitIndexes(random);
  const transpose = random.next() < 0.5;
  const shuffledDigits = random.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const digitMap = Object.fromEntries(shuffledDigits.map((digit, index) => [String(index + 1), String(digit)]));
  const transform = (grid: string): string => Array.from({ length: 81 }, (_, cell) => {
    const row = Math.floor(cell / 9);
    const column = cell % 9;
    const source = transpose
      ? columns[column] * 9 + rows[row]
      : rows[row] * 9 + columns[column];
    const value = grid[source];
    return value === '.' ? '.' : digitMap[value];
  }).join('');
  return { givens: transform(base.givens), solution: transform(base.solution) };
}

function puzzleId(difficulty: PuzzleDifficulty, seed: string): string {
  let hash = 0x811c9dc5;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${difficulty}-v2-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function validatePuzzle(puzzle: PuzzleDefinition): boolean {
  if (!isSolvedGrid(parseGrid(puzzle.solution))) return false;
  if ([...puzzle.givens].some((value, cell) => value !== '.' && value !== puzzle.solution[cell])) {
    return false;
  }
  if (countSolutions(puzzle.givens) !== 1) return false;
  const logical = solveLogically(puzzle.givens, {
    maxDifficulty: puzzle.difficulty === 'custom' ? 'master' : puzzle.difficulty
  });
  return logical.solved && logical.grid === puzzle.solution &&
    (puzzle.generatorVersion === 1 || logical.difficulty === puzzle.difficulty);
}

export function generatePuzzle(
  difficulty: PuzzleDifficulty,
  seed: string,
  maxAttempts = 32
): GenerationResult {
  const level = DIFFICULTY_BY_ID[difficulty];
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptSeed = `${seed}:${difficulty}:${attempt}`;
    const { givens, solution } = transformBase(RATED_BASES[difficulty], attemptSeed);
    const clueCount = givens.replaceAll('.', '').length;
    if (clueCount < level.clueRange[0] || clueCount > level.clueRange[1]) continue;
    const logical = solveLogically(givens, { maxDifficulty: difficulty });
    if (!logical.solved || logical.grid !== solution || logical.difficulty !== difficulty) continue;
    const puzzle: PuzzleDefinition = {
      id: puzzleId(difficulty, attemptSeed),
      givens,
      solution,
      difficulty,
      seed,
      generatorVersion: 2,
      validatorVersion: 2,
      hardestTechnique: logical.hardestTechnique,
      provenance: { kind: 'generated', seed, generatorVersion: 2 }
    };
    if (validatePuzzle(puzzle)) return { puzzle, traceLength: logical.steps.length, attempts: attempt + 1 };
  }
  throw new Error(`Could not generate a ${level.label} puzzle yet`);
}

export function generateEasyPuzzle(seed: string, maxAttempts = 8): GenerationResult {
  return generatePuzzle('foundations', seed, maxAttempts);
}
