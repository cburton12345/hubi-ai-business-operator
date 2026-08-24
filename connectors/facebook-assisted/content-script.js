const CONNECTOR_VERSION = "0.1.0";

function visibleText(selectors) {
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = node?.textContent?.trim();
    if (text) return text;
  }
  return "";
}

function inspectSurface() {
  const path = location.pathname.toLowerCase();
  const pageText = document.body?.innerText?.slice(0, 20000).toLowerCase() ?? "";
  const verification = ["confirm your identity", "security check", "verify your identity"].find((text) => pageText.includes(text));
  const restriction = ["account restricted", "you can't use this feature", "temporarily blocked"].find((text) => pageText.includes(text));
  const surface = path.includes("/groups/") ? "group" : path.includes("/messages/") ? "messenger" :
    (path.includes("/pages/") || path.includes("/profile.php") || path === "/") ? "page" : "unknown";
  return {
    url: location.href,
    connectorVersion: CONNECTOR_VERSION,
    surface,
    state: verification ? "verification_required" : restriction ? "restricted" : surface === "unknown" ? "connector_incompatible" : "ready",
    reason: verification || restriction || (surface === "unknown" ? "This Facebook screen is not recognized by the installed connector version." : undefined)
  };
}

function captureSelection() {
  const health = inspectSurface();
  if (health.state !== "ready") return { ok: false, health };
  const selected = window.getSelection()?.toString().trim() ?? "";
  if (!selected) return { ok: false, health, error: "Select the relevant Facebook text before capturing it." };
  const actor = visibleText([
    '[role="article"] h2', '[role="main"] h2', 'h1'
  ]) || "Facebook participant";
  const actorLink = document.querySelector('[role="article"] a[href*="facebook.com"], [role="main"] a[href*="facebook.com"]');
  return {
    ok: true,
    health,
    observation: {
      externalConversationRef: location.href.split("?")[0],
      externalActorId: actorLink?.getAttribute("href") || `${location.pathname}:${actor}`,
      displayName: actor,
      profileUrl: actorLink?.href || undefined,
      body: selected.slice(0, 10000),
      sourceUrl: location.href,
      surface: health.surface,
      connectorVersion: CONNECTOR_VERSION,
      observedAt: new Date().toISOString()
    }
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "FEROCITY_INSPECT") sendResponse(inspectSurface());
  if (message?.type === "FEROCITY_CAPTURE_SELECTION") sendResponse(captureSelection());
});
