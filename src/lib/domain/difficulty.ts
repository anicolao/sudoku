import type { PuzzleDifficulty, SolveTechnique } from './types';

export interface DifficultyLevel {
  id: PuzzleDifficulty;
  label: string;
  chapter: number;
  summary: string;
  techniques: readonly SolveTechnique[];
  clueRange: readonly [minimum: number, maximum: number];
}

export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = [
  {
    id: 'foundations',
    label: 'Foundations',
    chapter: 1,
    summary: 'Full houses and singles',
    techniques: ['naked-single', 'hidden-single'],
    clueRange: [40, 46]
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    chapter: 2,
    summary: 'Pairs and intersections',
    techniques: ['naked-pair', 'hidden-pair', 'pointing-pair', 'box-line-reduction'],
    clueRange: [32, 39]
  },
  {
    id: 'advanced',
    label: 'Advanced',
    chapter: 3,
    summary: 'Triples, fish, and Y-Wings',
    techniques: ['naked-triple', 'hidden-triple', 'x-wing', 'swordfish', 'y-wing'],
    clueRange: [27, 34]
  },
  {
    id: 'expert',
    label: 'Expert',
    chapter: 4,
    summary: 'Colors, chains, and uniqueness',
    techniques: ['single-digit-chain', 'simple-colors', 'xy-chain', 'medusa', 'unique-rectangle'],
    clueRange: [24, 31]
  },
  {
    id: 'master',
    label: 'Master',
    chapter: 5,
    summary: 'Multi-technique synthesis',
    techniques: [],
    clueRange: [22, 28]
  }
] as const;

export const DIFFICULTY_BY_ID = Object.fromEntries(
  DIFFICULTY_LEVELS.map((level) => [level.id, level])
) as Record<PuzzleDifficulty, DifficultyLevel>;

export const DIFFICULTY_RANK = Object.fromEntries(
  DIFFICULTY_LEVELS.map((level, index) => [level.id, index])
) as Record<PuzzleDifficulty, number>;

export const TECHNIQUE_DIFFICULTY = Object.fromEntries(
  DIFFICULTY_LEVELS.flatMap((level) => level.techniques.map((technique) => [technique, level.id]))
) as Record<SolveTechnique, Exclude<PuzzleDifficulty, 'master'>>;

export function normalizeDifficulty(value: string): PuzzleDifficulty {
  return value === 'easy' ? 'foundations' : value in DIFFICULTY_BY_ID
    ? value as PuzzleDifficulty
    : 'foundations';
}

export const difficultyLabel = (value: string): string =>
  DIFFICULTY_BY_ID[normalizeDifficulty(value)].label;
