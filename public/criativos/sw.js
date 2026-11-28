// Service worker do Hub Criativos: recebe o push (briefing do Maestro, alertas) e mostra a notificação.
// Não faz cache de página: o Hub é sempre carregado da rede.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  const titulo = d.titulo || 'Criativos';
  const opts = {
    body: d.texto || d.body || '',
    icon: '/criativos/icone-192.png',
    badge: '/criativos/icone-192.png',
    tag: d.tag || 'criativos',
    renotify: true,
    data: { url: d.url || '/criativos/#maestro' },
  };
  e.waitUntil(self.registration.showNotification(titulo, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/criativos/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
    for (const c of lista) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
