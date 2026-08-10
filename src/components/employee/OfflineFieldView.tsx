"use client";

import { useEffect, useState } from "react";
import { queueOfflineMutation } from "@/components/employee/OfflineFieldBridge";

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
  visits: OfflineVisit[];
};

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

function displayTime(value: string | null) {
  if (!value) return "Unscheduled";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function OfflineFieldView() {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(null);
  const [message, setMessage] = useState("Reading saved work…");

  useEffect(() => {
    void readSnapshot()
      .then((value) => {
        setSnapshot(value);
        setMessage(value ? "These records were saved on this device." : "No offline work was saved on this device.");
      })
      .catch(() => setMessage("Ferocity could not read offline work from this device."));
  }, []);

  async function queueStatus(visit: OfflineVisit, status: string) {
    await queueOfflineMutation({
      clientMutationId: crypto.randomUUID(),
      mutationType: "visit_status",
      visitId: visit.id,
      baseRecordVersion: visit.updated_at,
      payload: { status }
    });
    setMessage("Field status saved on this device. Ferocity will validate and sync it when connected.");
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
    setMessage("Field note saved on this device. It will sync when connected.");
  }

  return (
    <section className="workspace">
      <header className="app-shell-header panel">
        <a href="/employee" className="brand-mark">Ferocity</a>
        <div className="session-chip">
          <strong>Offline field view</strong>
          <span className="muted">{typeof navigator !== "undefined" && navigator.onLine ? "Connection available" : "No connection"}</span>
        </div>
        <a className="mini-button" href="/employee">Try live app</a>
      </header>

      <section className="panel">
        <span className="eyebrow">Saved On This Device</span>
        <h1>Today&apos;s Work</h1>
        <p>{message}</p>
        {snapshot ? <p className="muted">Snapshot created {displayTime(snapshot.version)}.</p> : null}
      </section>

      <section className="grid">
        {(snapshot?.visits ?? []).map((visit) => (
          <OfflineVisitCard visit={visit} queueStatus={queueStatus} queueNote={queueNote} key={visit.id} />
        ))}
        {snapshot && snapshot.visits.length === 0 ? <section className="empty-state span-12"><h2>No assigned work</h2><p>The last saved snapshot contained no open visits.</p></section> : null}
      </section>
    </section>
  );
}

function OfflineVisitCard({
  visit,
  queueStatus,
  queueNote
}: {
  visit: OfflineVisit;
  queueStatus: (visit: OfflineVisit, status: string) => Promise<void>;
  queueNote: (visit: OfflineVisit, note: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(visit.status);
  const [note, setNote] = useState("");
  const onMyWayHref = visit.customer_phone
    ? `sms:${visit.customer_phone}?body=${encodeURIComponent(`Hi ${visit.customer_name.split(" ")[0] || "there"}, your service professional is on the way for ${visit.title}. We will see you soon.`)}`
    : null;

  return (
    <article className="panel span-6">
      <span className="eyebrow">{visit.priority} · {visit.status.replaceAll("_", " ")}</span>
      <h2>{visit.title}</h2>
      <p><strong>{visit.customer_name}</strong></p>
      <p>{visit.address || "Address not saved"}</p>
      <p className="muted">{displayTime(visit.scheduled_start)} – {displayTime(visit.scheduled_end)}</p>
      <p>{visit.scope || "Scope was not available in the saved snapshot."}</p>
      {visit.access_instructions ? <p><strong>Access:</strong> {visit.access_instructions}</p> : null}
      {visit.dispatch_notes ? <p><strong>Office:</strong> {visit.dispatch_notes}</p> : null}
      <div className="button-row">
        {visit.customer_phone ? <a className="mini-button" href={`tel:${visit.customer_phone}`}>Call</a> : null}
        {onMyWayHref ? <a className="mini-button" href={onMyWayHref}>Text I&apos;m on my way</a> : null}
        {visit.address ? <a className="mini-button secondary-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`}>Directions</a> : null}
      </div>

      <div className="notice">
        <strong>Required forms</strong>
        {visit.form_assignments.map((form) => <p key={form.assignmentId}>{form.name} · {form.status}</p>)}
        {visit.form_assignments.length === 0 ? <p>No forms were included in this snapshot.</p> : null}
        <p className="field-help">Complex forms and signatures stay in the live view. Offline completion is rejected safely if required evidence is missing.</p>
      </div>

      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void queueStatus(visit, status);
        }}
      >
        <label>
          Save a field status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="dispatched">Dispatched</option>
            <option value="en_route">En route</option>
            <option value="arrived">Arrived</option>
            <option value="in_progress">In progress</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="no_show">No show</option>
          </select>
        </label>
        <button className="button" type="submit">Queue status</button>
      </form>

      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void queueNote(visit, note).then(() => setNote(""));
        }}
      >
        <label>
          Offline field note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} required />
        </label>
        <button className="button secondary-button" type="submit">Queue note</button>
      </form>
    </article>
  );
}
