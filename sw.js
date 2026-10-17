'use strict';
// Cuando cambies cualquier archivo de la app, sube este número (v2, v3...) para que el celular descargue la versión nueva.
const VERSION = 'prioridades-v1';
const FILES = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(FILES.map(f => new Request(f, {cache: 'reload'}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('prioridades-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    const scope = new URL(self.registration.scope).pathname, path = new URL(r.url).pathname;
    if (path === scope || path === scope + 'index.html') e.respondWith(caches.match('index.html').then(c => c || fetch(r)));
    return;
  }
  e.respondWith(caches.match(r, {ignoreSearch: true}).then(c => c || fetch(r)));
});
