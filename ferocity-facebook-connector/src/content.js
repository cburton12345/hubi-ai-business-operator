const FEROCITY_CHANNEL = "facebook";
const seenMessageKeys = new Set();
const seenAttachmentKeys = new Set();
const seenThreadLinks = new Set();
let lastDebugKey = "";

function textOf(node) {
  return (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
}

function stableHash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function stableUrlKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return String(url || "").split("?")[0];
  }
}

function isMarketplaceLikePage() {
  const url = location.href;
  return /(facebook\.com\/(marketplace|messages|messenger|groups|commerce)|messenger\.com)/i.test(url);
}

function isRealThreadPage() {
  return /\/messages\/(?:e2ee\/)?(?:requests\/)?t\/[^/]+|messenger\.com\/t\/[^/]+/i.test(location.href);
}

function isSystemOrChromeText(body) {
  const text = String(body || "").trim();
  return /^(to:|search|chats?|messages?|message requests?|no internet connection|try again|loading|delete|notifications?|new message|active now|compose|messenger|conversation with .+)$/i.test(text) ||
    /^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(text) ||
    /^messages and calls are secured with end-to-end encryption/i.test(text) ||
    / created this group$/i.test(text);
}

function findThreadId() {
  const url = new URL(location.href);
  const fbThread = url.pathname.match(/\/messages\/(?:e2ee\/)?(?:requests\/)?t\/([^/]+)/i);
  if (fbThread?.[1]) return decodeURIComponent(fbThread[1]);
  const messengerThread = url.pathname.match(/\/t\/([^/]+)/i);
  if (messengerThread?.[1]) return decodeURIComponent(messengerThread[1]);

  return url.searchParams.get("thread_id") ||
    url.searchParams.get("seller_profile_id") ||
    url.pathname.split("/").filter(Boolean).slice(-3).join(":") ||
    stableHash(location.href);
}

function findListingContext() {
  const url = location.href;
  const marketplaceSignal = /\/marketplace\/|seller_profile_id=|listing_id=|item_id=/i.test(url) ||
    /marketplace/i.test(document.title);

  if (!marketplaceSignal) {
    return {
      listing_title: "",
      source_context: "general_messenger"
    };
  }

  const titleSelectors = [
    "[aria-label*='Marketplace'] h1",
    "[role='main'] h1",
    "h1"
  ];

  for (const selector of titleSelectors) {
    const text = textOf(document.querySelector(selector));
    if (text && text.length > 4 && text.length < 160 && !/^(notifications?|messages?|chats?|useful)$/i.test(text)) {
      return {
        listing_title: text,
        source_context: "marketplace_listing"
      };
    }
  }

  return {
    listing_title: "",
    source_context: "marketplace_unknown_listing"
  };
}

function candidateMessageNodes(root = document) {
  const selectors = [
    "[data-scope='messages_table'] [role='row']",
    "[aria-label*='Message'] [dir='auto']",
    "[role='log'] [dir='auto']"
  ];

  return selectors.flatMap((selector) => [...root.querySelectorAll(selector)]);
}

function candidateAttachmentNodes(root = document) {
  const selectors = [
    "[role='main'] img[src*='scontent']",
    "[role='log'] img[src*='scontent']",
    "[aria-label*='Message'] img[src*='scontent']",
    "[aria-label*='Photo']",
    "[aria-label*='Image']"
  ];

  return selectors.flatMap((selector) => [...root.querySelectorAll(selector)]);
}

function isProbablyInbound(node) {
  const aria = [
    node.getAttribute("aria-label"),
    node.closest("[aria-label]")?.getAttribute("aria-label"),
    node.closest("[data-testid]")?.getAttribute("data-testid")
  ].filter(Boolean).join(" ").toLowerCase();

  if (/you sent|outgoing|sent by you|you:/.test(aria)) return false;
  const rect = node.getBoundingClientRect();
  return rect.left < window.innerWidth * 0.62;
}

function extractProspectName() {
  const labels = [
    document.querySelector("[role='main'] h1"),
    document.querySelector("[aria-current='page']"),
    document.querySelector("h1")
  ].map(textOf).filter(Boolean);

  return labels.find((label) => label.length < 80 && !/marketplace|messenger|facebook/i.test(label)) || "";
}

