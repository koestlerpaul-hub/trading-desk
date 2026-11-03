self.addEventListener("push", e => {
  let d = {}; try { d = e.data.json(); } catch (_) { d = {body: e.data && e.data.text()}; }
  e.waitUntil(self.registration.showNotification(d.title || "Desk", {body: d.body, data: {url: d.url || "https://fomo.family/r/muteee"},
    actions: (d.actions || []).slice(0, 2).map((a, i) => ({action: "a" + i, title: a.label}))}));
  self._acts = d.actions || [];
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = e.notification.data && e.notification.data.url;
  if (url && /^https:\/\/fomo\.family\//.test(url)) e.waitUntil(clients.openWindow(url));
});
