import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

const ignoredDirectories = new Set([
  '.git',
  '.svelte-kit',
  'build',
  'node_modules',
  'playwright-report',
  'test-results'
]);

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return extname(entry.name).toLowerCase() === '.md' ? [path] : [];
  });
}

function localTarget(rawTarget) {
  const target = rawTarget.trim().replace(/^<|>$/g, '').split('#', 1)[0];
  if (!target || /^(?:https?:|mailto:)/i.test(target)) return null;
  try { return decodeURIComponent(target); }
  catch { return target; }
}

const files = markdownFiles(process.cwd());
const missing = [];

for (const file of files) {
  const markdown = readFileSync(file, 'utf8');
  for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = localTarget(match[1]);
    if (target && !existsSync(resolve(dirname(file), target))) {
      missing.push(`${file.slice(process.cwd().length + 1)} -> ${target}`);
    }
  }
}

if (missing.length) {
  console.error(`Broken local Markdown links:\n${missing.map((entry) => `- ${entry}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Checked ${files.length} Markdown files; all local links resolve.`);
}