function cleanProspectName(name) {
  return String(name || "")
    .replace(/\s+Unread message:.*$/i, "")
    .replace(/\s+·\s+.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ariaTextForNode(node) {
  return [
    node.getAttribute("aria-label"),
    node.closest("[aria-label]")?.getAttribute("aria-label")
  ].filter(Boolean).join(" ");
}

function extractProspectNameFromNode(node, body) {
  const aria = ariaTextForNode(node);
  const escapedBody = String(body || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = escapedBody ? aria.match(new RegExp(`(?:^|,\\s*)([^:,]{2,80}):\\s*${escapedBody.slice(0, 80)}`, "i")) : null;
  if (exact?.[1] && !/^you$/i.test(exact[1].trim())) return cleanProspectName(exact[1]);

  const generic = aria.match(/(?:^|,\s*)([^:,]{2,80}):\s+.+$/);
  if (generic?.[1] && !/^you$/i.test(generic[1].trim())) return cleanProspectName(generic[1]);

  return cleanProspectName(extractProspectName());
}

function hasMessageAria(node, body) {
  const aria = ariaTextForNode(node);
  const text = String(body || "").trim();
  if (!aria || !text) return false;
  if (/^you[:\s]/i.test(aria) || /sent by you|you sent/i.test(aria)) return false;
  return new RegExp(`(^|,\\s*)[^:,]{2,80}:\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 80)}`, "i").test(aria);
}

function attachmentInfo(node) {
  const img = node.matches?.("img") ? node : node.querySelector?.("img");
  const rect = (img || node).getBoundingClientRect();
  const src = img?.currentSrc || img?.src || "";
  const alt = img?.alt || node.getAttribute?.("aria-label") || "";

  if (src.startsWith("data:") || src.startsWith("blob:")) return null;
  if (rect.width < 80 || rect.height < 80) return null;
  if (/profile|avatar|emoji|sticker/i.test(alt)) return null;

  return {
    type: "image",
    src,
    alt: alt.slice(0, 240),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visibleNodes(selector) {
  return [...document.querySelectorAll(selector)].filter((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  });
}

function findMessageInput() {
  const selectors = [
    "[contenteditable='true'][role='textbox']",
    "[aria-label*='Message'][contenteditable='true']",
    "[data-lexical-editor='true']",
    "textarea[aria-label*='Message']",
    "textarea"
  ];

  for (const selector of selectors) {
    const candidates = visibleNodes(selector);
    const node = candidates[candidates.length - 1];
    if (node) return node;
  }

  return null;
}

function findSendButton() {
  const selectors = [
    "[aria-label='Press Enter to send']",
    "[aria-label*='Send']",
    "div[role='button'][aria-label*='Send']",
    "button[aria-label*='Send']"
  ];

  for (const selector of selectors) {
    const candidates = visibleNodes(selector);
    const enabled = candidates.find((node) => !node.getAttribute("aria-disabled") && !node.disabled);
    if (enabled) return enabled;
  }

  return null;
}

async function pressEnterToSend(input) {
  input.focus();
  input.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  }));
  input.dispatchEvent(new KeyboardEvent("keyup", {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true
  }));
  await sleep(900);

  const remaining = textOf(input);
  return {
    ok: remaining.length === 0,
    external_message_id: `fb-send-enter:${findThreadId()}:${Date.now()}`,
    page_url: location.href,
    fallback: "enter_key"
  };
}

function insertTextIntoMessageInput(input, body) {
  input.focus();

  if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
    input.value = body;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(input);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("delete", false, null);
  input.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "deleteContentBackward",
    data: null
  }));

  range.selectNodeContents(input);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertText", false, body);
  input.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    inputType: "insertText",
    data: body
  }));
}

