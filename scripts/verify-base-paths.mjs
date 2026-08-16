import fs from 'node:fs';
import path from 'node:path';

const configuredBase = process.env.PUBLIC_BASE_PATH;
if (!configuredBase || configuredBase === '/') {
  throw new Error('PUBLIC_BASE_PATH must be a non-root deployment path');
}

const base = configuredBase.replace(/\/$/, '');
const buildDirectory = path.resolve('build');
const indexPath = path.join(buildDirectory, 'index.html');

if (!fs.existsSync(indexPath)) {
  throw new Error('build/index.html does not exist; build before checking base paths');
}

const files = [];
const visit = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(entryPath);
    else if (/\.(?:html|js|css|webmanifest)$/.test(entry.name)) files.push(entryPath);
  }
};
visit(buildDirectory);

const failures = [];
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/(?:src|href)=["'](\/[^"']+)["']/g)) {
    if (!match[1].startsWith(`${base}/`)) {
      failures.push(`${path.relative('.', file)}: ${match[1]}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Found paths that escape ${base}:\n${failures.join('\n')}`);
}

const index = fs.readFileSync(indexPath, 'utf8');
if (!index.includes(`assets: "${base}"`)) {
  throw new Error(`build/index.html does not expose ${base} as the application asset base`);
}
if (!index.includes('./_app/') || !index.includes('./manifest.webmanifest')) {
  throw new Error('build/index.html does not use relative application and manifest assets');
}

const serviceWorkerPath = path.join(buildDirectory, 'service-worker.js');
if (!fs.existsSync(serviceWorkerPath)) {
  throw new Error('build/service-worker.js does not exist');
}
const serviceWorker = fs.readFileSync(serviceWorkerPath, 'utf8');
if (
  !serviceWorker.includes('location.pathname') ||
  !serviceWorker.includes('registration.scope') ||
  serviceWorker.includes('"/_app/')
) {
  throw new Error('build/service-worker.js does not derive precache paths from its deployment scope');
}

console.log(`Verified deployment assets remain under ${base}`);
