import { describe, expect, it } from 'vitest';
import { isFullSizeDigit } from '../../src/lib/photo/full-size-digit';
describe('full-size entries versus candidate ink',()=>{
  it('rejects small central candidates and tall corner clusters',()=>{
    expect(isFullSizeDigit({componentHeight:34,centerX:0.45,centerY:0.60},49)).toBe(false);
    expect(isFullSizeDigit({componentHeight:64,centerX:0.75,centerY:0.36},49)).toBe(false);
    expect(isFullSizeDigit({componentHeight:42,centerX:0.23,centerY:0.24},49)).toBe(false);
  });
  it('retains large centered printed and handwritten entries',()=>{
    expect(isFullSizeDigit({componentHeight:49,centerX:0.5,centerY:0.5},49)).toBe(true);
    expect(isFullSizeDigit({componentHeight:66,centerX:0.45,centerY:0.6},49)).toBe(true);
  });
});
