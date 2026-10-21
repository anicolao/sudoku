interface Reading {
  image: {cell:number; componentHeight:number};
  value:number|null;
  confidence:number;
}

/** Reconcile crops using only image evidence, never a solved board. */
export function combineReadings<T extends Reading>(normal: readonly T[], cleaned: readonly T[], strokes: readonly T[]): T[] {
  const originals = new Map(normal.map(reading=>[reading.image.cell,reading]));
  const clean = new Map(cleaned.map(reading=>[reading.image.cell,reading]));
  for (const alternative of strokes) {
    const original = originals.get(alternative.image.cell);
    const support = clean.get(alternative.image.cell);
    const agrees = alternative.value !== null && support?.value === alternative.value &&
      Math.min(alternative.confidence,support.confidence)>=72;
    if (!original) {
      if (agrees && alternative.confidence>=85 && alternative.image.componentHeight>=40) originals.set(alternative.image.cell,alternative);
      continue;
    }
    const repairsWeakReading = original.confidence<72 && (agrees || alternative.confidence>=85);
    const repairsClippedReading = agrees && Math.min(alternative.confidence,support!.confidence)>=85 &&
      alternative.image.componentHeight>original.image.componentHeight;
    if (repairsWeakReading || repairsClippedReading) originals.set(alternative.image.cell,alternative);
  }
  return [...originals.values()].sort((a,b)=>a.image.cell-b.image.cell);
}
