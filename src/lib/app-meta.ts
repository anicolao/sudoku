export function shortBuildHash(value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 7) : 'local';
}

export function buildLabel(version: string, hash: string | undefined): string {
  return `Version ${version} · Build ${shortBuildHash(hash)}`;
}
