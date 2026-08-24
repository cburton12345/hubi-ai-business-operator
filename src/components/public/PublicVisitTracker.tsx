"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const PRIVATE_PREFIXES = [
  "/app", "/api", "/invite", "/portal", "/estimate", "/review", "/proof",
  "/refer", "/visit", "/forms", "/workers", "/book", "/chat", "/employee"
];

function isPublicMarketingPath(path: string) {
  return !PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function PublicVisitTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (navigator.doNotTrack === "1" || !isPublicMarketingPath(pathname)) return;

    const key = `ferocity-page-view:${pathname}:${window.location.search}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");

    const query = new URLSearchParams(window.location.search);
    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer,
      campaignSource: query.get("utm_source"),
      campaignMedium: query.get("utm_medium"),
      campaignName: query.get("utm_campaign")
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/public/site-activity", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/public/site-activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    });
  }, [pathname]);

  return null;
}
