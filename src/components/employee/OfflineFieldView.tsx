"use client";

import { useEffect, useState } from "react";
import { queueOfflineMutation } from "@/components/employee/OfflineFieldBridge";
import { formatWorkerDateTime, type WorkerLocale } from "@/lib/employee/worker-locale";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";

type OfflineVisit = {
  id: string;
  title: string;
  status: string;
  priority: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  updated_at: string;
  customer_name: string;
  customer_phone: string | null;
  address: string | null;
  scope: string | null;
  access_instructions: string | null;
  dispatch_notes: string | null;
  form_assignments: Array<{
    assignmentId: string;
    name: string;
    requiredForCompletion: boolean;
    status: string;
  }>;
};

type OfflineSnapshot = {
  version: string;
  language?: WorkerLocale;
  visits: OfflineVisit[];
};

const offlineViewCopy = {
  en: {
    reading: "Reading saved work…", saved: "These records were saved on this device.", noneSaved: "No offline work was saved on this device.", readFailed: "Ferocity could not read offline work from this device.", statusSaved: "Field status saved on this device. Ferocity will validate and sync it when connected.", noteSaved: "Field note saved on this device. It will sync when connected.", title: "Offline field view", connected: "Connection available", noConnection: "No connection", live: "Try live app", savedDevice: "Saved On This Device", work: "Today's Work", snapshot: "Snapshot created", noAssigned: "No assigned work", noAssignedBody: "The last saved snapshot contained no open visits.", unscheduled: "Unscheduled", addressMissing: "Address not saved", scopeMissing: "Scope was not available in the saved snapshot.", access: "Access", office: "Office", call: "Call", text: "Text I'm on my way", directions: "Directions", required: "Required forms", noForms: "No forms were included in this snapshot.", formHelp: "Complex forms and signatures stay in the live view. Offline completion is rejected safely if required evidence is missing.", saveStatus: "Save a field status", queueStatus: "Queue status", note: "Offline field note", queueNote: "Queue note", professional: "your service professional", there: "there"
  },
  es: {
    reading: "Leyendo el trabajo guardado…", saved: "Estos registros se guardaron en este dispositivo.", noneSaved: "No se guardó trabajo sin conexión en este dispositivo.", readFailed: "Ferocity no pudo leer el trabajo sin conexión de este dispositivo.", statusSaved: "El estado se guardó en este dispositivo. Ferocity lo validará y sincronizará cuando haya conexión.", noteSaved: "La nota de campo se guardó en este dispositivo. Se sincronizará cuando haya conexión.", title: "Vista de campo sin conexión", connected: "Conexión disponible", noConnection: "Sin conexión", live: "Probar la aplicación en vivo", savedDevice: "Guardado en este dispositivo", work: "Trabajo de hoy", snapshot: "Copia creada", noAssigned: "No hay trabajo asignado", noAssignedBody: "La última copia guardada no contenía visitas abiertas.", unscheduled: "Sin horario", addressMissing: "Dirección no guardada", scopeMissing: "El alcance no estaba disponible en la copia guardada.", access: "Acceso", office: "Oficina", call: "Llamar", text: "Avisar que voy en camino", directions: "Indicaciones", required: "Formularios requeridos", noForms: "No se incluyeron formularios en esta copia.", formHelp: "Los formularios complejos y las firmas permanecen en la vista en vivo. Ferocity rechaza de forma segura la finalización sin la evidencia requerida.", saveStatus: "Guardar estado de campo", queueStatus: "Guardar estado en espera", note: "Nota de campo sin conexión", queueNote: "Guardar nota en espera", professional: "su profesional de servicio", there: "allí"
  }
} as const;

