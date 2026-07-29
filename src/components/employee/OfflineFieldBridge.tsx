"use client";

import { useCallback, useEffect, useState } from "react";

const databaseName = "ferocity-field";
const databaseVersion = 1;

type OfflineMutation = {
  clientMutationId: string;
  mutationType: "visit_status" | "field_note";
  visitId: string;
  baseRecordVersion?: string;
  payload: Record<string, unknown>;
  queuedAt: string;
  status: "queued" | "conflict" | "failed";
  reason?: string;
};

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots");
      if (!database.objectStoreNames.contains("mutations")) database.createObjectStore("mutations", { keyPath: "clientMutationId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeSnapshot(snapshot: unknown) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("snapshots", "readwrite");
    transaction.objectStore("snapshots").put(snapshot, "current");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function allMutations() {
  const database = await openDatabase();
  const mutations = await new Promise<OfflineMutation[]>((resolve, reject) => {
    const request = database.transaction("mutations", "readonly").objectStore("mutations").getAll();
    request.onsuccess = () => resolve(request.result as OfflineMutation[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return mutations;
}

async function removeMutation(clientMutationId: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("mutations", "readwrite");
    transaction.objectStore("mutations").delete(clientMutationId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function updateMutation(mutation: OfflineMutation) {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("mutations", "readwrite");
    transaction.objectStore("mutations").put(mutation);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export function OfflineFieldBridge() {
  // Device-only state is loaded after hydration so the server and first
  // browser render always agree.
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [message, setMessage] = useState("Offline field data has not been saved on this device yet.");

  const refreshPending = useCallback(async () => {
    const mutations = await allMutations().catch(() => []);
    setPending(mutations.length);
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    const mutations = await allMutations().catch(() => []);
    const queued = mutations.filter((mutation) => mutation.status === "queued" || mutation.status === "failed");
    if (queued.length === 0) {
      await refreshPending();
      return;
    }
    const response = await fetch("/api/field/offline-sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ mutations: queued })
    });
    if (!response.ok) {
      setMessage("Offline changes are still on this device. Ferocity could not reach the sync service.");
      return;
    }
    const body = (await response.json()) as {
      results?: Array<{ clientMutationId: string; status: string; reason?: string }>;
    };
    for (const result of body.results ?? []) {
      const mutation = queued.find((item) => item.clientMutationId === result.clientMutationId);
      if (!mutation) continue;
      if (result.status === "applied") {
        await removeMutation(result.clientMutationId);
      } else {
        await updateMutation({
          ...mutation,
          status: result.status === "conflict" ? "conflict" : "failed",
          reason: result.reason
        });
      }
    }
    await refreshPending();
  }, [refreshPending]);

  const sync = useCallback(async () => {
    if (!navigator.onLine) {
      setMessage("You are offline. Saved work remains available on this device.");
      return;
    }
    setMessage("Syncing assigned work…");
    await flush();
    const response = await fetch("/api/field/offline-sync", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      setMessage("Ferocity could not refresh assigned work. Existing offline data was kept.");
      return;
    }
    const snapshot = await response.json();
    await storeSnapshot(snapshot);
    await fetch("/employee/offline", { credentials: "same-origin" }).catch(() => null);
    const syncedAt = new Date().toISOString();
    localStorage.setItem("ferocity-field-last-sync", syncedAt);
    setLastSync(syncedAt);
    setMessage("Assigned work is available offline on this device.");
    await refreshPending();
  }, [flush, refreshPending]);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      setLastSync(localStorage.getItem("ferocity-field-last-sync"));
      void refreshPending();
    }, 0);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
    const handleOnline = () => {
      setOnline(true);
      void sync();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [refreshPending, sync]);

  async function clearOfflineData() {
    indexedDB.deleteDatabase(databaseName);
    localStorage.removeItem("ferocity-field-last-sync");
    if ("caches" in window) await caches.delete("ferocity-field-shell-v1");
    setLastSync(null);
    setPending(0);
    setMessage("Offline work data was removed from this device.");
  }

  return (
    <section className="panel offline-field-status">
      <div className="list-row flush-row">
        <div>
          <span className="eyebrow">Field Sync</span>
          <h2>{online ? "Connected" : "Offline mode"}</h2>
          <p className="muted">{message}</p>
          <p className="muted">
            {lastSync ? `Last saved ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(lastSync))}.` : "No offline snapshot yet."}
            {pending ? ` ${pending} field change${pending === 1 ? "" : "s"} waiting.` : ""}
          </p>
        </div>
        <div className="button-row">
          <button className="mini-button" type="button" onClick={() => void sync()} disabled={!online}>Save today offline</button>
          <a className="mini-button secondary-button" href="/employee/offline">Open offline view</a>
          <button className="mini-button secondary-button" type="button" onClick={() => void clearOfflineData()}>Remove device data</button>
        </div>
      </div>
      <p className="field-help">Only use offline storage on a trusted, secured device. Removing it does not delete server records.</p>
    </section>
  );
}

export async function queueOfflineMutation(mutation: Omit<OfflineMutation, "queuedAt" | "status">) {
  await updateMutation({
    ...mutation,
    queuedAt: new Date().toISOString(),
    status: "queued"
  });
}
