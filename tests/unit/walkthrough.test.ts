import { describe, expect, it } from 'vitest';
import type { Digit, GameImportedEvent, PuzzleDefinition, SudokuEvent } from '../../src/lib/domain/types';
import {
  buildSolveWalkthrough,
  buildSolveWalkthroughAsync,
  buildHumanSolveSequence,
  buildSolveHintVisualization,
  countSolveWalkthroughPlacements,
  findNextSolveHint,
  findNextVisualHint,
  type WalkthroughBuildProgress
} from '../../src/lib/domain/walkthrough';
import { generateEasyPuzzle } from '../../src/lib/generator/generate-puzzle';
import { solveLogically } from '../../src/lib/generator/logical-solver';
import { solveFirst } from '../../src/lib/generator/solve';
import { parseSharedPuzzlePayload } from '../../src/lib/sharing/puzzle-link';
import { replay } from '../../src/lib/domain/reducer';

const gameId = 'game-walkthrough';
const settings = {
  checkMistakes: false,
  autoRemoveNotes: true,
  showTimer: true,
  numberFirst: true,
  notesFirst: false
};
const envelope = (sequence: number) => ({
  id: `event-${sequence}`,
  sequence,
  gameId,
  occurredAt: `2026-08-16T12:${String(sequence).padStart(2, '0')}:00.000Z`,
  elapsedMs: sequence * 1_000,
  schemaVersion: 1 as const,
  reducerVersion: 1 as const
});
const startEvent = (puzzle: PuzzleDefinition): SudokuEvent => ({
  ...envelope(1),
  type: 'game/started',
  payload: { gameId, puzzle, settings }
});

