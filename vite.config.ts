import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const packageVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
).version;

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion)
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts']
  }
});
