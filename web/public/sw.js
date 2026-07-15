// Minimal service worker: exists only to receive Web Push events and show a
// notification, then focus/open the app on click. No caching/offline support.

self.addEventListener('push', (event) => {
  let payload = { title: 'Roost HQ' };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch {
    payload = { title: event.data ? event.data.text() : 'Roost HQ' };
  }
  const title = payload.title || 'Roost HQ';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      icon: '/logo-mark.svg',
      data: { link: payload.link || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      return self.clients.openWindow(link);
    }),
  );
});
