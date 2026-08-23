import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const packageVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
).version;

function gitRevision(): string {
  const override = process.env.VITE_GIT_HASH?.trim();
  if (override) return override.slice(0, 7);

  try {
    return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'local';
  }
}

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
    'import.meta.env.VITE_GIT_HASH': JSON.stringify(gitRevision())
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts']
  }
});
