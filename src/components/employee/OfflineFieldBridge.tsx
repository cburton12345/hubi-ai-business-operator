"use client";

import { useCallback, useEffect, useState } from "react";
import { formatWorkerDateTime, workerPlural, type WorkerLocale } from "@/lib/employee/worker-locale";

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

const offlineCopy = {
  en: {
    initial: "Offline field data has not been saved on this device yet.", syncUnavailable: "Offline changes are still on this device. Ferocity could not reach the sync service.", offline: "You are offline. Saved work remains available on this device.", syncing: "Syncing assigned work.", refreshFailed: "Ferocity could not refresh assigned work. Existing offline data was kept.", available: "Assigned work is available offline on this device.", removed: "Offline work data was removed from this device.", fieldSync: "Field Sync", connected: "Connected", offlineMode: "Offline mode", lastSaved: "Last saved", noSnapshot: "No offline snapshot yet.", waiting: "waiting", save: "Save today offline", open: "Open offline view", remove: "Remove device data", trust: "Only use offline storage on a trusted, secured device. Removing it does not delete server records."
  },
  es: {
    initial: "Los datos de campo sin conexión todavía no se han guardado en este dispositivo.", syncUnavailable: "Los cambios siguen en este dispositivo. Ferocity no pudo comunicarse con el servicio de sincronización.", offline: "No tiene conexión. El trabajo guardado permanece disponible en este dispositivo.", syncing: "Sincronizando el trabajo asignado.", refreshFailed: "Ferocity no pudo actualizar el trabajo asignado. Se conservaron los datos existentes.", available: "El trabajo asignado está disponible sin conexión en este dispositivo.", removed: "Los datos de trabajo sin conexión se eliminaron de este dispositivo.", fieldSync: "Sincronización de campo", connected: "Conectado", offlineMode: "Modo sin conexión", lastSaved: "Guardado por última vez", noSnapshot: "Todavía no hay una copia sin conexión.", waiting: "en espera", save: "Guardar el trabajo de hoy", open: "Abrir vista sin conexión", remove: "Eliminar datos del dispositivo", trust: "Use el almacenamiento sin conexión solo en un dispositivo seguro y de confianza. Eliminarlo no borra los registros del servidor."
  }
} as const;

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

export function OfflineFieldBridge({ language: initialLanguage }: { language?: WorkerLocale } = {}) {
  // Device-only state is loaded after hydration so the server and first
  // browser render always agree.
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [language, setLanguage] = useState<WorkerLocale>(initialLanguage ?? "en");
  const copy = offlineCopy[language];
  const [messageKey, setMessageKey] = useState<keyof typeof offlineCopy.en>("initial");
  const message = copy[messageKey];

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
      setMessageKey("syncUnavailable");
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
      setMessageKey("offline");
      return;
    }
    setMessageKey("syncing");
    await flush();
    const response = await fetch("/api/field/offline-sync", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      setMessageKey("refreshFailed");
      return;
    }
    const snapshot = await response.json() as { language?: WorkerLocale };
    const nextLanguage: WorkerLocale = snapshot.language === "es" ? "es" : "en";
    setLanguage(nextLanguage);
    localStorage.setItem("ferocity-field-language", nextLanguage);
    await storeSnapshot(snapshot);
    await fetch("/employee/offline", { credentials: "same-origin" }).catch(() => null);
    const syncedAt = new Date().toISOString();
    localStorage.setItem("ferocity-field-last-sync", syncedAt);
    setLastSync(syncedAt);
    setMessageKey("available");
    await refreshPending();
  }, [flush, refreshPending]);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setOnline(navigator.onLine);
      setLastSync(localStorage.getItem("ferocity-field-last-sync"));
      setLanguage(initialLanguage ?? (localStorage.getItem("ferocity-field-language") === "es" ? "es" : "en"));
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
  }, [initialLanguage, refreshPending, sync]);

  async function clearOfflineData() {
    indexedDB.deleteDatabase(databaseName);
    localStorage.removeItem("ferocity-field-last-sync");
    if ("caches" in window) await caches.delete("ferocity-field-shell-v1");
    setLastSync(null);
    setPending(0);
    localStorage.removeItem("ferocity-field-language");
    setMessageKey("removed");
  }

  return (
    <section className="panel offline-field-status">
      <div className="list-row flush-row">
        <div>
          <span className="eyebrow">{copy.fieldSync}</span>
          <h2>{online ? copy.connected : copy.offlineMode}</h2>
          <p className="muted">{message}</p>
          <p className="muted">
            {lastSync ? `${copy.lastSaved} ${formatWorkerDateTime(lastSync, language)}.` : copy.noSnapshot}
            {pending ? ` ${pending} ${workerPlural(pending, language, { en: ["field change", "field changes"], es: ["cambio de campo", "cambios de campo"] })} ${copy.waiting}.` : ""}
          </p>
        </div>
        <div className="button-row">
          <button className="mini-button" type="button" onClick={() => void sync()} disabled={!online}>{copy.save}</button>
          <a className="mini-button secondary-button" href="/employee/offline">{copy.open}</a>
          <button className="mini-button secondary-button" type="button" onClick={() => void clearOfflineData()}>{copy.remove}</button>
        </div>
      </div>
      <p className="field-help">{copy.trust}</p>
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
