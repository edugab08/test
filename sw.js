const C = 'fc-v6';
const SHELL = ['./', 'index.html', 'css/styles.css', 'css/tailwind.css', 'js/vendor/chart.umd.js', 'js/config.js', 'js/cloud.js', 'js/cards.js', 'js/app.js', 'js/icons.js', 'js/features.js', 'js/extras.js', 'js/extras2.js', 'js/ui.js', 'manifest.json', 'icons/icon-192.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || /script\.google(usercontent)?\.com/.test(new URL(r.url).host)) return; // dados da planilha nunca vão para o cache
  e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(res => { if (res && (res.ok || res.type === 'opaque')) caches.open(C).then(c => c.put(r, res.clone())); return res; }).catch(() => hit);
    return hit || net;
  }));
});
