export interface Prng {
  next(): number;
  integer(maxExclusive: number): number;
  shuffle<T>(values: readonly T[]): T[];
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

export function createPrng(seed: string): Prng {
  let state = hashSeed(seed);
  const next = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    integer: (maxExclusive) => Math.floor(next() * maxExclusive),
    shuffle: <T>(values: readonly T[]) => {
      const result = [...values];
      for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(next() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
      }
      return result;
    }
  };
}
