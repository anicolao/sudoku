/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

declare const self: ServiceWorkerGlobalScope;

const scopeName = new URL(self.registration.scope).pathname
  .replace(/^\/+|\/+$/g, '')
  .replace(/[^a-z0-9]+/gi, '-')
  .toLowerCase() || 'root';
const cachePrefix = `sudoku-app-${scopeName}-`;
const cacheName = `${cachePrefix}${version}`;
const assets = [...build, ...files, ...prerendered];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll(assets)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
});
