"use client";

import { useEffect } from "react";

const refreshMarker = "ferocity-session-refreshed-at";
const refreshEveryMs = 12 * 60 * 60 * 1000;

function refreshIsDue() {
  try {
    const previous = Number(localStorage.getItem(refreshMarker) ?? "0");
    return !Number.isFinite(previous) || Date.now() - previous >= refreshEveryMs;
  } catch {
    return true;
  }
}

async function refreshSession() {
  if (!navigator.onLine || !refreshIsDue()) return;
  try {
    const response = await fetch("/api/auth/session/refresh", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (response.ok) localStorage.setItem(refreshMarker, String(Date.now()));
  } catch {
    // A failed background refresh must never interrupt field work. The next
    // visibility/online event retries, and server authorization remains final.
  }
}

export function SessionContinuity() {
  useEffect(() => {
    void refreshSession();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshSession();
    };
    const onOnline = () => void refreshSession();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, []);
  return null;
}
