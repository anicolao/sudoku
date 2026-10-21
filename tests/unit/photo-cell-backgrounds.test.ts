import { describe, expect, it } from 'vitest';
import { backgroundPlacementCells } from '../../src/lib/photo/cell-backgrounds';

describe('monochrome fixed-clue cell backgrounds', () => {
  const fills = Array.from({length:81},(_,cell)=>cell<30?212:247);
  const digits = new Set([...Array(30).keys(),40,50]);
  it('uses the complete fixed-cell fill convention, not digit darkness', () => {
    expect([...backgroundPlacementCells(fills,digits)]).toEqual([40,50]);
    expect([...backgroundPlacementCells(fills.map((value,cell)=>cell===80?160:value),digits)]).toEqual([40,50]);
  });
  it('does not infer roles from a highlighted row, notes cell, or photo gradient', () => {
    expect(backgroundPlacementCells(fills,new Set([...digits].filter(cell=>cell!==0))).size).toBe(0);
    expect(backgroundPlacementCells(fills.map((value,cell)=>cell<9?212:247),digits).size).toBe(0);
    expect(backgroundPlacementCells(fills.map((value,cell)=>cell>70?230:value),digits).size).toBe(0);
    expect(backgroundPlacementCells(Array(81).fill(247),digits).size).toBe(0);
  });
});