async function sendMarketplaceMessage(body) {
  if (!isMarketplaceLikePage()) return { ok: false, error: "Not on a Facebook Marketplace/Messenger page" };
  if (!isRealThreadPage()) return { ok: false, error: "Not inside a real Facebook message thread" };
  const cleanBody = String(body || "").trim();
  if (!cleanBody) return { ok: false, error: "Empty reply body" };

  const input = findMessageInput();
  if (!input) return { ok: false, error: "Could not find a visible Facebook message input" };

  insertTextIntoMessageInput(input, cleanBody);
  await sleep(700);

  const button = findSendButton();
  if (!button) {
    const enterResult = await pressEnterToSend(input);
    if (enterResult.ok) return enterResult;
    return { ok: false, error: "Could not find an enabled Facebook send button after typing" };
  }

  button.click();
  return {
    ok: true,
    external_message_id: `fb-send:${findThreadId()}:${stableHash(cleanBody)}:${Date.now()}`,
    page_url: location.href
  };
}

async function openFirstVisibleMessageThread() {
  const selectors = [
    "a[href*='/messages/t/']",
    "a[href*='messenger.com/t/']",
    "[role='row'] a[href*='/messages/']",
    "[role='main'] a[href*='/messages/']"
  ];

  for (const selector of selectors) {
    const links = visibleNodes(selector).filter((link) => {
      const href = link.href || link.getAttribute?.("href") || "";
      return href && !/\/new\/?$/i.test(href) && !/\/requests\/?$/i.test(href);
    });
    const link = links[0];
    if (link) {
      link.click();
      await sleep(1800);
      return { ok: true, opened: link.href || link.getAttribute("href") };
    }
  }

  return { ok: false, error: "Could not find a visible message thread link" };
}

function pageDebugSnapshot() {
  const messageNodes = candidateMessageNodes().slice(-40).map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      text: textOf(node).slice(0, 220),
      aria: [
        node.getAttribute("aria-label"),
        node.closest("[aria-label]")?.getAttribute("aria-label")
      ].filter(Boolean).join(" | ").slice(0, 220),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      inboundGuess: isProbablyInbound(node),
    };
  }).filter((item) => item.text || item.aria);

  const inputs = [
    "[contenteditable='true'][role='textbox']",
    "[aria-label*='Message'][contenteditable='true']",
    "[data-lexical-editor='true']",
    "textarea[aria-label*='Message']",
    "textarea"
  ].flatMap((selector) => visibleNodes(selector).map((node) => ({
    selector,
    text: textOf(node).slice(0, 160),
    aria: node.getAttribute("aria-label") || "",
    role: node.getAttribute("role") || "",
    editable: node.getAttribute("contenteditable") || "",
  })));

  return {
    url: location.href,
    title: document.title,
    threadId: findThreadId(),
    isRealThreadPage: isRealThreadPage(),
    messageNodes,
    inputs,
    bodyHint: document.body.innerText.slice(0, 800),
  };
}

async function sendEvent(payload) {
  return await chrome.runtime.sendMessage({
    type: "ferocity_marketplace_event",
    payload
  });
}

async function sendThreadDiscovered(payload) {
  return await chrome.runtime.sendMessage({
    type: "ferocity_thread_discovered",
    payload
  });
}

function candidateThreadLinks(root = document) {
  const selectors = [
    "a[href*='/messages/']",
    "a[href*='/messenger/']",
    "a[href*='messenger.com/t/']",
    "a[href*='/marketplace/item/']",
    "a[href*='/marketplace/you/selling']",
    "a[href*='seller_profile_id=']",
    "a[href*='thread_id=']"
  ];

  return selectors.flatMap((selector) => [...root.querySelectorAll(selector)]);
}

function discoverThreadLinks() {
  if (!isMarketplaceLikePage()) return;

  for (const link of candidateThreadLinks().slice(-80)) {
    const href = link.href || link.getAttribute("href") || "";
    if (!href || seenThreadLinks.has(href)) continue;
    seenThreadLinks.add(href);

    sendThreadDiscovered({
      url: href,
      label: textOf(link).slice(0, 180),
      source: "facebook_dom_link",
      page_url: location.href,
      occurred_at: new Date().toISOString()
    }).catch(() => {});
  }
}

