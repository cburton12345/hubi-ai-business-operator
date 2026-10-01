import crypto from "node:crypto";
import fs from "node:fs";

const FACEBOOK_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "messenger.com", "www.messenger.com"]);

function stableId(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function facebookUrl(value) {
  try {
    const url = new URL(value);
    return FACEBOOK_HOSTS.has(url.hostname.toLowerCase()) ? url.toString() : null;
  } catch {
    return null;
  }
}

function facebookGroupUrl(value) {
  const safe = facebookUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const match = url.pathname.match(/^\/groups\/([^/?#]+)/i);
  if (!match || ["feed", "discover", "joins", "create"].includes(match[1].toLowerCase())) return null;
  return `https://www.facebook.com/groups/${encodeURIComponent(decodeURIComponent(match[1]))}`;
}

export class FacebookPlaywrightAdapter {
  constructor(config) {
    this.config = config;
    this.context = null;
    this.page = null;
    this.seen = new Map();
  }

  isRunning() {
    return Boolean(this.context && this.page && !this.page.isClosed());
  }

  async start() {
    if (this.isRunning()) return;
    if (this.context) await this.stop();
    fs.mkdirSync(this.config.profileDir, { recursive: true });
    const { chromium } = await import("playwright");
    const options = {
      headless: this.config.headless,
      viewport: { width: 1365, height: 900 },
      args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding"]
    };
    if (this.config.channel) options.channel = this.config.channel;
    this.context = await chromium.launchPersistentContext(this.config.profileDir, options);
    this.page = this.context.pages()[0] || await this.context.newPage();
    await this.page.goto(this.config.inboxUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  }

  async stop() {
    const context = this.context;
    this.context = null;
    this.page = null;
    if (context) await context.close().catch(() => {});
  }

  async inspectHealth() {
    if (!this.isRunning()) {
      return { state: "ready", browserState: "closed", url: this.config.inboxUrl, reason: "Worker is healthy and the persistent Facebook session is idle." };
    }
    const url = this.page.url() || this.config.inboxUrl;
    const title = await this.page.title().catch(() => "");
    const text = await this.page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const combined = `${title}\n${text}`;
    if (/checkpoint|confirm your identity|security check|enter (the )?code|captcha/i.test(combined)) {
      return { state: "verification_required", browserState: "attention_required", url, reason: "Facebook requires the account owner to complete a security check." };
    }
    if (/temporarily blocked|account restricted|you can(?:'|’)t use this feature|can(?:'|’)t send messages/i.test(combined)) {
      return { state: "restricted", browserState: "attention_required", url, reason: "Facebook reported a restriction or messaging block." };
    }
    if (/log into facebook|email address or phone number/i.test(combined) || /\/login(?:\/|\?|$)/i.test(url)) {
      return { state: "verification_required", browserState: "attention_required", url, reason: "The customer must sign into Facebook in the worker browser." };
    }
    if (!facebookUrl(url)) {
      return { state: "connector_incompatible", browserState: "failed", url: this.config.inboxUrl, reason: "The worker browser is not on a recognized Facebook or Messenger page." };
    }
    return { state: "ready", browserState: "ready", url, reason: "Facebook session is available." };
  }

  pruneSeen(now = Date.now()) {
    for (const [key, seenAt] of this.seen) {
      if (now - seenAt > 24 * 60 * 60 * 1000) this.seen.delete(key);
    }
    while (this.seen.size > 5000) this.seen.delete(this.seen.keys().next().value);
  }

  async collectObservations() {
    if (!this.isRunning()) throw new Error("Browser is not running.");
    const health = await this.inspectHealth();
    if (health.state !== "ready") return [];
    if (!facebookUrl(this.page.url())) await this.page.goto(this.config.inboxUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });

    const discovered = await this.page.evaluate(() => {
      const links = [...document.querySelectorAll("a[href*='/messages/'],a[href*='messenger.com/t/']")];
      return links.map((link) => link.href).filter((href) => /\/messages\/(?:e2ee\/)?(?:requests\/)?t\/|messenger\.com\/t\//i.test(href));
    }).catch(() => []);
    const urls = [...new Set([this.page.url(), ...discovered].map(facebookUrl).filter(Boolean))]
      .slice(0, this.config.maxThreadsPerSweep);
    const observations = [];

    for (const url of urls) {
      if (this.page.url() !== url) {
        await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
        await this.page.waitForTimeout(900);
      }
      if (!/\/messages\/(?:e2ee\/)?(?:requests\/)?t\/|messenger\.com\/t\//i.test(this.page.url())) continue;
      const extracted = await this.page.evaluate(() => {
        const textOf = (node) => (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
        const system = (text) => /^(search|chats?|messages?|message requests?|notifications?|new message|active now|compose|messenger|delivered|seen)$/i.test(text)
          || /^messages and calls are secured with end-to-end encryption/i.test(text)
          || /^\d{1,2}:\d{2}\s*(am|pm)?$/i.test(text);
        const path = location.pathname;
        const thread = path.match(/\/messages\/(?:e2ee\/)?(?:requests\/)?t\/([^/]+)/i)?.[1]
          || path.match(/\/t\/([^/]+)/i)?.[1] || path;
        const selectors = ["[data-scope='messages_table'] [role='row']", "[aria-label*='Message'] [dir='auto']", "[role='log'] [dir='auto']"];
        const nodes = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).slice(-50);
        return nodes.map((node) => {
          const body = textOf(node);
          const aria = [node.getAttribute("aria-label"), node.closest("[aria-label]")?.getAttribute("aria-label")].filter(Boolean).join(" ");
          const rect = node.getBoundingClientRect();
          const outgoing = /you sent|sent by you|^you[:\s]/i.test(aria) || rect.left >= innerWidth * 0.62;
          const match = aria.match(/(?:^|,\s*)([^:,]{2,80}):\s+.+$/);
          const header = textOf(document.querySelector("[role='main'] h1")) || textOf(document.querySelector("h1"));
          const name = (match?.[1] || header || thread).replace(/\s+Unread message:.*$/i, "").replace(/\s+·\s+.*$/i, "").trim();
          return { body, aria, outgoing, name, thread };
        }).filter((item) => item.body.length >= 2 && item.body.length <= 4000 && !item.outgoing && !system(item.body) && item.aria);
      }).catch(() => []);

      for (const item of extracted) {
        const key = `${item.thread}:${stableId(item.body)}`;
        if (this.seen.has(key)) continue;
        this.seen.set(key, Date.now());
        observations.push({
          providerEventId: `fb-worker:${key}`,
          externalConversationRef: item.thread,
          externalActorId: item.name || item.thread,
          displayName: item.name || undefined,
          body: item.body,
          sourceUrl: this.page.url(),
          surface: "messenger",
          connectorVersion: "marketplace-worker-0.3.0",
          observedAt: new Date().toISOString()
        });
      }
    }
    this.pruneSeen();
    return observations;
  }

  async collectCommunitySnapshots(plan = {}) {
    if (!this.isRunning()) throw new Error("Browser is not running.");
    const discoveryUrls = [this.config.groupsFeedUrl,
      ...[...new Set(Array.isArray(plan.searchTerms) ? plan.searchTerms : [])]
        .filter((term) => typeof term === "string" && term.trim().length >= 3)
        .slice(0, 8)
        .map((term) => `https://www.facebook.com/search/groups/?q=${encodeURIComponent(term.trim().slice(0, 100))}`)
    ];
    const discovered = [];
    for (const discoveryUrl of discoveryUrls) {
      await this.page.goto(discoveryUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await this.page.waitForTimeout(1400);
      const health = await this.inspectHealth();
      if (health.state !== "ready") break;
      const pageItems = await this.page.evaluate(() => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        return [...document.querySelectorAll("a[href*='/groups/']")].map((link) => {
          const href = link.href;
          const name = clean(link.getAttribute("aria-label") || link.innerText || link.textContent);
          const context = clean(link.closest("[role='article'],li,div")?.innerText);
          return { href, name, context };
        }).filter((item) => item.name.length >= 2 && item.name.length <= 240);
      }).catch(() => []);
      discovered.push(...pageItems);
      if (discovered.length >= this.config.maxCommunitiesPerSweep * 3) break;
    }

    const candidates = [];
    const seenUrls = new Set();
    for (const item of discovered) {
      const url = facebookGroupUrl(item.href);
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      candidates.push({ ...item, url });
      if (candidates.length >= this.config.maxCommunitiesPerSweep) break;
    }

    const snapshots = [];
    for (const candidate of candidates) {
      const aboutUrl = `${candidate.url}/about`;
      await this.page.goto(aboutUrl, { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null);
      await this.page.waitForTimeout(1000);
      const currentHealth = await this.inspectHealth();
      if (currentHealth.state !== "ready") break;
      const details = await this.page.evaluate(() => {
        const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
        const headings = [...document.querySelectorAll("h1,h2,h3,[role='heading']")];
        const title = clean(headings.find((node) => node.tagName === "H1")?.textContent || document.title.replace(/\s*\|\s*Facebook.*$/i, ""));
        const rulesHeading = headings.find((node) => /^(group rules|rules from the admins|rules)$/i.test(clean(node.textContent)));
        let rulesText = "";
        if (rulesHeading) {
          let container = rulesHeading.parentElement;
          while (container && clean(container.innerText).length < 80) container = container.parentElement;
          rulesText = clean(container?.innerText).slice(0, 10_000);
        }
        const pageText = clean(document.querySelector("[role='main']")?.innerText);
        const membershipState = /\bjoined\b/i.test(pageText) ? "joined" : /\bjoin group\b/i.test(pageText) ? "available" : "unknown";
        return { title, rulesText, membershipState };
      }).catch(() => ({ title: "", rulesText: "", membershipState: "unknown" }));
      const externalCommunityId = new URL(candidate.url).pathname.split("/").filter(Boolean)[1];
      const name = details.title || candidate.name;
      if (!name || !externalCommunityId) continue;
      const rulesFingerprint = stableId(details.rulesText || "rules-not-visible");
      snapshots.push({
        providerEventId: `fb-group:${externalCommunityId}:${rulesFingerprint}`,
        externalCommunityId,
        name,
        url: candidate.url,
        discoveryContext: candidate.context || undefined,
        rulesText: details.rulesText || undefined,
        rulesSourceUrl: details.rulesText ? aboutUrl : undefined,
        membershipState: details.membershipState,
        connectorVersion: "marketplace-worker-0.3.0",
        observedAt: new Date().toISOString()
      });
    }
    return snapshots;
  }

  async executeGroupPost(action, destination, body) {
    if (!facebookGroupUrl(destination)) {
      return { outcome: "blocked", failureCode: "invalid_group_destination", failureMessage: "The approved post did not target a specific Facebook group." };
    }
    await this.page.goto(destination, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await this.page.waitForTimeout(1200);
    const health = await this.inspectHealth();
    if (health.state !== "ready") return { outcome: "blocked", failureCode: health.state, failureMessage: health.reason, observedUrl: this.page.url() };

    const triggers = this.page.locator("[role='button'],button").filter({ hasText: /write something|create (a )?post/i });
    let trigger = null;
    for (let index = 0; index < await triggers.count(); index += 1) {
      const candidate = triggers.nth(index);
      if (await candidate.isVisible().catch(() => false)) { trigger = candidate; break; }
    }
    if (!trigger) return { outcome: "failed", failureCode: "post_composer_not_found", failureMessage: "Facebook's group post composer could not be identified.", observedUrl: this.page.url() };
    await trigger.click();
    await this.page.waitForTimeout(700);

    const dialog = this.page.locator("[role='dialog']").last();
    const composers = dialog.locator("[contenteditable='true'][role='textbox'],[data-lexical-editor='true']");
    let composer = null;
    for (let index = (await composers.count()) - 1; index >= 0; index -= 1) {
      const candidate = composers.nth(index);
      if (await candidate.isVisible().catch(() => false)) { composer = candidate; break; }
    }
    if (!composer) return { outcome: "failed", failureCode: "post_editor_not_found", failureMessage: "The visible Facebook post editor could not be identified.", observedUrl: this.page.url() };
    await composer.fill(body).catch(async () => {
      await composer.click();
      await this.page.keyboard.type(body, { delay: 8 });
    });
    const postButtons = dialog.locator("[role='button'],button").filter({ hasText: /^post$/i });
    let postButton = null;
    for (let index = (await postButtons.count()) - 1; index >= 0; index -= 1) {
      const candidate = postButtons.nth(index);
      if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) { postButton = candidate; break; }
    }
    if (!postButton) return { outcome: "failed", failureCode: "post_button_not_ready", failureMessage: "The Facebook Post button was not available after the approved content was entered.", observedUrl: this.page.url() };
    await postButton.click();
    await this.page.waitForTimeout(1800);
    const dialogStillVisible = await dialog.isVisible().catch(() => false);
    if (dialogStillVisible) {
      return { outcome: "blocked", failureCode: "post_unconfirmed", failureMessage: "Facebook did not provide clear publishing evidence. Ferocity will not retry automatically.", observedUrl: this.page.url() };
    }
    return { outcome: "succeeded", providerReference: `fb-group-post:${action.id}:${stableId(body)}`, observedUrl: this.page.url() };
  }

  async executeGroupJoin(action, destination) {
    if (!facebookGroupUrl(destination)) {
      return { outcome: "blocked", failureCode: "invalid_group_destination", failureMessage: "The approved join did not target a specific Facebook group." };
    }
    await this.page.goto(destination, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await this.page.waitForTimeout(1200);
    const health = await this.inspectHealth();
    if (health.state !== "ready") return { outcome: "blocked", failureCode: health.state, failureMessage: health.reason, observedUrl: this.page.url() };
    const pageText = await this.page.locator("[role='main']").innerText().catch(() => "");
    if (/\bjoined\b/i.test(pageText) && !/\bjoin group\b/i.test(pageText)) {
      return { outcome: "succeeded", providerReference: `fb-group-already-joined:${action.id}`, observedUrl: this.page.url() };
    }
    const buttons = this.page.locator("[role='button'],button").filter({ hasText: /^(join|join group)$/i });
    let joinButton = null;
    for (let index = 0; index < await buttons.count(); index += 1) {
      const candidate = buttons.nth(index);
      if (await candidate.isVisible().catch(() => false) && await candidate.isEnabled().catch(() => false)) { joinButton = candidate; break; }
    }
    if (!joinButton) return { outcome: "blocked", failureCode: "join_control_not_found", failureMessage: "Facebook did not show an available Join control for this group.", observedUrl: this.page.url() };
    await joinButton.click();
    await this.page.waitForTimeout(900);
    const dialog = this.page.locator("[role='dialog']").last();
    if (await dialog.isVisible().catch(() => false)) {
      const dialogText = await dialog.innerText().catch(() => "");
      if (/answer|question|agree to the group rules|why do you want to join/i.test(dialogText)) {
        return { outcome: "blocked", failureCode: "join_questions_require_owner", failureMessage: "This group requires membership answers or acknowledgements. The account owner must answer them; Ferocity will not invent answers.", observedUrl: this.page.url() };
      }
    }
    const updatedText = await this.page.locator("[role='main']").innerText().catch(() => "");
    if (!/pending|cancel request|requested|joined/i.test(updatedText)) {
      return { outcome: "blocked", failureCode: "join_unconfirmed", failureMessage: "Facebook did not provide clear evidence that the join request was submitted. Ferocity will not retry automatically.", observedUrl: this.page.url() };
    }
    return { outcome: "succeeded", providerReference: `fb-group-join:${action.id}`, observedUrl: this.page.url() };
  }

  async executeAction(action) {
    if (!this.isRunning()) return { outcome: "failed", failureCode: "browser_not_running", failureMessage: "The worker browser was not running." };
    const destination = facebookUrl(action.sourceUrl);
    if (!destination) return { outcome: "blocked", failureCode: "missing_safe_destination", failureMessage: "The approved action did not include a recognized Facebook conversation URL." };
    if (action.actionKey === "request_group_join") return this.executeGroupJoin(action, destination);

    const body = String(action.body || "").trim();
    if (!body) return { outcome: "blocked", failureCode: "empty_message", failureMessage: "The approved action had no message body." };
    if (body.length > 10_000) return { outcome: "blocked", failureCode: "content_too_long", failureMessage: "The approved Facebook content exceeded the connector safety limit." };

    if (action.actionKey === "publish_group_post") return this.executeGroupPost(action, destination, body);

    await this.page.goto(destination, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await this.page.waitForTimeout(1000);
    const health = await this.inspectHealth();
    if (health.state !== "ready") {
      return { outcome: "blocked", failureCode: health.state, failureMessage: health.reason, observedUrl: this.page.url() };
    }

    const selectors = [
      "[contenteditable='true'][role='textbox']",
      "[aria-label*='Message'][contenteditable='true']",
      "[data-lexical-editor='true']",
      "textarea[aria-label*='Message']"
    ];
    let composer = null;
    for (const selector of selectors) {
      const candidates = this.page.locator(selector);
      for (let index = (await candidates.count()) - 1; index >= 0; index -= 1) {
        const candidate = candidates.nth(index);
        if (await candidate.isVisible().catch(() => false)) {
          composer = candidate;
          break;
        }
      }
      if (composer) break;
    }
    if (!composer) return { outcome: "failed", failureCode: "composer_not_found", failureMessage: "Facebook's visible message composer could not be identified.", observedUrl: this.page.url() };

    await composer.fill(body).catch(async () => {
      await composer.click();
      await this.page.keyboard.press("Control+A");
      await this.page.keyboard.type(body, { delay: 8 });
    });
    await this.page.waitForTimeout(500 + Math.floor(Math.random() * 500));
    await composer.press("Enter");
    await this.page.waitForTimeout(1200);
    const remaining = String(await composer.textContent().catch(() => "") || await composer.inputValue().catch(() => "")).trim();
    if (remaining) return { outcome: "failed", failureCode: "send_unconfirmed", failureMessage: "The composer did not clear after the send attempt; Ferocity will not retry automatically.", observedUrl: this.page.url() };
    return {
      outcome: "succeeded",
      providerReference: `fb-worker:${action.id}:${Date.now()}`,
      observedUrl: this.page.url()
    };
  }
}
