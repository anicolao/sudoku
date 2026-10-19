import { describe, expect, it } from 'vitest';
import { combineReadings } from '../../src/lib/photo/reading-consensus';
const reading = (cell:number,value:number|null,confidence:number,height=55)=>({image:{cell,componentHeight:height},value,confidence});
describe('photo crop consensus',()=>{
  it('repairs clipped loops only with agreement from both wider crops',()=>{
    const original=reading(0,3,92,66), clean=reading(0,8,90,69), stroke=reading(0,8,91,69);
    expect(combineReadings([original],[clean],[stroke])).toEqual([stroke]);
    expect(combineReadings([original],[reading(0,3,90,69)],[stroke])).toEqual([original]);
    expect(combineReadings([original],[clean],[reading(0,8,91,60)])).toEqual([original]);
  });
  it('recovers weak and missing full-size readings without inserting tiny candidates',()=>{
    const original=reading(0,null,0), stroke=reading(0,4,74,61), added=reading(1,2,92,70);
    expect(combineReadings([original],[reading(0,4,76,60),added,reading(2,5,95,20)],
      [stroke,added,reading(2,5,95,20)])).toEqual([stroke,added]);
  });
});