function inspectMessageNode(node) {
  if (!isMarketplaceLikePage()) return;
  if (!isRealThreadPage()) return;

  const body = textOf(node);
  if (!body || body.length < 2 || body.length > 4000) return;
  if (isSystemOrChromeText(body)) return;
  if (!hasMessageAria(node, body)) return;
  if (!isProbablyInbound(node)) return;

  const threadId = findThreadId();
  if (/^messages:(new|requests?)$/i.test(threadId) || threadId === "messages:new") return;
  const messageKey = `${threadId}:${stableHash(body)}`;
  if (seenMessageKeys.has(messageKey)) return;
  seenMessageKeys.add(messageKey);

  const listing = findListingContext();
  const prospectName = extractProspectNameFromNode(node, body);
  const payload = {
    type: "message_received",
    channel: FEROCITY_CHANNEL,
    external_event_id: `fb:${messageKey}`,
    external_thread_id: threadId,
    external_message_id: `fbm:${messageKey}`,
    external_sender_id: prospectName || threadId,
    prospect_name: prospectName,
    message_body: body,
    direction: "inbound",
    occurred_at: new Date().toISOString(),
    page_url: location.href,
    ...listing,
    raw: {
      selector_version: "fb-marketplace-content-v1",
      page_title: document.title
    }
  };

  sendEvent(payload).catch(() => {});
}

function inspectAttachmentNode(node) {
  if (!isMarketplaceLikePage()) return;
  if (!isRealThreadPage()) return;
  if (!isProbablyInbound(node)) return;

  const attachment = attachmentInfo(node);
  if (!attachment) return;

  const threadId = findThreadId();
  if (/^messages:(new|requests?)$/i.test(threadId) || threadId === "messages:new") return;
  const attachmentKey = `${threadId}:${stableHash(`${stableUrlKey(attachment.src)}:${attachment.alt}:${attachment.width}:${attachment.height}`)}`;
  if (seenAttachmentKeys.has(attachmentKey)) return;
  seenAttachmentKeys.add(attachmentKey);

  const surroundingText = textOf(node.closest("[role='row'], [role='article'], [aria-label*='Message']") || node);
  const listing = findListingContext();
  const prospectName = extractProspectNameFromNode(node, surroundingText);
  const payload = {
    type: "message_received",
    channel: FEROCITY_CHANNEL,
    external_event_id: `fb-photo:${attachmentKey}`,
    external_thread_id: threadId,
    external_message_id: `fbm-photo:${attachmentKey}`,
    external_sender_id: prospectName || threadId,
    prospect_name: prospectName,
    message_body: surroundingText && surroundingText.length > 1 && !isSystemOrChromeText(surroundingText) ? surroundingText : "[Photo received]",
    direction: "inbound",
    occurred_at: new Date().toISOString(),
    page_url: location.href,
    ...listing,
    raw: {
      selector_version: "fb-marketplace-content-v2",
      page_title: document.title,
      attachments: [attachment]
    }
  };

  sendEvent(payload).catch(() => {});
}

function scanCurrentPage() {
  discoverThreadLinks();
  if (!isRealThreadPage()) return;
  candidateMessageNodes().slice(-30).forEach(inspectMessageNode);
  candidateAttachmentNodes().slice(-30).forEach(inspectAttachmentNode);
}

function reportPageDebug(reason = "heartbeat") {
  if (!isMarketplaceLikePage()) return;

  const snapshot = pageDebugSnapshot();
  const debugKey = [
    snapshot.url,
    snapshot.isRealThreadPage,
    snapshot.inputs.length,
    snapshot.messageNodes.length,
    snapshot.bodyHint.slice(0, 80)
  ].join("|");

  if (debugKey === lastDebugKey && reason !== "initial") return;
  lastDebugKey = debugKey;

  chrome.runtime.sendMessage({
    type: "ferocity_page_debug_report",
    payload: {
      ...snapshot,
      reason
    }
  }).catch(() => {});
}

let scanTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(scanCurrentPage, 800);
});

observer.observe(document.documentElement, { childList: true, subtree: true });
setInterval(scanCurrentPage, 5000);
setInterval(() => reportPageDebug("heartbeat"), 10000);
scanCurrentPage();
setTimeout(() => reportPageDebug("initial"), 4000);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "ferocity_send_marketplace_message") return await sendMarketplaceMessage(message.payload?.body);
    if (message?.type === "ferocity_open_first_message_thread") return await openFirstVisibleMessageThread();
    if (message?.type === "ferocity_page_debug_snapshot") return { ok: true, details: pageDebugSnapshot() };
    return { ok: false, error: "Unknown message type" };
  })()
    .then((result) => sendResponse(result))
    .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));

  return true;
});
