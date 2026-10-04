/**
 * MTERP PWA Web Push Service Worker Extension
 * Handles push notification events, interaction clicks, and deep linking.
 */

// ── 1. Push Event: Handle incoming push message from Web Push service ──────────
self.addEventListener('push', function (event) {
  if (!event.data) {
    console.warn('[SW Push] Push event received but had no data');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (err) {
    payload = {
      title: 'MTERP Notifikasi',
      body: event.data.text() || 'Pemberitahuan baru dari sistem MTERP.',
      data: { url: '/notifications' },
    };
  }

  const title = payload.title || 'MTERP';
  const options = {
    body: payload.body || 'Pemberitahuan baru.',
    icon: payload.icon || '/apple-touch-icon-180x180.png',
    badge: payload.badge || '/hard-hat.svg',
    image: payload.image || undefined,
    data: payload.data || { url: '/notifications' },
    vibrate: [120, 60, 120, 60, 200],
    tag: payload.tag || `mterp-${Date.now()}`,
    renotify: true,
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'Buka Detail',
      },
      {
        action: 'close',
        title: 'Abaikan',
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── 2. Notification Click: Deep link to specific page in PWA ──────────────────
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const notificationData = event.notification.data || {};
  const targetUrl = notificationData.url || '/notifications';

  event.waitUntil(
    self.clients
      .matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      .then(function (clientList) {
        // Check if there is already a window/tab open with the app
        for (const client of clientList) {
          if ('focus' in client) {
            // Navigate the open window to the target URL and bring to front
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // If no window is currently open, launch a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      })
  );
});

// ── 3. Push Subscription Change: Auto re-subscribe if subscription changes ────
self.addEventListener('pushsubscriptionchange', function (event) {
  console.log('[SW Push] Push subscription expired or changed, refreshing...');
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : { userVisibleOnly: true })
      .then(function (newSubscription) {
        console.log('[SW Push] Successfully renewed subscription:', newSubscription.endpoint);
        // Dispatch to backend if credentials available in client storage
      })
      .catch(function (err) {
        console.error('[SW Push] Failed to renew subscription:', err);
      })
  );
});
