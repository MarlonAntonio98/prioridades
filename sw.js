'use strict';
// Cuando cambies cualquier archivo de la app, sube este número para que el celular descargue la versión nueva.
const VERSION = 'prioridades-v3';
const PREFIX = 'prioridades-';
const FILES = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

// Guarda cada archivo por separado: si alguno falla, los demás igual quedan guardados y la app abre sin internet.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(FILES.map(f =>
    fetch(new Request(f, {cache: 'reload'})).then(r => { if (r.ok) return c.put(f, r); }).catch(() => {})
  ))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const STATIC = /\.(js|css|png|svg|jpg|jpeg|webp|woff2?|webmanifest|ico)$/i;
async function fromNetwork(req, key){ const r = await fetch(req); if (r && r.ok){ const c = await caches.open(VERSION); c.put(key || req, r.clone()); } return r; }

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname;
  // La app misma: primero la copia guardada (abre al instante y sin internet).
  if (r.mode === 'navigate'){
    if (url.pathname === scope || url.pathname === scope + 'index.html')
      e.respondWith(caches.match('index.html', {cacheName: VERSION}).then(c => c || fromNetwork(r, 'index.html')).catch(() => caches.match('index.html')));
    return;
  }
  // Datos que cambian (como listas .json): primero internet, y si no hay, la última copia guardada.
  if (/\.json$/i.test(url.pathname)){
    e.respondWith(fromNetwork(r).catch(() => caches.match(r, {ignoreSearch: true})));
    return;
  }
  // Archivos de la app (código, estilos, íconos, fuentes): copia guardada, y si falta, se descarga y se guarda.
  if (STATIC.test(url.pathname)){
    e.respondWith(caches.match(r, {ignoreSearch: true}).then(c => c || fromNetwork(r)));
  }
});
