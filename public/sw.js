self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (error) {
    data = { title: "Ferocity", body: event.data ? event.data.text() : "New Ferocity update." };
  }

  const title = data.title || "Ferocity";
  const options = {
    body: data.body || "Open Ferocity for the latest item.",
    icon: data.icon || "/icon.svg",
    badge: data.badge || "/icon.svg",
    tag: data.tag || "ferocity-alert",
    data: {
      url: data.url || "/app/attention-command"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/app/attention-command", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
