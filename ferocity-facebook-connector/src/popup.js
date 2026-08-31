async function load() {
  const data = await chrome.storage.local.get([
    "observeEnabled", "watcherEnabled", "sendActionsEnabled", "connectorStatus", "pairInfo", "connectorToken"
  ]);
  const pair = data.pairInfo || {};
  const status = data.connectorStatus || {};
  document.getElementById("organization").textContent = pair.tenantId ? `${pair.tenantId.slice(0, 8)}...` : "Not paired";
  document.getElementById("destination").textContent = pair.brandId ? `${pair.brandId.slice(0, 8)}...` : "Not paired";
  document.getElementById("device").textContent = pair.deviceName || "Browser connector";
  document.getElementById("connected").textContent = data.connectorToken ? "Yes" : "No";
  document.getElementById("heartbeat").textContent = status.lastDiagnosticAt || status.lastPollAt || status.lastEventAt || "-";
  document.getElementById("observe").textContent = data.observeEnabled === false ? "Off" : "On";
  document.getElementById("watcher").textContent = data.watcherEnabled === false ? "Off" : "On";
  document.getElementById("send").textContent = data.sendActionsEnabled === true ? "On" : "Off";
  document.getElementById("status").textContent = JSON.stringify(status, null, 2);
}

async function run(type) {
  const result = await chrome.runtime.sendMessage({ type });
  document.getElementById("status").textContent = JSON.stringify(result, null, 2);
  await load();
}

document.getElementById("optionsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());
document.getElementById("watchBtn").addEventListener("click", () => run("ferocity_start_watcher"));
document.getElementById("loginBtn").addEventListener("click", () => run("ferocity_open_facebook_login"));
document.getElementById("requestsBtn").addEventListener("click", () => run("ferocity_open_message_requests"));
document.getElementById("pollBtn").addEventListener("click", () => run("ferocity_poll_send_actions"));
document.getElementById("debugBtn").addEventListener("click", () => run("ferocity_page_debug"));
document.getElementById("pauseBtn").addEventListener("click", () => run("ferocity_pause_connector"));
document.getElementById("resumeBtn").addEventListener("click", () => run("ferocity_resume_connector"));
document.getElementById("disconnectBtn").addEventListener("click", () => run("ferocity_disconnect_connector"));
load();
