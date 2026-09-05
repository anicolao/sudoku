import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';
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

const ocrFiles = [
  ['worker.min.js', 'node_modules/tesseract.js/dist/worker.min.js'],
  ['tesseract-core-lstm.wasm.js', 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js'],
  ['tesseract-core-lstm.wasm', 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm'],
  ['eng.traineddata.gz', 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz']
] as const;

function localOcrAssets(): Plugin {
  return {
    name: 'local-ocr-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requested = ocrFiles.find(([name]) => request.url?.split('?')[0].endsWith(`/ocr/${name}`));
        if (!requested) return next();
        response.setHeader(
          'Content-Type',
          requested[0].endsWith('.wasm') ? 'application/wasm' :
            requested[0].endsWith('.js') ? 'text/javascript' : 'application/gzip'
        );
        response.end(readFileSync(new URL(requested[1], import.meta.url)));
      });
    },
    generateBundle() {
      for (const [name, path] of ocrFiles) {
        this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: readFileSync(new URL(path, import.meta.url)) });
      }
    }
  };
}

export default defineConfig({
  plugins: [localOcrAssets(), sveltekit()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageVersion),
    'import.meta.env.VITE_GIT_HASH': JSON.stringify(gitRevision())
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/unit/**/*.test.ts']
  }
});
