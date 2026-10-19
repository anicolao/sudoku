import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { photoExamplePassed, photoReviewReport } from '../../scripts/photo-review-report.mjs';
import { EMPTY_BOARD, masterPayload, validateMaster, type PhotoMaster, type PhotoPolicy } from '../../scripts/photo-master.mjs';
import { parseSharedPuzzlePayload } from '../../src/lib/sharing/puzzle-link';
import { countSolutions } from '../../src/lib/generator/solve';

const master: PhotoMaster = { filename:'example.jpeg', status:'transcribed', givens:'1'+'.'.repeat(80), placements:'.2'+'.'.repeat(79), notes:{'13':'345'} };
const policy: PhotoPolicy = {layers:['givens','placements'],outcome:'review'};
const reviewed = {filename:master.filename,givens:master.givens!,placements:master.placements!,notes:{},ready:false,started:false,reviewRequired:true};

describe('independent photo source and recognition policy', () => {
  it('keeps the non-unique top puzzle review-only without treating its work as givens', () => {
    const masters: PhotoMaster[] = JSON.parse(readFileSync('examples/goldens.json','utf8'));
    const source = masters.find(master=>master.filename === '21forward.webp')!;
    const policies = JSON.parse(readFileSync('examples/recognition-policy.json','utf8'));
    expect(policies.overrides[source.filename].outcome).toBe('review');
    expect(countSolutions(source.givens!)).toBe(2);
    expect([...source.placements!].filter(value=>value!=='.')).toHaveLength(3);
    expect(countSolutions([...source.givens!].map((value,cell)=>value==='.'?source.placements![cell]:value).join(''))).toBe(2);
  });
  it('requires exact layers and the requested outcome', () => {
    expect(photoExamplePassed(master, reviewed, policy)).toBe(true);
    expect(photoExamplePassed(master, {...reviewed,givens:EMPTY_BOARD}, policy)).toBe(false);
    expect(photoExamplePassed(master, {...reviewed,placements:EMPTY_BOARD}, policy)).toBe(false);
    expect(photoExamplePassed(master, {...reviewed,ready:true}, policy)).toBe(false);
    expect(photoExamplePassed(master, {...reviewed,started:true}, policy)).toBe(false);
    expect(photoExamplePassed(master, {...reviewed,reviewRequired:false}, policy)).toBe(false);
    expect(photoExamplePassed(master, {...reviewed,error:'failed'}, policy)).toBe(false);
    expect(photoExamplePassed(master, undefined, policy)).toBe(false);
    expect(photoExamplePassed(master, reviewed, {...policy,outcome:'start'})).toBe(false);
    expect(photoExamplePassed(master, {...reviewed,ready:true,started:true}, {...policy,outcome:'start'})).toBe(true);
  });

  it('can validate givens alone or all three layers without changing source truth', () => {
    expect(photoExamplePassed(master, {...reviewed,placements:EMPTY_BOARD}, {...policy,layers:['givens']})).toBe(true);
    const all: PhotoPolicy = {...policy,layers:['givens','placements','notes']};
    expect(photoExamplePassed(master, reviewed, all)).toBe(false);
    expect(photoExamplePassed(master, {...reviewed,notes:{'13':'345'}}, all)).toBe(true);
    expect(master.notes).toEqual({'13':'345'});
  });

  it('does not bless an unreviewed or ambiguous source', () => {
    expect(photoExamplePassed({...master,status:'unreviewed'}, reviewed, policy)).toBe(false);
    expect(photoExamplePassed({...master,ambiguities:{'12':'Original role unknown'}}, reviewed, policy)).toBe(false);
    expect(masterPayload({...master,status:'unreviewed'})).toBeNull();
    expect(masterPayload({...master,ambiguities:{'12':'Original role unknown'}})).toBeNull();
    expect(() => validateMaster({...master,notes:null})).toThrow('all three layers');
    expect(() => validateMaster({...master,placements:master.givens})).toThrow('overlap');
    expect(() => validateMaster({...master,notes:{'13':'343'}})).toThrow('invalid notes');
  });

  it('does not let ambiguous notes change a givens-and-placements policy', () => {
    const source = {...master,ambiguities:{'notes:13':'Unreadable pencil marks'}};
    expect(photoExamplePassed(source, reviewed, policy)).toBe(true);
    expect(photoExamplePassed(source, reviewed, {...policy,layers:['givens','placements','notes']})).toBe(false);
    expect(masterPayload(source)).toBe(masterPayload(master));
    expect(masterPayload(source,true)).toBeNull();
  });

  it('checks indistinguishable digits without guessing roles or ignoring wrong values', () => {
    const source = {...master, unclassified:'..3'+'.'.repeat(78), ambiguities:{roles:'Identical full-size digit styles'}};
    const either: PhotoPolicy = {...policy, unclassifiedRoles:'either'};
    const fixed = {...reviewed,givens:'1.3'+'.'.repeat(78)};
    const work = {...reviewed,placements:'.23'+'.'.repeat(78)};
    expect(photoExamplePassed(source,fixed,policy)).toBe(false);
    expect(photoExamplePassed(source,fixed,either)).toBe(true);
    expect(photoExamplePassed(source,work,either)).toBe(true);
    expect(photoExamplePassed(source,{...fixed,placements:undefined},either)).toBe(false);
    expect(() => validateMaster({...source,ambiguities:{'notes:13':'Unclear note'}})).toThrow('explicit ambiguity');
    expect(photoExamplePassed(source,reviewed,either)).toBe(false);
    expect(photoExamplePassed(source,{...fixed,placements:work.placements},either)).toBe(false);
    expect(photoExamplePassed(source,{...fixed,givens:'1.4'+'.'.repeat(78)},either)).toBe(false);
    expect(photoExamplePassed(source,{...fixed,givens:'4.3'+'.'.repeat(78)},either)).toBe(false);
    expect(photoExamplePassed(source,{...fixed,givens:'1.35'+'.'.repeat(77)},either)).toBe(false);
    expect(masterPayload(source)).toBeNull();
    expect(source.unclassified).toBe('..3'+'.'.repeat(78));
  });

  it('shows the complete source regardless of which layers the policy validates', () => {
    const html = photoReviewReport([master],[reviewed],{default:policy,overrides:{}});
    expect(html).toContain('data-status="pass"');
    expect(html).toContain('1/1 exact recognition and expected outcome checks passed');
    expect(html).toContain('Open givens with player placements');
    expect(html).toContain('Open with notes too');
    expect(html).toContain('345');
    expect(html).not.toContain('successfully started as a playable puzzle');
  });

  it('round-trips the audited examples through the real URL decoder without flattening work', () => {
    const masters: PhotoMaster[] = JSON.parse(readFileSync('examples/goldens.json','utf8'));
    for (const source of masters) {
      validateMaster(source);
      const payload = masterPayload(source);
      if (!payload) continue;
      const parsed = parseSharedPuzzlePayload(payload);
      expect(parsed.givens, source.filename).toBe(source.givens);
      expect(parsed.values.map((v,cell) => source.givens![cell] === '.' ? v || '.' : '.').join(''),source.filename).toBe(source.placements);
      expect(parsed.notes.every(notes=>notes.length===0)).toBe(true);
      const notesPayload = masterPayload(source,true);
      if (!notesPayload) continue;
      const all = parseSharedPuzzlePayload(notesPayload);
      for (const [rc,notes] of Object.entries(source.notes!)) {
        expect(all.notes[(Number(rc[0])-1)*9+Number(rc[1])-1].join(''),`${source.filename} ${rc}`).toBe(notes);
      }
    }
  });
});
