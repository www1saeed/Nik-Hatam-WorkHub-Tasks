/* eslint-disable no-restricted-globals */

/**
 * Lightweight custom service worker for Web Push notifications.
 *
 * This worker is intentionally focused on:
 * - receiving `push` events from the browser push service
 * - showing a system notification
 * - opening/focusing the app on notification click
 *
 * We keep this file framework-agnostic and small to avoid coupling with
 * Angular build internals.
 */
const TASKS_WAKE_SYNC_TYPE = 'TASKS_WAKE_SYNC';
const TASKS_BG_SYNC_TAG = 'nh-tasks-outbox-sync';

/**
 * Broadcast one message payload to all controlled/uncontrolled window clients.
 * This lets already open tabs react to SW-side events (e.g. push delivery).
 */
async function broadcastToWindowClients(payload) {
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientList) {
    if ('postMessage' in client) {
      client.postMessage(payload);
    }
  }
}

self.addEventListener('push', (event) => {
  if (!event || !event.data) {
    return;
  }

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: 'Notification',
      body: event.data.text(),
    };
  }

  const title = String(payload.title ?? 'Notification');
  const body = String(payload.body ?? '');
  const url = String(payload.url ?? '/dashboard/notifications');
  const taskId = payload.task_id ?? null;

  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: '/icons/logo_en.png',
      badge: '/icons/logo_en.png',
      data: {
        url,
        task_id: taskId,
      },
      tag: taskId ? `task-${taskId}` : undefined,
      renotify: false,
    });

    // Wake open app tabs so they can immediately replay pending outbox items
    // and/or refresh task snapshots after push-delivered updates.
    await broadcastToWindowClients({
      type: TASKS_WAKE_SYNC_TYPE,
      reason: 'push',
      task_id: taskId,
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = String(event.notification?.data?.url ?? '/dashboard/notifications');

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Prefer focusing an existing app tab.
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      // If app is not open, open a new tab/window.
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

/**
 * Background Sync wakeup:
 * - triggered by browser when connectivity is likely restored
 * - we forward a wake message to open clients so app can replay outbox
 */
self.addEventListener('sync', (event) => {
  if (!event || event.tag !== TASKS_BG_SYNC_TAG) {
    return;
  }

  event.waitUntil(
    broadcastToWindowClients({
      type: TASKS_WAKE_SYNC_TYPE,
      reason: 'background-sync',
    })
  );
});
