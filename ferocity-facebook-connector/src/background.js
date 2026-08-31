const DEFAULTS = {
  connectorToken: "",
  observeEnabled: true,
  watcherEnabled: true,
  sendActionsEnabled: false,
  inboxUrl: "https://www.facebook.com/messages/requests",
  scanIntervalMinutes: 1
};

const THREAD_QUEUE_KEY = "threadQueue";
const WATCHER_TAB_KEY = "watcherTabId";
const SEND_LOCK_KEY = "sendLock";
const SESSION_ID_KEY = "connectorSessionId";
const MAX_QUEUE = 80;
const CONNECTOR_VERSION = "0.1.0";
const API_BASE = "https://ferocity.live/api/integrations/facebook-connector";

async function getConfig() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return {
    ...DEFAULTS,
    ...stored,
    connectorToken: stored.connectorToken || "",
  };
}

async function getSessionId() {
  const stored = await chrome.storage.local.get(SESSION_ID_KEY);
  if (stored[SESSION_ID_KEY]) return stored[SESSION_ID_KEY];
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [SESSION_ID_KEY]: id });
  return id;
}

async function connectorEnvelope(payload = {}) {
  return {
    ...payload,
    session_id: await getSessionId(),
    transport_type: "chrome_extension",
    connector_version: CONNECTOR_VERSION,
    device_label: navigator.platform ? `Chrome extension on ${navigator.platform}` : "Chrome extension",
    user_agent: navigator.userAgent || "",
  };
}

