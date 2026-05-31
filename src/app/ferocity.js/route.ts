const SCRIPT = `(() => {
  const allowed = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "source", "campaign"];

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

  window.Ferocity = window.Ferocity || {};
  window.Ferocity.connectForms = connectForms;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => connectForms());
  } else {
    connectForms();
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
