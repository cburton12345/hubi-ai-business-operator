"use client";

import { useCallback,useEffect,useMemo,useState,type FormEvent } from "react";

export type WorkforceActionType = "clock_in" | "start_break" | "end_break" | "clock_out" | "expense" | "worker_payment";

export type QueuedWorkforceAction = {
  clientMutationId: string;
  actionType: WorkforceActionType;
  capturedAt: string;
  workerId: string;
  assignmentId?: string;
  location?: { latitude: number;longitude: number;accuracyMeters?: number;label?: string };
  note?: string;
  expense?: { vendor?: string;amountCents: number;category: string;reimbursable: boolean;receipt?: { name: string;type: string;size: number;base64: string } };
  payment?: { amountCents: number;method: "cash" | "check" | "ach" | "card" | "payroll_provider" | "other";paymentType: "payroll" | "subcontractor" | "bonus" | "reimbursement" | "draw" | "other" };
};

const databaseName = "ferocity-field";
const databaseVersion = 2;
const storeName = "workforceActions";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve,reject) => {
    const request = indexedDB.open(databaseName,databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots");
      if (!database.objectStoreNames.contains("mutations")) database.createObjectStore("mutations",{ keyPath: "clientMutationId" });
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName,{ keyPath: "clientMutationId" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueAction(action: QueuedWorkforceAction) {
  const database = await openDatabase();
  await new Promise<void>((resolve,reject) => {
    const transaction = database.transaction(storeName,"readwrite");
    transaction.objectStore(storeName).put(action);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    const backgroundSync = registration as (ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }) | null;
    await backgroundSync?.sync?.register("ferocity-workforce-sync").catch(() => undefined);
  }
}

async function queuedActions() {
  const database = await openDatabase();
  const result = await new Promise<QueuedWorkforceAction[]>((resolve,reject) => {
    const request = database.transaction(storeName,"readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as QueuedWorkforceAction[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result.sort((left,right) => left.capturedAt.localeCompare(right.capturedAt));
}

async function removeAction(id: string) {
  const database = await openDatabase();
  await new Promise<void>((resolve,reject) => {
    const transaction = database.transaction(storeName,"readwrite");
    transaction.objectStore(storeName).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function postActions(actions: QueuedWorkforceAction[]) {
  const results: Array<{ clientMutationId: string;status: "applied" | "rejected" | "failed";message: string }> = [];
  for (const action of actions) {
    const response = await fetch("/api/workforce/mobile-actions",{
      method: "POST",credentials: "same-origin",headers: { "content-type": "application/json" },body: JSON.stringify({ actions: [action] })
    });
    if (!response.ok) throw new Error("sync_unavailable");
    const body = await response.json() as { results?: typeof results };
    results.push(...(body.results ?? []));
  }
  return { results };
}

async function currentLocation() {
  if (!("geolocation" in navigator)) return undefined;
  const position = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve,() => resolve(null),{ enableHighAccuracy: true,timeout: 8_000,maximumAge: 0 });
  });
  if (!position) return undefined;
  const location = {
    latitude: position.coords.latitude,longitude: position.coords.longitude,
    accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
    label: undefined as string | undefined
  };
  if (navigator.onLine) {
    try {
      const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
      url.searchParams.set("latitude",String(location.latitude));
      url.searchParams.set("longitude",String(location.longitude));
      url.searchParams.set("localityLanguage","en");
      const response = await fetch(url,{ cache: "no-store" });
      if (response.ok) {
        const place = await response.json() as { city?: string;locality?: string;principalSubdivisionCode?: string;principalSubdivision?: string };
        const town = place.city || place.locality;
        const region = place.principalSubdivisionCode?.split("-").pop() || place.principalSubdivision;
        if (town) location.label = [town,region].filter(Boolean).join(", ").slice(0,220);
      }
    } catch {
      // Exact coordinates still provide durable evidence when locality lookup is unavailable.
    }
  }
  return location;
}

async function fileReceipt(file: File | null) {
  if (!file || file.size === 0) return undefined;
  if (file.size > 4_000_000) throw new Error("Receipt must be 4 MB or smaller for offline saving.");
  const base64 = await new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",",2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { name: file.name,type: file.type,size: file.size,base64 };
}

export function useWorkforceQueue(language: "en" | "es" = "en") {
  const [pendingCount,setPendingCount] = useState(0);
  const [message,setMessage] = useState("");
  const refresh = useCallback(async () => setPendingCount((await queuedActions().catch(() => [])).length),[]);
  const flush = useCallback(async () => {
    if (!navigator.onLine) return [];
    const queued = await queuedActions().catch(() => []);
    if (!queued.length) { setPendingCount(0);return []; }
    try {
      const body = await postActions(queued);
      for (const result of body.results) if (result.status === "applied" || result.status === "rejected") await removeAction(result.clientMutationId);
      await refresh();
      const rejected = body.results.find((result) => result.status === "rejected");
      const failed = body.results.find((result) => result.status === "failed");
      setMessage(rejected?.message || failed?.message || (language === "es" ? "Los cambios guardados se sincronizaron." : "Saved changes synced."));
      return body.results;
    } catch {
      setMessage(language === "es" ? "Los cambios siguen guardados en este dispositivo." : "Changes are still saved on this device.");
      return [];
    }
  },[language,refresh]);
  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      void refresh().then(() => { if (navigator.onLine) void flush(); });
    },0);
    const online = () => void flush();
    window.addEventListener("online",online);
    return () => { window.clearTimeout(hydrateTimer);window.removeEventListener("online",online); };
  },[flush,refresh]);

  const submit = useCallback(async (action: Omit<QueuedWorkforceAction,"clientMutationId" | "capturedAt" | "location">) => {
    const complete: QueuedWorkforceAction = {
      ...action,clientMutationId: crypto.randomUUID(),capturedAt: new Date().toISOString(),location: await currentLocation()
    };
    await queueAction(complete);
    await refresh();
    if (!navigator.onLine) {
      setMessage(language === "es" ? "Guardado sin conexión. Se enviará automáticamente." : "Saved offline. It will upload automatically.");
      return { queued: true };
    }
    const results = await flush();
    const ownResult = results.find((result) => result.clientMutationId === complete.clientMutationId);
    if (ownResult?.status === "rejected") throw new Error(ownResult.message);
    return { queued: false };
  },[flush,language,refresh]);

  return { submit,pendingCount,message,setMessage };
}

export function WorkforceQuickActions({ workerId,openState,assignments,language }: {
  workerId: string;openState: "clocked_out" | "working" | "break";
  assignments: { id: string;title: string }[];language: "en" | "es";
}) {
  const copy = language === "es" ? {
    status: "Estado de hoy",out: "Fuera de turno",working: "Trabajando",onBreak: "En descanso",start: "Comenzar",break: "Descanso",resume: "Continuar",finish: "Terminar",expense: "Agregar gasto",amount: "Cantidad",vendor: "Tienda o proveedor",category: "Categoría",receipt: "Foto del recibo",reimburse: "Necesito reembolso",save: "Guardar gasto",job: "Trabajo (opcional)",note: "Nota opcional"
  } : {
    status: "Today",out: "Clocked out",working: "Working",onBreak: "On break",start: "Start work",break: "Take break",resume: "Resume work",finish: "Finish",expense: "Add expense",amount: "Amount",vendor: "Store or vendor",category: "Category",receipt: "Receipt photo",reimburse: "Pay me back",save: "Save expense",job: "Job (optional)",note: "Optional note"
  };
  const [state,setState] = useState(openState);
  const [busy,setBusy] = useState(false);
  const [expenseOpen,setExpenseOpen] = useState(false);
  const { submit,pendingCount,message,setMessage } = useWorkforceQueue(language);
  const status = state === "working" ? copy.working : state === "break" ? copy.onBreak : copy.out;
  const primary = useMemo(() => state === "clocked_out"
    ? { type: "clock_in" as const,label: copy.start,next: "working" as const }
    : state === "break"
      ? { type: "end_break" as const,label: copy.resume,next: "working" as const }
      : { type: "start_break" as const,label: copy.break,next: "break" as const },[copy.break,copy.resume,copy.start,state]);

  async function timeAction(type: WorkforceActionType,next: typeof state,assignmentId?: string) {
    setBusy(true);setMessage("");
    try { await submit({ actionType: type,workerId,assignmentId });setState(next); }
    catch { setMessage(language === "es" ? "No se pudo guardar en este dispositivo." : "Could not save on this device."); }
    finally { setBusy(false); }
  }

  async function saveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage("");
    try {
      const data = new FormData(event.currentTarget);
      const amount = Number(String(data.get("amount") ?? "").replace(/[$,]/g,""));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount");
      const receipt = await fileReceipt(data.get("receipt") instanceof File ? data.get("receipt") as File : null);
      await submit({
        actionType: "expense",workerId,assignmentId: String(data.get("assignmentId") || "") || undefined,
        note: String(data.get("note") || "") || undefined,
        expense: { vendor: String(data.get("vendor") || "") || undefined,amountCents: Math.round(amount * 100),category: String(data.get("category") || "Other"),reimbursable: data.get("reimbursable") === "on",receipt }
      });
      event.currentTarget.reset();setExpenseOpen(false);
    } catch (error) { setMessage(error instanceof Error && error.message !== "amount" ? error.message : (language === "es" ? "Ingrese una cantidad válida." : "Enter a valid amount.")); }
    finally { setBusy(false); }
  }

  return <section className="panel form-stack workforce-quick-actions">
    <div className="list-row flush-row"><div><span className="eyebrow">{copy.status}</span><h2>{status}</h2></div>{pendingCount ? <span className="pill medium">{pendingCount} pending</span> : <span className="pill">Synced</span>}</div>
    <select id="worker-quick-assignment" defaultValue="" aria-label={copy.job}><option value="">{copy.job}</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}</select>
    <div className="workforce-action-grid">
      <button className="button workforce-primary-action" type="button" disabled={busy} onClick={() => void timeAction(primary.type,primary.next,(document.getElementById("worker-quick-assignment") as HTMLSelectElement | null)?.value || undefined)}>{primary.label}</button>
      {state !== "clocked_out" ? <button className="button secondary-button" type="button" disabled={busy} onClick={() => void timeAction("clock_out","clocked_out",(document.getElementById("worker-quick-assignment") as HTMLSelectElement | null)?.value || undefined)}>{copy.finish}</button> : null}
      <button className="button secondary-button" type="button" onClick={() => setExpenseOpen((value) => !value)}>{copy.expense}</button>
    </div>
    {expenseOpen ? <form className="form-stack" onSubmit={saveExpense}>
      <select name="assignmentId" defaultValue=""><option value="">{copy.job}</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}</select>
      <div className="two-col"><input name="amount" inputMode="decimal" placeholder={copy.amount} required /><input name="vendor" placeholder={copy.vendor} /></div>
      <input name="category" placeholder={copy.category} defaultValue="Materials" required />
      <label>{copy.receipt}<input name="receipt" type="file" accept="image/*,application/pdf" capture="environment" /></label>
      <label className="checkbox-row"><input name="reimbursable" type="checkbox" defaultChecked /><span>{copy.reimburse}</span></label>
      <input name="note" placeholder={copy.note} />
      <button className="button" type="submit" disabled={busy}>{copy.save}</button>
    </form> : null}
    {message ? <p className="notice success" role="status" aria-live="polite">{message}</p> : null}
    <p className="field-help">Location is captured only when you tap an action. If service is unavailable, the original time and receipt stay on this device and sync automatically.</p>
  </section>;
}