async function pairConnector(pairingCode, deviceName) {
  const code = String(pairingCode || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!code) throw new Error("Missing pairing code");
  const deviceId = await getSessionId();
  const res = await fetch(`${API_BASE}/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, deviceId, connectorVersion: CONNECTOR_VERSION, deviceName: String(deviceName || "").trim() || "Facebook browser connector" })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `Pairing failed (${res.status})`);

  await chrome.storage.local.set({
    connectorToken: data.token || "",
    sendActionsEnabled: false,
    observeEnabled: true,
    watcherEnabled: true,
    pairInfo: {
      deviceId,
      tenantId: data.tenantId || "",
      brandId: data.brandId || "",
      identityId: data.identityId || "",
      deviceName: String(deviceName || "").trim() || "Facebook browser connector",
      expiresAt: data.expiresAt || "",
      pairedAt: new Date().toISOString(),
    }
  });
  await setStatus({ lastPairAt: new Date().toISOString(), lastError: "", mode: "paired_observe" });
  return { ok: true, tenantId: data.tenantId, brandId: data.brandId, identityId: data.identityId, expiresAt: data.expiresAt };
}

async function disconnectConnector() {
  const config = await getConfig();
  if (config.connectorToken) {
    await requestFerocity("pair", {}, { method: "DELETE" })
      .catch((err) => setStatus({ lastError: err.message || String(err), lastDisconnectErrorAt: new Date().toISOString() }));
  }
  await chrome.storage.local.remove(["connectorToken", "pairInfo"]);
  await chrome.storage.local.set({ sendActionsEnabled: false });
  await setStatus({ lastDisconnectAt: new Date().toISOString(), mode: "disconnected" });
  return { ok: true };
}

async function setPaused(paused) {
  await requestFerocity("health", {
    state: paused ? "warning" : "ready",
    reason: paused ? "The customer paused this browser connector." : "The customer resumed this browser connector.",
    url: "https://www.facebook.com/messages/requests",
    connectorVersion: CONNECTOR_VERSION
  });
  await chrome.storage.local.set({ observeEnabled: !paused, watcherEnabled: !paused, sendActionsEnabled: paused ? false : (await getConfig()).sendActionsEnabled });
  await setStatus({ paused: !!paused, lastPauseChangeAt: new Date().toISOString(), mode: paused ? "paused" : "resumed" });
  return { ok: true, paused: !!paused };
}

async function setStatus(patch) {
  const current = (await chrome.storage.local.get("connectorStatus")).connectorStatus || {};
  await chrome.storage.local.set({
    connectorStatus: {
      ...current,
      ...patch,
      mode: patch.mode || current.mode || "observe_with_optional_send",
      updatedAt: new Date().toISOString()
    }
  });
}

function isFacebookUrl(url) {
  return /^https:\/\/((www|m)\.facebook\.com|www\.messenger\.com)\//i.test(String(url || ""));
}

function normalizeFacebookUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^((www|m)\.facebook\.com|www\.messenger\.com)$/i.test(parsed.hostname)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

async function getQueue() {
  return (await chrome.storage.local.get(THREAD_QUEUE_KEY))[THREAD_QUEUE_KEY] || [];
}

async function setQueue(queue) {
  await chrome.storage.local.set({ [THREAD_QUEUE_KEY]: queue.slice(0, MAX_QUEUE) });
}

async function enqueueThread(link) {
  const url = normalizeFacebookUrl(link?.url);
  if (!url || !isFacebookUrl(url)) return { ok: true, skipped: "not_facebook" };

  const queue = await getQueue();
  if (!queue.some((item) => item.url === url)) {
    queue.push({
      url,
      source: String(link?.source || "facebook_page").slice(0, 80),
      label: String(link?.label || "").slice(0, 180),
      discoveredAt: new Date().toISOString()
    });
    await setQueue(queue);
  }

  await setStatus({ queuedThreads: queue.length, lastThreadDiscoveredAt: new Date().toISOString() });
  return { ok: true, queuedThreads: queue.length };
}

async function ensureWatcherTab(url, active = false) {
  if (!isFacebookUrl(url)) return;
  const stored = await chrome.storage.local.get(WATCHER_TAB_KEY);
  const tabId = stored[WATCHER_TAB_KEY];

  if (tabId) {
    try {
      await chrome.tabs.update(tabId, { url, active });
      return;
    } catch {
      await chrome.storage.local.remove(WATCHER_TAB_KEY);
    }
  }

  const tab = await chrome.tabs.create({ url, active });
  await chrome.storage.local.set({ [WATCHER_TAB_KEY]: tab.id });
}

async function waitForTabLoaded(tabId, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === "complete") return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function openFacebookLogin() {
  await ensureWatcherTab("https://www.facebook.com/login", true);
  await setStatus({ lastLoginOpenAt: new Date().toISOString() });
  return { ok: true, opened: "https://www.facebook.com/login" };
}

async function openMessengerRequests() {
  const url = "https://www.facebook.com/messages/requests";
  await ensureWatcherTab(url, true);
  await setStatus({ lastRequestsOpenAt: new Date().toISOString(), lastWatcherUrl: url });
  return { ok: true, opened: url };
}

async function openFacebookInbox() {
  const config = await getConfig();
  await ensureWatcherTab(config.inboxUrl, true);
  await setStatus({ lastInboxOpenAt: new Date().toISOString(), lastWatcherUrl: config.inboxUrl });
  return { ok: true, opened: config.inboxUrl };
}

async function visitNextQueuedThread() {
  const config = await getConfig();
  if (!config.observeEnabled || !config.watcherEnabled) return { ok: true, skipped: "watcher_disabled" };

  const queue = await getQueue();
  const next = queue.shift();
  if (!next) {
    await ensureWatcherTab(config.inboxUrl, false);
    await setStatus({ lastWatcherVisitAt: new Date().toISOString(), lastWatcherUrl: config.inboxUrl, queuedThreads: 0 });
    return { ok: true, opened: config.inboxUrl, queuedThreads: 0 };
  }

  await setQueue(queue);
  await ensureWatcherTab(next.url, false);
  await setStatus({
    lastWatcherVisitAt: new Date().toISOString(),
    lastWatcherUrl: next.url,
    queuedThreads: queue.length
  });
  return { ok: true, opened: next.url, queuedThreads: queue.length };
}

function actionUrl(action) {
  const threadId = String(action?.external_thread_id || "").trim();
  if (threadId && !threadId.includes(":") && !/^messages$/i.test(threadId)) {
    return `https://www.facebook.com/messages/t/${encodeURIComponent(threadId)}`;
  }

  const raw = action?.metadata?.page_url || action?.metadata?.source_page_url || action?.external_thread_id || "";
  const normalized = normalizeFacebookUrl(raw);
  if (normalized) return normalized;

  return normalized || "";
}

