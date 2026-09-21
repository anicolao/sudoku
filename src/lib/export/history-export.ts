import type { StoredEventDocumentV1 } from '$lib/domain/types';

/** A local analysis file, separate from puzzle links and storage schema versions. */
export function serializeHistory(
  eventDocument: StoredEventDocumentV1,
  metadata: { exportedAt: Date; appVersion: string; appRevision: string; persistent: boolean }
): string {
  return JSON.stringify({
    format: 'sudoku-history',
    formatVersion: 1,
    exportedAt: metadata.exportedAt.toISOString(),
    app: { version: metadata.appVersion, revision: metadata.appRevision },
    storage: metadata.persistent ? 'persistent' : 'memory-only',
    coverage: {
      scope: 'All attempts and settings in this browser’s current Sudoku event store.',
      includesSolutions: true,
      limitations: [
        'Only retained events are available; cleared history and other browsers or devices are not included.',
        'Cage inspections and hints viewed without revealing a digit are not recorded.',
        'Imported work may not include the original move order or earlier solve history.',
        'Elapsed times are recorded event times; time since the latest event is not added.'
      ]
    },
    eventDocument
  }, null, 2) + '\n';
}
