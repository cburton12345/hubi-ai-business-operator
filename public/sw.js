self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("ferocity-field-shell-") && key !== "ferocity-field-shell-v1").map((key) => caches.delete(key)))
      )
    ])
  );
});

const fieldShellCache = "ferocity-field-shell-v1";

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg" || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.open(fieldShellCache).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      })
    );
    return;
  }

  if (event.request.mode === "navigate" && url.pathname.startsWith("/employee")) {
    event.respondWith(
      fetch(event.request)
        .then(async (response) => {
          if (response.ok && url.pathname === "/employee/offline") {
            const cache = await caches.open(fieldShellCache);
            await cache.put("/employee/offline", response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(fieldShellCache);
          return (await cache.match("/employee/offline")) || Response.error();
        })
    );
  }
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
      url: data.url || "/app/ferocity"
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/app/ferocity", self.location.origin).href;

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
