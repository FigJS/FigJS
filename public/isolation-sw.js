'use strict';

const OPEN_PARAM = 'embeds';
const ISOLATION_HEADERS = [
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Opener-Policy-Report-Only',
  'Cross-Origin-Embedder-Policy',
  'Cross-Origin-Embedder-Policy-Report-Only',
];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.mode !== 'navigate') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.searchParams.has(OPEN_PARAM)) return;

  event.respondWith(fetch(req).then((res) => {
    if (res.type === 'opaqueredirect' || !res.ok) return res;
    const headers = new Headers(res.headers);
    ISOLATION_HEADERS.forEach((name) => headers.delete(name));
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }));
});
