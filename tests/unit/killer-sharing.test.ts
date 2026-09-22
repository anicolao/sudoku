import { expect, test } from 'vitest';
import { generateKillerPuzzle } from '../../src/lib/generator/killer-puzzle';
import { parseSharedPuzzlePayload, puzzleUrl, validateSharedPuzzle } from '../../src/lib/sharing/puzzle-link';
import { EventStore, MemoryStorage } from '../../src/lib/storage/event-store';
import { printablePuzzleLinks } from '../../src/lib/printing/printable-puzzle';
import { buildSolveWalkthrough } from '../../src/lib/domain/walkthrough';
const sharedPuzzle = generateKillerPuzzle('share').puzzle;
const printedPuzzle = generateKillerPuzzle('print').puzzle;
const payload = (url: string) => new URL(url).searchParams.get('p')!;

test('clean and work links preserve canonical cages and derive their solution', async () => {
 const p = sharedPuzzle;
 const url = puzzleUrl('https://example.org/', p.givens, [], null, p);
 const result = await validateSharedPuzzle(payload(url));
 expect(result.puzzle.solution).toBe(p.solution);
 expect(result.puzzle.cages).toEqual(p.cages);
 expect(result.puzzle.provenance).toMatchObject({ formatVersion: 5 });
 expect(payload(url)).not.toContain(p.solution);
 const work = [{type:'value' as const,cell:0,value:Number(p.solution[0]) as 1}, {type:'notes' as const,cell:1,values:[2,4] as [2,4],enabled:true}];
 const shared = await validateSharedPuzzle(payload(puzzleUrl(url,p.givens,work,{ elapsedMs: 1234 },p)));
 expect(shared.work).toEqual(work);
 expect(shared.fingerprint).toBe(result.fingerprint);
 const reversed = {...p,cages:p.cages!.toReversed().map((c)=>({...c,cells:c.cells.toReversed()}))};
 expect(puzzleUrl(url,p.givens,[],null,reversed)).toBe(url);
 const store = new EventStore(new MemoryStorage());
 const projection = store.importGame(shared.puzzle,{ id:'import',occurredAt:new Date('2026-01-01') },undefined,shared.work,shared.metadata!);
 expect(projection.diagnostics).toEqual([]);
 expect(projection.games[projection.activeGameId!].values[0]).toBe(Number(p.solution[0]));
});

test('malformed, overlapping, unknown and oversized Killer links fail closed', async () => {
 const p = sharedPuzzle;
 const encoded = payload(puzzleUrl('https://example.org',p.givens,[],null,p));
 expect(()=>parseSharedPuzzlePayload(encoded.replace('K1!', 'K2!'))).toThrow(/version/);
 expect(()=>parseSharedPuzzlePayload(encoded + 'x'.repeat(4096))).toThrow(/long/);
 expect(()=>parseSharedPuzzlePayload(encoded.replace(/!([^!]+)$/, '!3.1111'))).toThrow();
 const different = {...p,cages:p.cages!.map((c)=>({...c,total:10*c.cells.length-c.total})),solution:[...p.solution].map(v=>String(10-Number(v))).join('')};
 const checked = await validateSharedPuzzle(payload(puzzleUrl('https://example.org',p.givens,[],null,different)));
 const original = await validateSharedPuzzle(encoded);
 expect(checked.fingerprint).not.toBe(original.fingerprint);
});

test('both printed handoffs preserve cages and all 81 walkthrough explanations', async () => {
 const store = new EventStore(new MemoryStorage());
 const projection=store.startGame(printedPuzzle,{id:'start',occurredAt:new Date('2026-01-01')});
 const game=projection.games[projection.activeGameId!];
 const links=printablePuzzleLinks('https://example.org/',game);
 expect(links.sequence).toHaveLength(81);
 const imported=await validateSharedPuzzle(payload(links.walkthrough), { walkthrough: true });
 expect(imported.puzzle.cages).toEqual(game.puzzle.cages);
 const other=new EventStore(new MemoryStorage());
 const result=other.importGame(imported.puzzle,{id:'import',occurredAt:new Date('2026-01-01')},undefined,imported.work,undefined,'walkthrough');
 expect(result.diagnostics).toEqual([]);
 const walkthrough=buildSolveWalkthrough(other.getDocument().events,result.activeGameId!);
 expect(walkthrough.steps).toHaveLength(81);
 expect(walkthrough.steps.every((s)=>s.rule !== 'unknown-rule')).toBe(true);
 expect(new URL(links.puzzle).searchParams.get('view')).toBeNull();
});
