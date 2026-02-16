/* service-worker.js - place in /public folder */
/* CRA uses workbox, but we add our own notification handler */

/* eslint-disable no-restricted-globals */

// This line is required for CRA's workbox to merge with custom SW code
// In your CRA project, use CRACO or customize via react-app-rewired,
// OR simply rename this to serviceWorkerRegistration override.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// ── Handle notification click (when user taps the alarm notification) ────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const alarmId = event.notification.data?.alarmId;

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if open
        for (const client of windowClients) {
          if ('focus' in client) {
            client.postMessage({ type: 'ALARM_FIRED', alarmId });
            return client.focus();
          }
        }
        // Otherwise open a new window
        return clients.openWindow('/');
      })
  );
});

// ── Handle notification dismiss ──────────────────────────────────────────────
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Alarm notification dismissed:', event.notification.tag);
});
