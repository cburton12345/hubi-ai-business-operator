const $ = (id) => document.getElementById(id);
let currentAction = null;

function background(message) { return chrome.runtime.sendMessage(message); }
function show(message, bad = false) { $("status").textContent = message; $("status").style.borderColor = bad ? "#e46767" : "#27304a"; }
async function activeFacebookTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(www|web)\.facebook\.com\//.test(tab.url || "")) throw new Error("Open the legitimate Facebook page first.");
  return tab;
}
async function tabMessage(type) { const tab = await activeFacebookTab(); return chrome.tabs.sendMessage(tab.id, { type }); }

async function refresh() {
  const state = await background({ type: "STATE" });
  $("pairing").hidden = Boolean(state.token); $("connected").hidden = !state.token;
  show(state.token ? "Connected. Actions remain review-first." : "Not connected.");
}

$("pair").onclick = async () => {
  show("Pairing…");
  const result = await background({ type: "PAIR", code: $("pairingCode").value, apiBase: $("apiBase").value });
  if (!result.ok) return show(result.error, true); await refresh();
};
$("capture").onclick = async () => {
  try {
    const capture = await tabMessage("FEROCITY_CAPTURE_SELECTION");
    await background({ type: "HEALTH", health: capture.health });
    if (!capture.ok) return show(capture.error || capture.health.reason, true);
    const result = await background({ type: "OBSERVE", observation: capture.observation });
    show(result.ok ? (result.duplicate ? "Already captured." : "Captured for Ferocity review.") : result.error, !result.ok);
  } catch (error) { show(error.message, true); }
};
$("claim").onclick = async () => {
  const result = await background({ type: "CLAIM" });
  if (!result.ok) return show(result.error, true);
  currentAction = result.action; $("action").hidden = !currentAction;
  if (!currentAction) return show(result.message);
  $("actionBody").value = currentAction.body || ""; show("One approved action is ready. Review it before completing it.");
};
$("copyOpen").onclick = async () => {
  if (!currentAction) return;
  await navigator.clipboard.writeText(currentAction.body || "");
  if (currentAction.sourceUrl) await chrome.tabs.create({ url: currentAction.sourceUrl });
  show("Copied. Complete the action on Facebook, then confirm the real outcome here.");
};
async function confirm(outcome) {
  if (!currentAction) return;
  const failureMessage = outcome === "succeeded" ? undefined : prompt("What prevented completion?") || "Owner reported that the action was not completed.";
  const result = await background({ type: "CONFIRM", confirmation: { actionId: currentAction.id, outcome, failureMessage, observedUrl: currentAction.sourceUrl } });
  if (!result.ok) return show(result.error, true);
  currentAction = null; $("action").hidden = true; show(outcome === "succeeded" ? "Recorded as completed." : "Failure recorded and surfaced in Ferocity.");
}
$("success").onclick = () => confirm("succeeded");
$("failed").onclick = () => confirm("failed");
$("disconnect").onclick = async () => { await background({ type: "DISCONNECT" }); await refresh(); };
refresh();