async function reportSendResult(action, result) {
  try {
    await requestFerocity("action/confirm", {
      actionId: action.id,
      outcome: result?.ok ? "succeeded" : "failed",
      providerReference: result?.external_message_id || undefined,
      failureCode: result?.ok ? undefined : "browser_send_failed",
      failureMessage: result?.ok ? undefined : (result?.error || "Facebook send failed"),
      observedUrl: result?.page_url || undefined
    });
  } catch (err) {
    await setStatus({ lastError: err.message || String(err), lastSendReportFailedAt: new Date().toISOString() });
  }
}

async function processSendAction(action) {
  const lock = (await chrome.storage.local.get(SEND_LOCK_KEY))[SEND_LOCK_KEY];
  if (lock?.actionId && Date.now() - Number(lock.startedAt || 0) < 120000) {
    return { ok: false, error: `Send already in progress for action ${lock.actionId}` };
  }

  await chrome.storage.local.set({
    [SEND_LOCK_KEY]: {
      actionId: action.id,
      startedAt: Date.now()
    }
  });

  try {
    const url = actionUrl(action);
    if (!url) {
      const result = { ok: false, error: "Action did not include a Facebook page URL" };
      await reportSendResult(action, result);
      return result;
    }

    await ensureWatcherTab(url, true);
    const { watcherTabId } = await chrome.storage.local.get(WATCHER_TAB_KEY);
    if (!watcherTabId) {
      const result = { ok: false, error: "Could not open watcher tab" };
      await reportSendResult(action, result);
      return result;
    }

    await waitForTabLoaded(watcherTabId);
    await new Promise((resolve) => setTimeout(resolve, 3000));

    async function trySend() {
      return await chrome.tabs.sendMessage(watcherTabId, {
        type: "ferocity_send_marketplace_message",
        payload: {
          action_id: action.id,
          body: action.body,
          external_thread_id: action.external_thread_id
        }
      }).catch((err) => ({ ok: false, error: err.message || String(err) }));
    }

    let result = await trySend();

    for (let attempt = 1; !result.ok && /message input|real Facebook message thread/i.test(result.error || "") && attempt <= 4; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      result = await trySend();
    }

    if (!result.ok && /message input/i.test(result.error || "")) {
      const opened = await chrome.tabs.sendMessage(watcherTabId, {
        type: "ferocity_open_first_message_thread"
      }).catch((err) => ({ ok: false, error: err.message || String(err) }));

      if (opened.ok) {
        await waitForTabLoaded(watcherTabId, 8000);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        result = await chrome.tabs.sendMessage(watcherTabId, {
          type: "ferocity_send_marketplace_message",
          payload: {
            action_id: action.id,
            body: action.body,
            external_thread_id: action.external_thread_id
          }
        }).catch((err) => ({ ok: false, error: err.message || String(err), opened }));
      } else {
        result = { ...result, opened };
      }
    }

    await reportSendResult(action, result);
    await setStatus({
      lastSendAt: new Date().toISOString(),
      lastSendActionId: action.id,
      lastSendResult: result,
      mode: "send_enabled"
    });
    return result;
  } finally {
    await chrome.storage.local.remove(SEND_LOCK_KEY);
  }
}

async function pollSendActions() {
  const config = await getConfig();
  if (!config.sendActionsEnabled) return { ok: true, skipped: "send_actions_disabled" };

  const data = await requestFerocity("action/claim", {});
  const actions = data.action ? [{
    id: data.action.id,
    body: data.action.body,
    external_thread_id: data.action.externalConversationRef || "",
    metadata: { page_url: data.action.sourceUrl || "" }
  }] : [];
  for (const action of actions) {
    await processSendAction(action);
  }

  await setStatus({
    lastPollAt: new Date().toISOString(),
    lastPollActionCount: actions.length,
    sendCapability: "enabled",
    mode: "send_enabled"
  });
  return { ok: true, actions: actions.length };
}

