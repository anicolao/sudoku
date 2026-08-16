import { describe, expect, it } from 'vitest';
import { buildLabel, shortBuildHash } from './app-meta';

describe('application metadata', () => {
  it('uses a stable seven-character revision', () => {
    expect(shortBuildHash('517b049a7ba58a3')).toBe('517b049');
  });

  it('falls back visibly for a local build', () => {
    expect(shortBuildHash(undefined)).toBe('local');
    expect(buildLabel('0.1.0', undefined)).toBe('Version 0.1.0 · Build local');
  });
});