function readSnapshot() {
  return new Promise<OfflineSnapshot | null>((resolve, reject) => {
    const request = indexedDB.open("ferocity-field", 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("snapshots")) database.createObjectStore("snapshots");
      if (!database.objectStoreNames.contains("mutations")) database.createObjectStore("mutations", { keyPath: "clientMutationId" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const getRequest = database.transaction("snapshots", "readonly").objectStore("snapshots").get("current");
      getRequest.onsuccess = () => {
        resolve((getRequest.result as OfflineSnapshot | undefined) ?? null);
        database.close();
      };
      getRequest.onerror = () => reject(getRequest.error);
    };
    request.onerror = () => reject(request.error);
  });
}

function displayTime(value: string | null, language: WorkerLocale) {
  if (!value) return offlineViewCopy[language].unscheduled;
  return formatWorkerDateTime(value, language);
}

export function OfflineFieldView() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [language, setLanguage] = useState<WorkerLocale>("en");
  const copy = offlineViewCopy[language];
  const [messageKey, setMessageKey] = useState<"reading" | "saved" | "noneSaved" | "readFailed" | "statusSaved" | "noteSaved">("reading");
  const message = copy[messageKey];

  useEffect(() => {
    void readSnapshot()
      .then((value) => {
        setSnapshot(value);
        setLanguage(value?.language === "es" || localStorage.getItem("ferocity-field-language") === "es" ? "es" : "en");
        setMessageKey(value ? "saved" : "noneSaved");
      })
      .catch(() => setMessageKey("readFailed"));
  }, []);

  async function queueStatus(visit: OfflineVisit, status: string) {
    await queueOfflineMutation({
      clientMutationId: crypto.randomUUID(),
      mutationType: "visit_status",
      visitId: visit.id,
      baseRecordVersion: visit.updated_at,
      payload: { status }
    });
    setMessageKey("statusSaved");
  }

  async function queueNote(visit: OfflineVisit, note: string) {
    if (!note.trim()) return;
    await queueOfflineMutation({
      clientMutationId: crypto.randomUUID(),
      mutationType: "field_note",
      visitId: visit.id,
      baseRecordVersion: visit.updated_at,
      payload: { note: note.trim() }
    });
    setMessageKey("noteSaved");
  }

  return (
    <section className="workspace" lang={language === "es" ? "es-US" : "en-US"}>
      <WorkerDocumentLanguage language={language} />
      <header className="app-shell-header panel">
        <a href="/employee" className="brand-mark">Ferocity</a>
        <div className="session-chip">
          <strong>{copy.title}</strong>
          <span className="muted">{typeof navigator !== "undefined" && navigator.onLine ? copy.connected : copy.noConnection}</span>
        </div>
        <a className="mini-button" href="/employee">{copy.live}</a>
      </header>

      <section className="panel">
        <span className="eyebrow">{copy.savedDevice}</span>
        <h1>{copy.work}</h1>
        <p>{message}</p>
        {snapshot ? <p className="muted">{copy.snapshot} {displayTime(snapshot.version, language)}.</p> : null}
      </section>

      <section className="grid">
        {(snapshot?.visits ?? []).map((visit) => (
          <OfflineVisitCard visit={visit} queueStatus={queueStatus} queueNote={queueNote} language={language} key={visit.id} />
        ))}
        {snapshot && snapshot.visits.length === 0 ? <section className="empty-state span-12"><h2>{copy.noAssigned}</h2><p>{copy.noAssignedBody}</p></section> : null}
      </section>
    </section>
  );
}

function OfflineVisitCard({
  visit,
  queueStatus,
  queueNote,
  language
}: {
  visit: OfflineVisit;
  queueStatus: (visit: OfflineVisit, status: string) => Promise<void>;
  queueNote: (visit: OfflineVisit, note: string) => Promise<void>;
  language: WorkerLocale;
}) {
  const copy = offlineViewCopy[language];
  const statusLabel = (value: string) => language === "es" ? ({ dispatched: "Despachada", en_route: "En camino", arrived: "Llegó", in_progress: "En curso", paused: "En pausa", completed: "Terminada", no_show: "No se presentó", low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente" } as Record<string, string>)[value] ?? value.replaceAll("_", " ") : value.replaceAll("_", " ");
  const [status, setStatus] = useState(visit.status);
  const [note, setNote] = useState("");
  const onMyWayHref = visit.customer_phone
    ? `sms:${visit.customer_phone}?body=${encodeURIComponent(language === "es" ? `Hola ${visit.customer_name.split(" ")[0] || copy.there}, ${copy.professional} va en camino para ${visit.title}. Nos vemos pronto.` : `Hi ${visit.customer_name.split(" ")[0] || copy.there}, ${copy.professional} is on the way for ${visit.title}. We will see you soon.`)}`
    : null;

  return (
    <article className="panel span-6">
      <span className="eyebrow">{statusLabel(visit.priority)} · {statusLabel(visit.status)}</span>
      <h2>{visit.title}</h2>
      <p><strong>{visit.customer_name}</strong></p>
      <p>{visit.address || copy.addressMissing}</p>
      <p className="muted">{displayTime(visit.scheduled_start, language)} - {displayTime(visit.scheduled_end, language)}</p>
      <p>{visit.scope || copy.scopeMissing}</p>
      {visit.access_instructions ? <p><strong>{copy.access}:</strong> {visit.access_instructions}</p> : null}
      {visit.dispatch_notes ? <p><strong>{copy.office}:</strong> {visit.dispatch_notes}</p> : null}
      <div className="button-row">
        {visit.customer_phone ? <a className="mini-button" href={`tel:${visit.customer_phone}`}>{copy.call}</a> : null}
        {onMyWayHref ? <a className="mini-button" href={onMyWayHref}>{copy.text}</a> : null}
        {visit.address ? <a className="mini-button secondary-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`}>{copy.directions}</a> : null}
      </div>

      <div className="notice">
        <strong>{copy.required}</strong>
        {visit.form_assignments.map((form) => <p key={form.assignmentId}>{form.name} · {statusLabel(form.status)}</p>)}
        {visit.form_assignments.length === 0 ? <p>{copy.noForms}</p> : null}
        <p className="field-help">{copy.formHelp}</p>
      </div>

      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void queueStatus(visit, status);
        }}
      >
        <label>
          {copy.saveStatus}
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {(["dispatched", "en_route", "arrived", "in_progress", "paused", "completed", "no_show"] as const).map((value) => <option value={value} key={value}>{statusLabel(value)}</option>)}
          </select>
        </label>
        <button className="button" type="submit">{copy.queueStatus}</button>
      </form>

      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void queueNote(visit, note).then(() => setNote(""));
        }}
      >
        <label>
          {copy.note}
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} required />
        </label>
        <button className="button secondary-button" type="submit">{copy.queueNote}</button>
      </form>
    </article>
  );
}