async function sendPageDebug() {
  const { watcherTabId } = await chrome.storage.local.get(WATCHER_TAB_KEY);
  const tab = watcherTabId ? await chrome.tabs.get(watcherTabId).catch(() => null) : null;
  const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!targetTab?.id) throw new Error("No active Facebook tab available for debug");

  const snapshot = await chrome.tabs.sendMessage(targetTab.id, {
    type: "ferocity_page_debug_snapshot"
  }).catch((err) => ({ ok: false, error: err.message || String(err), tabUrl: targetTab.url }));

  const result = await requestFerocity("health", {
    state: healthState(snapshot),
    reason: healthReason(snapshot),
    url: snapshot?.details?.url || snapshot?.tabUrl || "https://www.facebook.com/messages/requests",
    connectorVersion: CONNECTOR_VERSION
  });
  await setStatus({ lastPageDebugAt: new Date().toISOString(), lastPageDebugResult: result, lastError: "" });
  return { ok: true, snapshot, result };
}

async function recordPageDebugReport(details) {
  const result = await requestFerocity("health", {
    state: healthState(details),
    reason: healthReason(details),
    url: details?.url || "https://www.facebook.com/messages/requests",
    connectorVersion: CONNECTOR_VERSION
  });
  await setStatus({ lastPageDebugAt: new Date().toISOString(), lastPageDebugResult: result, lastError: "" });
  return result;
}

async function reportConnectorHeartbeat() {
  const config = await getConfig();
  if (!config.connectorToken) return { ok: true, skipped: "not_paired" };
  const { watcherTabId } = await chrome.storage.local.get(WATCHER_TAB_KEY);
  const tab = watcherTabId ? await chrome.tabs.get(watcherTabId).catch(() => null) : null;
  let snapshot = null;
  if (tab?.id && isFacebookUrl(tab.url)) {
    snapshot = await chrome.tabs.sendMessage(tab.id, { type: "ferocity_page_debug_snapshot" }).catch(() => null);
  }
  const details = snapshot?.details || snapshot || {};
  const state = tab?.id && isFacebookUrl(tab.url) ? healthState(details) : "warning";
  const reason = tab?.id && isFacebookUrl(tab.url)
    ? healthReason(details)
    : "The Ferocity Facebook watcher tab is not open. Inbound observation and approved replies may be delayed.";
  const result = await requestFerocity("health", {
    state,
    reason,
    url: details?.url || tab?.url || "https://www.facebook.com/messages/requests",
    connectorVersion: CONNECTOR_VERSION
  });
  await setStatus({ lastHeartbeatAt: new Date().toISOString(), lastHeartbeatState: state, lastHeartbeatResult: result, lastError: "" });
  return result;
}

