"use client";

import { useEffect, useState } from "react";

type PushStatus = {
  ready: boolean;
  publicKey: string | null;
  missing: string[];
};

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function supportMessage() {
  if (typeof window === "undefined") return "Checking support...";
  if (!("serviceWorker" in navigator)) return "This browser does not support service workers.";
  if (!("PushManager" in window)) return "This browser does not support web push.";
  if (!("Notification" in window)) return "This browser does not support notifications.";
  return "";
}

export function PushNotificationSetup() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [permission, setPermission] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const [message, setMessage] = useState("Checking push notification readiness...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/push/status")
      .then((response) => response.json())
      .then((data) => {
        setStatus(data);
        const unsupported = supportMessage();
        if (unsupported) {
          setMessage(unsupported);
        } else if (!data.publicKey) {
          setMessage("Push UI is wired, but VAPID keys are not configured yet.");
        } else {
          setMessage("Ready to enable push notifications on this device.");
        }
      })
      .catch(() => setMessage("Could not check push notification status."));
  }, []);

  async function enablePush() {
    setBusy(true);
    try {
      const unsupported = supportMessage();
      if (unsupported) {
        setMessage(unsupported);
        return;
      }
      if (!status?.publicKey) {
        setMessage("Add VAPID keys before this browser can subscribe.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setMessage("Notifications were not allowed on this device.");
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.publicKey)
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      });
      const result = await response.json();
      setMessage(result.ok ? "Push notifications are enabled for this device." : result.message ?? "Push subscription failed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Push setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }
      setMessage("Push notifications are off for this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not turn push off.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Ferocity test",
          body: "Push notifications are connected to this workspace.",
          url: "/app/ferocity"
        })
      });
      const result = await response.json();
      setMessage(result.ok ? "Test push sent." : result.message ?? "Test push could not send.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Test push failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel section-actions">
      <div className="list-row flush-row">
        <div>
          <p className="eyebrow">Device setup</p>
          <h2>Push notifications</h2>
          <p className="muted">{message}</p>
        </div>
        <div className="inline-actions">
          <span className={`pill ${permission === "granted" ? "" : permission === "denied" ? "high" : "medium"}`}>{permission}</span>
          {status?.ready ? <span className="pill">keys ready</span> : <span className="pill medium">keys needed</span>}
        </div>
      </div>
      {status?.missing?.length ? <p className="muted">Missing: {status.missing.join(", ")}</p> : null}
      <div className="button-row">
        <button className="button" type="button" onClick={enablePush} disabled={busy || !status?.publicKey}>
          Enable push
        </button>
        <button className="button secondary-button" type="button" onClick={sendTest} disabled={busy}>
          Send test
        </button>
        <button className="button secondary-button" type="button" onClick={disablePush} disabled={busy}>
          Turn off here
        </button>
      </div>
    </section>
  );
}
