const DEFAULTS = {
  observeEnabled: true,
  watcherEnabled: true,
  sendActionsEnabled: false,
  inboxUrl: "https://www.facebook.com/messages/requests",
  scanIntervalMinutes: 1
};

const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const config = { ...DEFAULTS, ...stored };
  $("observeEnabled").checked = config.observeEnabled !== false;
  $("watcherEnabled").checked = config.watcherEnabled !== false;
  $("sendActionsEnabled").checked = config.sendActionsEnabled === true;
  $("inboxUrl").value = config.inboxUrl;
  const runtimeConfig = await chrome.runtime.sendMessage({ type: "ferocity_get_config" }).catch(() => null);
  if (runtimeConfig) {
    const pair = runtimeConfig.pairInfo || {};
    $("sessionInfo").textContent = [
      `Device: ${runtimeConfig.deviceId || "creating..."}`,
      `Version: ${runtimeConfig.connectorVersion || "unknown"}`,
      pair.tenantId ? `Workspace: ${pair.tenantId}` : "Not paired",
      pair.brandId ? `Brand: ${pair.brandId}` : "",
      pair.identityId ? `Facebook identity: ${pair.identityId}` : "",
      pair.expiresAt ? `Credential expires: ${new Date(pair.expiresAt).toLocaleString()}` : ""
    ].filter(Boolean).join(" | ");
  }
}

async function save() {
  await chrome.storage.local.set({
    observeEnabled: $("observeEnabled").checked,
    watcherEnabled: $("watcherEnabled").checked,
    sendActionsEnabled: $("sendActionsEnabled").checked,
    inboxUrl: $("inboxUrl").value.trim() || DEFAULTS.inboxUrl
  });
  $("status").textContent = "Saved.";
}

async function run(type, payload) {
  await save();
  const result = await chrome.runtime.sendMessage({ type, payload });
  $("status").textContent = JSON.stringify(result, null, 2);
  await load();
}

$("saveBtn").addEventListener("click", save);
$("pairBtn").addEventListener("click", async () => {
  await run("ferocity_pair_connector", {
    pairingCode: $("pairingCode").value.trim(),
    deviceName: $("deviceName").value.trim()
  });
  $("pairingCode").value = "";
});
$("testBtn").addEventListener("click", () => run("ferocity_test_connection").catch(showError));
$("watchBtn").addEventListener("click", () => run("ferocity_start_watcher").catch(showError));
$("loginBtn").addEventListener("click", () => run("ferocity_open_facebook_login").catch(showError));
$("inboxBtn").addEventListener("click", () => run("ferocity_open_facebook_inbox").catch(showError));
$("requestsBtn").addEventListener("click", () => run("ferocity_open_message_requests").catch(showError));
$("pollBtn").addEventListener("click", () => run("ferocity_poll_send_actions").catch(showError));
$("pauseBtn").addEventListener("click", () => run("ferocity_pause_connector").catch(showError));
$("resumeBtn").addEventListener("click", () => run("ferocity_resume_connector").catch(showError));
$("disconnectBtn").addEventListener("click", () => run("ferocity_disconnect_connector").catch(showError));

function showError(error) {
  $("status").textContent = error?.message || String(error);
}

load();