function healthState(snapshot) {
  snapshot = snapshot?.details || snapshot || {};
  const text = `${snapshot?.title || ""} ${snapshot?.bodyHint || ""}`.toLowerCase();
  if (/checkpoint|security check|confirm your identity|two-factor|enter code|captcha/.test(text)) return "verification_required";
  if (/account restricted|temporarily blocked|you can't use this feature/.test(text)) return "restricted";
  if (snapshot?.isRealThreadPage === false && /facebook\.com|messenger\.com/.test(snapshot?.url || "")) return "warning";
  return "ready";
}

function healthReason(snapshot) {
  snapshot = snapshot?.details || snapshot || {};
  const state = healthState(snapshot);
  if (state === "verification_required") return "Facebook requires the account owner to complete verification manually.";
  if (state === "restricted") return "Facebook appears to have restricted this account or action.";
  if (state === "warning") return "The connector is online but is not currently inside a supported Messenger thread.";
  return "Known Facebook/Messenger surface detected.";
}

function normalizeObservation(payload) {
  return {
    providerEventId: String(payload?.external_event_id || ""),
    externalConversationRef: String(payload?.external_thread_id || ""),
    externalActorId: String(payload?.external_sender_id || payload?.external_thread_id || ""),
    displayName: String(payload?.prospect_name || "") || undefined,
    body: String(payload?.message_body || ""),
    sourceUrl: String(payload?.page_url || ""),
    surface: "messenger",
    connectorVersion: CONNECTOR_VERSION,
    observedAt: payload?.occurred_at || new Date().toISOString()
  };
}

async function requestFerocity(path, payload, options = {}) {
  const config = await getConfig();
  if (!config.connectorToken) throw new Error("Missing connector token");
  const deviceId = await getSessionId();
  const res = await fetch(`${API_BASE}/${path}`, {
    method: options.method || "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${config.connectorToken}`,
      "x-ferocity-device-id": deviceId
    },
    body: options.method === "DELETE" ? undefined : JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) await setStatus({ credentialExpired: true, lastError: "Connector credential expired or was revoked. Create a new Ferocity pairing code." });
    throw new Error(data.error || `Ferocity request failed (${res.status})`);
  }
  return data;
}

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULTS));
  await chrome.storage.local.set({ ...DEFAULTS, ...existing, observeEnabled: true });
  await getSessionId();
  await setStatus({ installedAt: new Date().toISOString(), connectorVersion: CONNECTOR_VERSION, sendCapability: existing.sendActionsEnabled ? "enabled" : "disabled" });
  chrome.alarms.create("ferocity_watcher_tick", { periodInMinutes: Math.max(1, Number(existing.scanIntervalMinutes || DEFAULTS.scanIntervalMinutes)) });
  chrome.alarms.create("ferocity_send_tick", { periodInMinutes: 1 });
  chrome.alarms.create("ferocity_health_tick", { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("ferocity_watcher_tick", { periodInMinutes: 1 });
  chrome.alarms.create("ferocity_send_tick", { periodInMinutes: 1 });
  chrome.alarms.create("ferocity_health_tick", { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "ferocity_watcher_tick") {
    visitNextQueuedThread().catch((err) => setStatus({ lastError: err.message || String(err) }));
  }
  if (alarm.name === "ferocity_send_tick") {
    pollSendActions().catch((err) => setStatus({ lastError: err.message || String(err) }));
  }
  if (alarm.name === "ferocity_health_tick") {
    reportConnectorHeartbeat().catch((err) => setStatus({ lastError: err.message || String(err), lastHeartbeatFailedAt: new Date().toISOString() }));
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "ferocity_marketplace_event") {
      const config = await getConfig();
      if (!config.observeEnabled) return { ok: true, skipped: "observe_disabled" };
      const result = await requestFerocity("observe", normalizeObservation(message.payload));
      await setStatus({ lastEventAt: new Date().toISOString(), lastEventResult: result, lastError: "" });
      return result;
    }

    if (message?.type === "ferocity_thread_discovered") {
      return await enqueueThread(message.payload);
    }

    if (message?.type === "ferocity_start_watcher") {
      return await visitNextQueuedThread();
    }

    if (message?.type === "ferocity_open_facebook_login") {
      return await openFacebookLogin();
    }

    if (message?.type === "ferocity_open_facebook_inbox") {
      return await openFacebookInbox();
    }

    if (message?.type === "ferocity_open_message_requests") {
      return await openMessengerRequests();
    }

    if (message?.type === "ferocity_poll_send_actions") {
      return await pollSendActions();
    }

    if (message?.type === "ferocity_page_debug") {
      return await sendPageDebug();
    }

    if (message?.type === "ferocity_page_debug_report") {
      return await recordPageDebugReport(message.payload);
    }

    if (message?.type === "ferocity_pair_connector") {
      return await pairConnector(message.payload?.pairingCode, message.payload?.deviceName);
    }

    if (message?.type === "ferocity_disconnect_connector") {
      return await disconnectConnector();
    }

    if (message?.type === "ferocity_pause_connector") {
      return await setPaused(true);
    }

    if (message?.type === "ferocity_resume_connector") {
      return await setPaused(false);
    }

    if (message?.type === "ferocity_test_connection") {
      const result = await requestFerocity("health", {
        state: "ready",
        reason: "Customer requested a connector health check.",
        url: "https://www.facebook.com/messages/requests",
        connectorVersion: CONNECTOR_VERSION
      });
      await setStatus({ lastDiagnosticAt: new Date().toISOString(), lastDiagnosticResult: result, lastError: "" });
      return result;
    }

    if (message?.type === "ferocity_get_config") {
      const local = await chrome.storage.local.get(["pairInfo", "connectorStatus"]);
      return {
        ...(await getConfig()),
        deviceId: await getSessionId(),
        connectorVersion: CONNECTOR_VERSION,
        pairInfo: local.pairInfo || null,
        connectorStatus: local.connectorStatus || {},
      };
    }

    return { ok: false, error: "Unknown message type" };
  })()
    .then((result) => sendResponse(result))
    .catch(async (err) => {
      await setStatus({ lastError: err.message || String(err) });
      sendResponse({ ok: false, error: err.message || String(err) });
    });

  return true;
});