describe('instructional solve walkthroughs', () => {
  it('finds the globally simplest next placement without changing the game', () => {
    const puzzle = generateEasyPuzzle('walkthrough-seed').puzzle;
    const game = replay([startEvent(puzzle)]).games[gameId];
    const before = structuredClone(game.values);

    const hint = findNextSolveHint(game);

    expect(hint).not.toBeNull();
    expect(hint?.rule).not.toBe('unknown-rule');
    expect(hint?.value).toBe(Number(puzzle.solution[hint?.targetCell ?? -1]));
    expect(puzzle.givens[hint?.targetCell ?? -1]).toBe('.');
    expect(game.values).toEqual(before);
  });

  it('prefers a Full House for the next hint when it is also a naked single', () => {
    const solution = '549371628826945371173628945654719283917283456382456719738562194491837562265194837';
    const puzzle: PuzzleDefinition = {
      id: 'full-house-hint-fixture',
      givens: `.${solution.slice(1)}`,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };

    const game = replay([startEvent(puzzle)]).games[gameId];
    const hint = findNextSolveHint(game);

    expect(hint).toMatchObject({
      targetCell: 0,
      value: 5,
      rule: 'full-house',
      ruleLabel: 'Full House'
    });
    if (!hint) throw new Error('Expected a full-house hint.');
    const visualization = buildSolveHintVisualization(game, hint);
    expect(visualization).toMatchObject({
      rule: 'full-house',
      targetCell: 0,
      patternCells: [1, 2, 3, 4, 5, 6, 7, 8],
      exclusionCells: [1, 2, 3, 4, 5, 6, 7, 8]
    });
    expect(visualization.candidateCells.flatMap(({ values }) => values)).not.toContain(5);
  });

  it('builds a complete human-ordered solve from the original givens', () => {
    const puzzle = generateEasyPuzzle('print-walkthrough-seed').puzzle;
    const game = replay([startEvent(puzzle)]).games[gameId];

    const sequence = buildHumanSolveSequence(game);
    const solved = [...puzzle.givens];
    for (const step of sequence) {
      expect(solved[step.targetCell]).toBe('.');
      expect(step.value).toBe(Number(puzzle.solution[step.targetCell]));
      solved[step.targetCell] = String(step.value);
    }

    expect(sequence).toHaveLength([...puzzle.givens].filter((value) => value === '.').length);
    expect(solved.join('')).toBe(puzzle.solution);
    expect(sequence[0]?.rule).toBe('full-house');
    expect(sequence.every((step) => step.rule !== 'unknown-rule')).toBe(true);
  });

  it('jumps only between placements and uses a book rule or Unknown rule for every move', () => {
    const puzzle = generateEasyPuzzle('walkthrough-seed').puzzle;
    const logical = solveLogically(puzzle.givens);
    const events: SudokuEvent[] = [startEvent(puzzle)];

    for (const step of logical.steps) {
      if (step.cell === undefined || step.value === undefined) continue;
      const sequence = events.length + 1;
      events.push({
        ...envelope(sequence),
        type: 'cell/value-entered',
        payload: { cell: step.cell, value: step.value }
      });
    }

    const walkthrough = buildSolveWalkthrough(events, gameId);
    expect(walkthrough.steps).toHaveLength(events.length - 1);
    expect(walkthrough.steps.every((step) => step.targetCell !== null)).toBe(true);
    expect(walkthrough.steps.every((step) => [
      'Full House', 'Naked Single', 'Hidden Single', 'Naked Pairs', 'Hidden Pairs',
      'Pointing Pairs', 'Y-Wing', 'X-Wing', 'Swordfish', 'Naked Triples',
      'Simple Colors', 'XY-Chains', 'Unique Rectangles', '3D Medusa', 'Unknown rule'
    ].includes(step.ruleLabel))).toBe(true);
    expect(walkthrough.steps.at(-1)?.game.status).toBe('complete');
    expect(walkthrough.steps.at(-1)?.explanation).toContain('completed the puzzle');
  });

  it('skips notes, undo, and correction events and marks an unproved placement Unknown rule', () => {
    const puzzle = generateEasyPuzzle('walkthrough-actions').puzzle;
    const cell = puzzle.givens.indexOf('.');
    const solution = Number(puzzle.solution[cell]) as Digit;
    const wrong = (solution === 9 ? 1 : solution + 1) as Digit;
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/note-toggled', payload: { cell, value: solution, enabled: true } },
      { ...envelope(3), type: 'move/undone', payload: { targetEventId: 'event-2' } },
      { ...envelope(4), type: 'cell/value-entered', payload: { cell, value: wrong } },
      { ...envelope(5), type: 'cell/value-erased', payload: { cell, value: wrong, targetEventId: 'event-4' } }
    ];

    const walkthrough = buildSolveWalkthrough(events, gameId);
    expect(walkthrough.steps).toHaveLength(1);
    expect(walkthrough.steps[0]).toMatchObject({
      eventId: 'event-4',
      rule: 'unknown-rule',
      ruleLabel: 'Unknown rule',
      targetCell: cell
    });
    expect(walkthrough.steps[0].explanation).toContain('no solving rule accounts');
  });

  it('prefers Full House when the placement is also a naked single', () => {
    const solution = '549371628826945371173628945654719283917283456382456719738562194491837562265194837';
    const puzzle: PuzzleDefinition = {
      id: 'full-house-fixture',
      givens: `.${solution.slice(1)}`,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 0, value: 5 } }
    ];

    expect(buildSolveWalkthrough(events, gameId).steps[0]).toMatchObject({
      rule: 'full-house',
      ruleLabel: 'Full House'
    });
  });

  it('finds the simplest advanced book rule that directly accounts for a placement', () => {
    const puzzle: PuzzleDefinition = {
      id: 'hidden-pairs-fixture',
      givens: '.....1...8.6.4.37..7...894.........39..2.3.56.82..67.973....1.4.9...75...6.194...',
      solution: '549371628826945371173628945654719283917283456382456719738562194491837562265194837',
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 20, value: 3 } }
    ];

    const step = buildSolveWalkthrough(events, gameId).steps[0];
    expect(step).toMatchObject({ rule: 'hidden-pair', ruleLabel: 'Hidden Pairs', targetCell: 20 });
    expect(step.contextCells).toContain(2);
    expect(step.explanation).toContain('simplest listed rule');
  });

  it('recognizes the fourth placement from the xwing.png walkthrough as an X-Wing', () => {
    const payload = '7.8.24....2.9....44.97.321...743...66...1...7...2.65..5.4..2..9.7..9.4...9.5.7682_954_548_657_21+13+_41+1289+_61+1389+_81+1238+_91+13+_41-1-_61-13-_81-13-_23+1356+_53+235+_63+13+_83+1236+_93+13+_23-13-_53-3-_83-13-_26+158+_46+59+_56+59+_26-5-_17+39+_27+378+_47+189+_57+39+_77+137+_27-3-_47-9-_77-3-_12+1356+_32+56+_12-56-_72+1368+_72-13-_74+136+_75+68+_74-6-_69+138+_69-3-_18+3569+_19+35+_28+3567+_39+58+_88+35+_89+135+_28-5-_39-5-_398';
    const { givens, work } = parseSharedPuzzlePayload(payload);
    const solution = solveFirst(givens);
    if (!solution) throw new Error('The xwing.png regression puzzle must have a solution.');
    const puzzle: PuzzleDefinition = {
      id: 'xwing-qr-regression',
      givens,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null,
      provenance: { kind: 'puzzle-link', formatVersion: 2, fingerprint: 'xwing-qr-regression' }
    };
    const events: SudokuEvent[] = [{
      ...envelope(1),
      type: 'game/imported',
      payload: {
        gameId,
        importKind: 'puzzle-link',
        transferId: null,
        puzzle,
        settings,
        checkpoint: null,
        work,
        initialView: 'walkthrough'
      }
    }];

    const step = buildSolveWalkthrough(events, gameId).steps[3];

    expect(step).toMatchObject({
      rule: 'x-wing',
      ruleLabel: 'X-Wing',
      targetCell: 26,
      explanation: 'The 5 X-Wing at r1c8, r1c9, r8c8, r8c9 eliminates 5 from r3c9, leaving 8.'
    });
    expect(step.contextCells).toEqual([7, 8, 70, 71]);

    const origin = events[0] as GameImportedEvent;
    const fourthPlacementIndex = work.flatMap((action, index) =>
      action.type === 'value' ? [index] : []
    )[3];
    const before = replay([{
      ...origin,
      payload: { ...origin.payload, work: work.slice(0, fourthPlacementIndex) }
    }]).games[gameId];
    const visualization = buildSolveHintVisualization(before, {
      targetCell: 26,
      value: 8,
      rule: 'x-wing',
      ruleLabel: 'X-Wing',
      explanation: step.explanation,
      contextCells: step.contextCells
    });

    expect(visualization.arrows).toHaveLength(4);
    expect(visualization.exclusionCells).toContain(26);
    expect(visualization.candidateCells.find(({ cell }) => cell === 26)).toMatchObject({
      values: [5, 8],
      excluded: [5]
    });
    expect(visualization.candidateCells
      .filter(({ cell }) => step.contextCells.includes(cell))
      .every(({ emphasized }) => emphasized.includes(5))).toBe(true);
  });

  it('falls back to the simplest visual elimination when no technique immediately places a value', () => {
    const payload = '.623948.7.3....2...7....4.3...1...3.6.9....42.......8.2..6..974....5.6.8.967.83..' +
      '_342_11+15+_18+15+_21+14589+_23+1458+_24+58+_25+1678+_26+1567+_28+1569+_29+1569+' +
      '_31+1589+_33+158+_35+168+_36+156+_38+1569+_41+4578+_42+2458+_43+4578+_45+24678+' +
      '_46+25679+_47+57+_49+569+_52+158+_54+58+_55+378+_56+357+_57+157+_61+13457+' +
      '_62+1245+_63+13457+_64+49+_65+23467+_66+235679+_67+157+_69+1569+_72+58+_73+58+' +
      '_75+13+_76+13+_81+37+_82+14+_83+37+_84+49+_86+129+_88+12+_91+14+_95+124+' +
      '_98+125+_99+15+_time=753688_mistakes=0_settings=01110011';
    const { givens, values, notes } = parseSharedPuzzlePayload(payload);
    const solution = solveFirst(givens);
    if (!solution) throw new Error('The shared visual-hint regression puzzle must have a solution.');
    const puzzle: PuzzleDefinition = {
      id: 'visual-elimination-regression',
      givens,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const game = replay([startEvent(puzzle)]).games[gameId];
    game.values = values;
    game.notes = notes;

    expect(findNextSolveHint(game)?.rule).toBe('unknown-rule');
    const hint = findNextVisualHint(game);
    expect(hint).toMatchObject({
      rule: 'naked-pair',
      ruleLabel: 'Naked Pairs',
      targetCell: 68,
      contextCells: [58, 59]
    });
    if (!hint) throw new Error('Expected a visual elimination hint.');

    const visualization = buildSolveHintVisualization(game, hint);
    expect(visualization.patternCells).toEqual([58, 59]);
    expect(visualization.exclusionCells).toEqual([68, 76]);
    expect(visualization.candidateCells.find(({ cell }) => cell === 68)).toMatchObject({
      values: [1, 2, 9],
      excluded: [1]
    });
  });

  it('draws every candidate link for an XY-Chain', () => {
    const puzzle: PuzzleDefinition = {
      id: 'xy-chain-visual-fixture',
      givens: '7..218.46.24.698......45...5...316...16.27593..3596..4...973.....168473....1524.9',
      solution: '735218946124369857689745321592431678416827593873596214248973165951684732367152489',
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const game = replay([startEvent(puzzle)]).games[gameId];
    const notesByCell: Record<number, Digit[]> = {
      1: [3, 5, 9], 2: [5, 9], 6: [3, 9], 9: [1, 3], 12: [3, 7],
      16: [1, 5, 7], 17: [1, 5, 7], 18: [1, 3, 6, 8, 9], 19: [3, 6, 8, 9],
      20: [8, 9], 21: [3, 7], 24: [3, 9], 25: [1, 2, 7], 26: [1, 2, 7],
      28: [4, 7, 8, 9], 29: [2, 7, 8, 9], 30: [4, 8], 34: [2, 7, 8],
      35: [2, 7, 8], 36: [4, 8], 39: [4, 8], 45: [2, 8], 46: [7, 8],
      51: [1, 2], 52: [1, 2, 7, 8], 54: [2, 4, 6, 8], 55: [4, 5, 6, 8],
      56: [2, 5, 8], 60: [1, 2], 61: [1, 2, 5, 6, 8], 62: [1, 2, 5, 8],
      63: [2, 9], 64: [5, 9], 71: [2, 5], 72: [3, 6, 8], 73: [3, 6, 7, 8],
      74: [7, 8], 79: [6, 8]
    };
    for (const [cell, values] of Object.entries(notesByCell)) game.notes[Number(cell)] = values;

    const visualization = buildSolveHintVisualization(game, {
      targetCell: 45,
      value: 8,
      rule: 'xy-chain',
      ruleLabel: 'XY-Chains',
      explanation: 'An XY-Chain eliminates 2 from r6c1, leaving 8.',
      contextCells: [51, 60, 71, 64, 63]
    });

    expect(visualization.patternCells).toEqual([51, 60, 71, 64, 63]);
    expect(visualization.arrows).toEqual([
      { fromCell: 51, toCell: 51, fromValue: 2, toValue: 1 },
      { fromCell: 51, toCell: 60, fromValue: 1, toValue: 1 },
      { fromCell: 60, toCell: 60, fromValue: 1, toValue: 2 },
      { fromCell: 60, toCell: 71, fromValue: 2, toValue: 2 },
      { fromCell: 71, toCell: 71, fromValue: 2, toValue: 5 },
      { fromCell: 71, toCell: 64, fromValue: 5, toValue: 5 },
      { fromCell: 64, toCell: 64, fromValue: 5, toValue: 9 },
      { fromCell: 64, toCell: 63, fromValue: 9, toValue: 9 },
      { fromCell: 63, toCell: 63, fromValue: 9, toValue: 2 }
    ]);
    expect(visualization.candidateCells
      .filter(({ cell }) => visualization.patternCells.includes(cell))
      .every(({ values, emphasized }) => values.length === 2 && emphasized.length === 2)).toBe(true);
    expect(visualization.candidateCells.find(({ cell }) => cell === 45)).toMatchObject({
      values: [2, 8],
      excluded: [2]
    });
  });

  it('keeps a destination that is an XY-Chain endpoint in the complete chain', () => {
    const puzzle: PuzzleDefinition = {
      id: 'xy-chain-destination-fixture',
      givens: '823....69...29.834..46381.258712649334....2.6..2..3...136..294727...4...4.8....2.',
      solution: '823541769615297834794638152587126493341985276962473518136852947279314685458769321',
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const game = replay([startEvent(puzzle)]).games[gameId];
    const notesByCell: Record<number, Digit[]> = {
      3: [4, 5, 7], 4: [1, 4, 5, 7], 5: [1, 5, 7], 6: [5, 7],
      9: [1, 6, 7], 10: [1, 5, 6], 11: [1, 5], 14: [1, 5, 7],
      18: [5, 7, 9], 19: [5, 9], 25: [5, 7], 38: [1, 9],
      39: [5, 7, 8, 9], 40: [5, 7, 8], 41: [5, 7, 9], 43: [1, 5, 7, 8],
      45: [1, 6, 9], 46: [1, 6, 9], 48: [4, 5, 7, 8, 9], 49: [4, 5, 7, 8],
      51: [5, 7], 52: [1, 5, 7, 8], 53: [1, 5, 8], 57: [5, 8], 58: [5, 8],
      65: [5, 9], 66: [3, 5, 9], 67: [1, 6], 69: [3, 6], 70: [1, 5, 8],
      71: [1, 5, 8], 73: [5, 9], 75: [3, 7, 9], 76: [1, 6, 7],
      77: [1, 6, 7, 9], 78: [3, 6], 80: [1, 5]
    };
    for (const [cell, values] of Object.entries(notesByCell)) game.notes[Number(cell)] = values;

    const hint = findNextSolveHint(game);
    expect(hint).toMatchObject({ targetCell: 53, value: 8, rule: 'xy-chain' });
    if (!hint) throw new Error('Expected the XY-Chain from xychain.png.');
    const visualization = buildSolveHintVisualization(game, hint);

    expect(visualization.patternCells).toEqual([53, 80, 70]);
    expect(visualization.candidateCells
      .filter(({ cell }) => visualization.patternCells.includes(cell))
      .map(({ cell, values }) => ({ cell, values }))).toEqual([
        { cell: 53, values: [5, 8] },
        { cell: 80, values: [1, 5] },
        { cell: 70, values: [1, 8] }
      ]);
    expect(visualization.arrows).toEqual([
      { fromCell: 53, toCell: 53, fromValue: 8, toValue: 5 },
      { fromCell: 53, toCell: 80, fromValue: 5, toValue: 5 },
      { fromCell: 80, toCell: 80, fromValue: 5, toValue: 1 },
      { fromCell: 80, toCell: 70, fromValue: 1, toValue: 1 },
      { fromCell: 70, toCell: 70, fromValue: 1, toValue: 8 }
    ]);
    expect(visualization.exclusionCells).toEqual([43, 52, 71]);
    expect(visualization.candidateCells
      .filter(({ endpoints }) => endpoints.length)
      .map(({ cell, endpoints }) => ({ cell, endpoints }))).toEqual([
        { cell: 53, endpoints: [8] },
        { cell: 70, endpoints: [8] }
    ]);
  });

  it('connects and alternately colors the actual conjugate links for Simple Colors', () => {
    const puzzle: PuzzleDefinition = {
      id: 'simple-colors-visual-fixture',
      givens: '64983125753167298482754961321.39.74549....8327.32.41963.4.2.56.1...6342.9624.537.',
      solution: '649831257531672984827549613218396745496157832753284196374928561185763429962415378',
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const game = replay([startEvent(puzzle)]).games[gameId];
    const notesByCell: Record<number, Digit[]> = {
      29: [6, 8], 32: [6, 8], 38: [5, 6], 39: [1, 7], 40: [1, 5],
      41: [6, 7], 46: [5, 8], 49: [5, 8], 55: [5, 8], 57: [1, 7, 9],
      59: [7, 8], 62: [1, 8, 9], 64: [5, 7, 8], 65: [5, 8],
      66: [7, 9], 71: [8, 9], 76: [1, 8], 80: [1, 8]
    };
    for (const [cell, values] of Object.entries(notesByCell)) game.notes[Number(cell)] = values;

    const hint = findNextSolveHint(game);
    expect(hint).toMatchObject({ targetCell: 55, value: 7, rule: 'simple-colors' });
    if (!hint) throw new Error('Expected the Simple Colors step from simplecolors.png.');
    const visualization = buildSolveHintVisualization(game, hint);

    expect(visualization.patternCells).toEqual([59, 32, 29, 46]);
    expect(visualization.arrows).toEqual([
      { fromCell: 59, toCell: 32, fromValue: 8, toValue: 8, kind: 'conjugate' },
      { fromCell: 32, toCell: 29, fromValue: 8, toValue: 8, kind: 'conjugate' },
      { fromCell: 29, toCell: 46, fromValue: 8, toValue: 8, kind: 'conjugate' },
      { fromCell: 59, toCell: 55, fromValue: 8, toValue: 8, kind: 'elimination' },
      { fromCell: 46, toCell: 55, fromValue: 8, toValue: 8, kind: 'elimination' }
    ]);
    expect(visualization.candidateCells.flatMap(({ cell, colors }) =>
      colors.map(({ value, parity }) => ({ cell, value, parity }))
    )).toEqual([
      { cell: 59, value: 8, parity: 'even' },
      { cell: 32, value: 8, parity: 'odd' },
      { cell: 29, value: 8, parity: 'even' },
      { cell: 46, value: 8, parity: 'odd' }
    ]);
    expect(visualization.exclusionCells).toEqual([55]);
    expect(visualization.candidateCells.find(({ cell }) => cell === 55)).toMatchObject({
      values: [7, 8],
      excluded: [8]
    });
  });

  it('uses Unknown rule for a correct placement that no listed rule proves', () => {
    const puzzle: PuzzleDefinition = {
      id: 'unknown-rule-fixture',
      givens: '.....1...8.6.4.37..7...894.........39..2.3.56.82..67.973....1.4.9...75...6.194...',
      solution: '549371628826945371173628945654719283917283456382456719738562194491837562265194837',
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 0, value: 5 } }
    ];

    const step = buildSolveWalkthrough(events, gameId).steps[0];
    expect(step).toMatchObject({ rule: 'unknown-rule', ruleLabel: 'Unknown rule', targetCell: 0 });
    expect(step.explanation).toContain('No rule in the walkthrough\'s book list can be proven');
  });

  it('reports asynchronous analysis progress once per recorded placement', async () => {
    const solution = '549371628826945371173628945654719283917283456382456719738562194491837562265194837';
    const puzzle: PuzzleDefinition = {
      id: 'progress-fixture',
      givens: `..${solution.slice(2)}`,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null
    };
    const events: SudokuEvent[] = [
      startEvent(puzzle),
      { ...envelope(2), type: 'cell/value-entered', payload: { cell: 0, value: 5 } },
      { ...envelope(3), type: 'cell/value-entered', payload: { cell: 1, value: 4 } }
    ];
    const progress: WalkthroughBuildProgress[] = [];
    let yields = 0;

    const walkthrough = await buildSolveWalkthroughAsync(events, gameId, {
      onProgress: (update) => progress.push(update),
      yieldControl: async () => { yields += 1; }
    });

    expect(walkthrough.steps).toHaveLength(2);
    expect(progress).toEqual([
      { completed: 0, total: 2 },
      { completed: 1, total: 2 },
      { completed: 2, total: 2 }
    ]);
    expect(yields).toBe(2);
  });

  it('replays ordered placements embedded in a walkthrough-directed shared import', () => {
    const solution = '549371628826945371173628945654719283917283456382456719738562194491837562265194837';
    const puzzle: PuzzleDefinition = {
      id: 'shared-walkthrough-fixture',
      givens: `..${solution.slice(2)}`,
      solution,
      difficulty: 'custom',
      validatorVersion: 3,
      hardestTechnique: null,
      provenance: { kind: 'puzzle-link', formatVersion: 3, fingerprint: 'shared-walkthrough' }
    };
    const events: SudokuEvent[] = [{
      ...envelope(1),
      elapsedMs: 5_000,
      type: 'game/imported',
      payload: {
        gameId,
        importKind: 'puzzle-link',
        transferId: null,
        puzzle,
        settings,
        checkpoint: null,
        work: [
          { type: 'value', cell: 0, value: 5 },
          { type: 'notes', cell: 1, values: [4], enabled: true },
          { type: 'value', cell: 1, value: 4 }
        ],
        sharedMetadata: { elapsedMs: 5_000 },
        initialView: 'walkthrough'
      }
    }];

    const walkthrough = buildSolveWalkthrough(events, gameId);
    expect(countSolveWalkthroughPlacements(events, gameId)).toBe(2);
    expect(walkthrough.steps.map((step) => step.targetCell)).toEqual([0, 1]);
    expect(walkthrough.steps[0].game.values.slice(0, 2)).toEqual([5, null]);
    expect(walkthrough.steps[1]).toMatchObject({
      elapsedMs: 5_000,
      rule: 'full-house',
      game: { status: 'complete' }
    });
  });

  it('does not reinterpret ordinary shared work as a recorded solve', () => {
    const puzzle = generateEasyPuzzle('ordinary-shared-work').puzzle;
    const cell = puzzle.givens.indexOf('.');
    const events: SudokuEvent[] = [{
      ...envelope(1),
      type: 'game/imported',
      payload: {
        gameId,
        importKind: 'puzzle-link',
        transferId: null,
        puzzle: {
          ...puzzle,
          provenance: { kind: 'puzzle-link', formatVersion: 2, fingerprint: 'ordinary-work' }
        },
        settings,
        checkpoint: null,
        work: [{ type: 'value', cell, value: Number(puzzle.solution[cell]) as Digit }]
      }
    }];

    expect(buildSolveWalkthrough(events, gameId).steps).toEqual([]);
  });
});
