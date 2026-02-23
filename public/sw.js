/* eslint-disable no-restricted-globals */
// Service worker for push notifications

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "New notification", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192x192.png",
    badge: "/icon-192x192.png",
    data: payload.data || {},
    vibrate: [100, 50, 100],
    tag: payload.tag || "default",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(payload.title || "Aptus", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const deepLink = event.notification.data?.deepLink;
  const url = deepLink || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    }),
  );
});
