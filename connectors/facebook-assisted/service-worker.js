const DEFAULT_API = "https://ferocity.live";

async function stored() {
  return chrome.storage.local.get(["apiBase", "token", "deviceId", "identityId"]);
}

async function deviceId() {
  const state = await stored();
  if (state.deviceId) return state.deviceId;
  const value = crypto.randomUUID() + crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: value });
  return value;
}

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

async function api(path, options = {}) {
  const state = await stored();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  headers["X-Ferocity-Device-ID"] = await deviceId();
  const response = await fetch(`${(state.apiBase || DEFAULT_API).replace(/\/$/, "")}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({ error: "Ferocity returned an unreadable response." }));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "PAIR") {
      const id = await deviceId();
      const result = await api("/api/integrations/facebook-connector/pair", {
        method: "POST", body: JSON.stringify({ code: message.code, deviceId: id, connectorVersion: "0.1.0" })
      });
      await chrome.storage.local.set({ token: result.token, identityId: result.identityId, apiBase: message.apiBase || DEFAULT_API });
      return { ok: true, identityId: result.identityId };
    }
    if (message.type === "HEALTH") return api("/api/integrations/facebook-connector/health", { method: "POST", body: JSON.stringify(message.health) });
    if (message.type === "OBSERVE") {
      const providerEventId = await digest(`${message.observation.sourceUrl}|${message.observation.externalActorId}|${message.observation.body}`);
      return api("/api/integrations/facebook-connector/observe", {
        method: "POST", body: JSON.stringify({ ...message.observation, providerEventId })
      });
    }
    if (message.type === "CLAIM") return api("/api/integrations/facebook-connector/action/claim", { method: "POST", body: "{}" });
    if (message.type === "CONFIRM") return api("/api/integrations/facebook-connector/action/confirm", { method: "POST", body: JSON.stringify(message.confirmation) });
    if (message.type === "STATE") return stored();
    if (message.type === "DISCONNECT") {
      try { await api("/api/integrations/facebook-connector/pair", { method: "DELETE" }); } catch { /* Local disconnect still wins. */ }
      await chrome.storage.local.remove(["token", "identityId"]);
      return { ok: true };
    }
    throw new Error("Unknown connector command.");
  })().then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
