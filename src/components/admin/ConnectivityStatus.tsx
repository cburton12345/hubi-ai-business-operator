"use client";

import { RotateCw, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectivityState =
  "checking" | "degraded" | "offline" | "online" | "restored";

export function classifyConnectivity(
  browserOnline: boolean,
  healthResponseOk: boolean,
): Exclude<ConnectivityState, "checking" | "restored"> {
  if (!browserOnline) return "offline";
  return healthResponseOk ? "online" : "degraded";
}

export function ConnectivityStatus() {
  const [status, setStatus] = useState<ConnectivityState>("checking");
  const [retrying, setRetrying] = useState(false);
  const failureSeenRef = useRef(false);
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const restoredTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyStatus = useCallback(
    (next: Exclude<ConnectivityState, "checking" | "restored">) => {
      if (!mountedRef.current) return;
      if (next === "online" && failureSeenRef.current) {
        failureSeenRef.current = false;
        setStatus("restored");
        if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
        restoredTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setStatus("online");
        }, 5000);
        return;
      }
      if (next !== "online") failureSeenRef.current = true;
      setStatus(next);
    },
    [],
  );

  const checkConnection = useCallback(async () => {
    const sequence = ++requestSequenceRef.current;
    if (!navigator.onLine) {
      activeControllerRef.current?.abort();
      applyStatus("offline");
      setRetrying(false);
      return;
    }

    activeControllerRef.current?.abort();
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setRetrying(true);
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch("/health?source=workspace-connectivity", {
        cache: "no-store",
        credentials: "same-origin",
        method: "HEAD",
        signal: controller.signal,
      });
      if (sequence === requestSequenceRef.current) {
        applyStatus(classifyConnectivity(true, response.ok));
      }
    } catch {
      if (sequence === requestSequenceRef.current) {
        applyStatus(classifyConnectivity(navigator.onLine, false));
      }
    } finally {
      clearTimeout(timeout);
      if (sequence === requestSequenceRef.current && mountedRef.current) {
        setRetrying(false);
      }
    }
  }, [applyStatus]);

  useEffect(() => {
    mountedRef.current = true;
    const initialCheck = window.setTimeout(() => void checkConnection(), 0);

    const handleOffline = () => applyStatus("offline");
    const handleOnline = () => void checkConnection();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void checkConnection();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      mountedRef.current = false;
      window.clearTimeout(initialCheck);
      activeControllerRef.current?.abort();
      if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [applyStatus, checkConnection]);

  if (status === "checking" || status === "online") return null;

  const restored = status === "restored";
  const offline = status === "offline";
  const Icon = restored ? Wifi : WifiOff;
  const title = restored
    ? "Connection restored"
    : offline
      ? "You are offline"
      : "Ferocity cannot confirm its connection";
  const detail = restored
    ? "Live data and actions are available again."
    : offline
      ? "This page can stay open, but do not assume a save, send, or payment reached Ferocity until you reconnect."
      : "The internet is available, but Ferocity's health check did not answer. Review the record before retrying an important action.";

  return (
    <section
      aria-atomic="true"
      aria-live={restored ? "polite" : "assertive"}
      className={`connectivity-status ${restored ? "is-restored" : "is-interrupted"}`}
      role="status"
    >
      <Icon aria-hidden="true" size={20} />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
      {!restored ? (
        <button
          className="mini-button"
          disabled={retrying}
          onClick={() => void checkConnection()}
          type="button"
        >
          <RotateCw
            aria-hidden="true"
            className={retrying ? "is-spinning" : undefined}
            size={15}
          />
          {retrying ? "Checking…" : "Check again"}
        </button>
      ) : null}
    </section>
  );
}
