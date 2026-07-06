const SCRIPT = `(() => {
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "source", "campaign"];
  const script = document.currentScript;
  const scriptUrl = script ? new URL(script.src, window.location.href) : null;
  const appOrigin = scriptUrl ? scriptUrl.origin : "https://ferocity.live";

  function trackedUrl(value) {
    try {
      const target = new URL(value, window.location.href);
      const current = new URL(window.location.href);

      allowed.forEach((key) => {
        const incoming = current.searchParams.get(key);
        if (incoming && !target.searchParams.has(key)) {
          target.searchParams.set(key, incoming);
        }
      });

      if (!target.searchParams.has("page_url")) {
        target.searchParams.set("page_url", window.location.href);
      }

      if (document.referrer && !target.searchParams.has("referrer")) {
        target.searchParams.set("referrer", document.referrer);
      }

      return target.toString();
    } catch {
      return value;
    }
  }

  function connectForms(root = document) {
    root.querySelectorAll('a[href*="/forms/"], iframe[src*="/forms/"]').forEach((node) => {
      const attr = node.tagName.toLowerCase() === "iframe" ? "src" : "href";
      const value = node.getAttribute(attr);
      if (value) node.setAttribute(attr, trackedUrl(value));
    });
  }

  function formUrl(formKey) {
    return trackedUrl(appOrigin + "/forms/" + encodeURIComponent(formKey));
  }

  function injectQuoteButton() {
    if (!script) return;
    const formKey = script.getAttribute("data-form-key");
    if (!formKey) return;

    const label = script.getAttribute("data-button-label") || "Request a quote";
    const mode = script.getAttribute("data-mode") || "inline";
    const targetSelector = script.getAttribute("data-target");
    const target = targetSelector ? document.querySelector(targetSelector) : script.parentElement;
    if (!target || document.querySelector("[data-ferocity-generated='" + formKey + "']")) return;

    const link = document.createElement("a");
    link.href = formUrl(formKey);
    link.textContent = label;
    link.setAttribute("data-ferocity-generated", formKey);
    link.setAttribute("data-ferocity-form", formKey);
    link.style.display = "inline-flex";
    link.style.alignItems = "center";
    link.style.justifyContent = "center";
    link.style.minHeight = "44px";
    link.style.padding = "12px 18px";
    link.style.borderRadius = "8px";
    link.style.background = script.getAttribute("data-button-color") || "#111827";
    link.style.color = script.getAttribute("data-text-color") || "#ffffff";
    link.style.textDecoration = "none";
    link.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    link.style.fontWeight = "700";
    link.style.boxShadow = "0 10px 24px rgba(17, 24, 39, 0.18)";

    if (mode === "floating") {
      link.style.position = "fixed";
      link.style.right = "18px";
      link.style.bottom = "18px";
      link.style.zIndex = "99999";
    }

    target.appendChild(link);
  }

  window.Ferocity = window.Ferocity || {};
  window.Ferocity.connectForms = connectForms;
  window.Ferocity.injectQuoteButton = injectQuoteButton;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      connectForms();
      injectQuoteButton();
    });
  } else {
    connectForms();
    injectQuoteButton();
  }
})();`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/javascript; charset=utf-8"
    }
  });
}
