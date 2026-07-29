import Link from "next/link";
import { notFound } from "next/navigation";
import { updateVisitDispatchStatusAction } from "@/app/app/schedule/actions";
import { getFieldVisit } from "@/lib/field-ops/get-field-visit";
import {
  saveVisitFieldNoteAction,
  saveVisitSignatureAction,
  submitFieldFormAction
} from "./actions";

export const dynamic = "force-dynamic";

function dateTime(value: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function EmployeeVisitPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const dashboard = await getFieldVisit(visitId);
  if (!dashboard) notFound();
  const { visit } = dashboard;
  const readiness = visit.completionReadiness as { blockers?: Array<{ title?: string; detail?: string }> };

  return (
    <main className="page-shell employee-shell">
      <section className="workspace">
        <header className="app-shell-header panel">
          <Link href="/employee" className="brand-mark">Ferocity</Link>
          <div className="session-chip">
            <strong>{visit.title}</strong>
            <span className="muted">{visit.workOrderNumber || "Field work"}</span>
          </div>
          <Link className="mini-button" href="/employee">Today</Link>
        </header>

        <section className="panel hero-panel">
          <span className="eyebrow">{visit.priority} priority · {visit.status.replaceAll("_", " ")}</span>
          <h1>{visit.title}</h1>
          <p>{visit.customerName} · {visit.locationName || "Service location"}</p>
          <p className="muted">{dateTime(visit.scheduledStart)} – {dateTime(visit.scheduledEnd)}</p>
          <div className="button-row">
            {visit.customerPhone ? <a className="button" href={`tel:${visit.customerPhone}`}>Call customer</a> : null}
            {visit.address ? <a className="button secondary-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`} target="_blank" rel="noreferrer">Directions</a> : null}
            {visit.estimateId ? <Link className="button secondary-button" href={`/app/service/estimates/${visit.estimateId}`}>Scope / estimate</Link> : null}
          </div>
        </section>

        <section className="grid">
          <article className="panel span-8">
            <h2>What you need to know</h2>
            <dl className="detail-list">
              <div><dt>Address</dt><dd>{visit.address || "Address needed"}</dd></div>
              <div><dt>Scope</dt><dd>{visit.workOrderDescription || visit.fieldInstructions || "Open the linked estimate or ask the office for scope details."}</dd></div>
              <div><dt>Dispatch notes</dt><dd>{visit.dispatchNotes || "No dispatch notes."}</dd></div>
              <div><dt>Customer notes</dt><dd>{visit.customerNotes || "No customer notes."}</dd></div>
              <div><dt>Access</dt><dd>{visit.accessInstructions || "No access instructions."}</dd></div>
              <div><dt>Parking</dt><dd>{visit.parkingInstructions || "No parking instructions."}</dd></div>
              {visit.gateCode ? <div><dt>Gate / entry</dt><dd>{visit.gateCode}</dd></div> : null}
            </dl>
          </article>

          <article className="panel span-4">
            <h2>Move the visit</h2>
            <p className="muted">Ferocity records the real dispatch timestamps. Completion is blocked until required forms pass.</p>
            <form action={updateVisitDispatchStatusAction} className="form-stack">
              <input type="hidden" name="visitId" value={visit.id} />
              <select name="status" defaultValue={visit.status}>
                <option value="dispatched">Dispatched</option>
                <option value="en_route">En route</option>
                <option value="arrived">Arrived</option>
                <option value="in_progress">Start work</option>
                <option value="paused">Paused</option>
                <option value="completed">Complete</option>
                <option value="no_show">No show</option>
                <option value="canceled">Canceled</option>
              </select>
              <button className="button" type="submit">Save field status</button>
            </form>
            <div className={`notice ${visit.completionReadinessStatus === "blocked" ? "warning" : ""}`}>
              <strong>Completion: {visit.completionReadinessStatus.replaceAll("_", " ")}</strong>
              {(readiness.blockers ?? []).map((blocker, index) => (
                <p key={`${blocker.title}-${index}`}>{blocker.title}: {blocker.detail}</p>
              ))}
            </div>
          </article>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Required Evidence</span>
              <h2>Finish the work record once</h2>
            </div>
            <span className="pill">{dashboard.forms.filter((form) => form.requiredForCompletion).length} required</span>
          </div>
          <div className="grid">
            {dashboard.forms.map((form) => (
              <form action={submitFieldFormAction} className="panel span-6 form-stack" key={form.assignmentId}>
                <input type="hidden" name="assignmentId" value={form.assignmentId} />
                <input type="hidden" name="visitId" value={visit.id} />
                <div className="section-heading">
                  <div>
                    <h3>{form.name}</h3>
                    <p className="muted">{form.description}</p>
                  </div>
                  <span className="pill">{(form.latestSubmissionStatus || form.status).replaceAll("_", " ")}</span>
                </div>
                {form.fields.map((field, index) => (
                  <FieldInput
                    key={`${String(field.key)}-${index}`}
                    field={field}
                    value={form.latestResponses[String(field.key)]}
                  />
                ))}
                <button className="button" type="submit">Validate and save form</button>
              </form>
            ))}
            {dashboard.forms.length === 0 ? <div className="empty-state span-12"><h3>No field forms assigned</h3><p>The office can assign a service-specific checklist.</p></div> : null}
          </div>
        </section>

        <section className="grid">
          <form action={saveVisitFieldNoteAction} className="panel span-6 form-stack">
            <h2>Field note</h2>
            <input type="hidden" name="visitId" value={visit.id} />
            <textarea name="note" rows={5} placeholder="Describe completed work, a delay, damage, delivery, safety concern, or customer request." required />
            <button className="button" type="submit">Add to permanent work history</button>
          </form>

          <form action={saveVisitSignatureAction} className="panel span-6 form-stack">
            <h2>Capture acknowledgment</h2>
            <input type="hidden" name="visitId" value={visit.id} />
            <select name="signatureType" defaultValue="work_completion">
              <option value="work_completion">Work completion</option>
              <option value="customer_authorization">Customer authorization</option>
              <option value="scope_change">Scope change</option>
              <option value="worker_attestation">Worker attestation</option>
              <option value="other">Other</option>
            </select>
            <input name="signerName" placeholder="Signer name" required />
            <input name="signerRole" placeholder="Customer, manager, technician..." />
            <textarea name="statementText" rows={3} defaultValue="I acknowledge the work and information shown above." required />
            <input name="signatureDataUrl" type="hidden" value="" />
            <p className="muted">Typed acknowledgment is recorded with timestamp and device context. Drawn signatures can be enabled after encrypted file storage is connected.</p>
            <button className="button" type="submit">Record acknowledgment</button>
          </form>
        </section>

        <section className="grid">
          <article className="panel span-6">
            <h2>Equipment and assets</h2>
            <ul className="list">
              {dashboard.assets.map((asset) => (
                <li className="list-row" key={asset.id}>
                  <div>
                    <h3>{asset.name}</h3>
                    <p className="muted">{asset.manufacturer || "Unknown maker"} {asset.model || ""} · {asset.serial_number || "No serial"}</p>
                    <p className="muted">{asset.condition} · Warranty {asset.warranty_expires_at || "not recorded"}</p>
                  </div>
                  <span className="pill">{asset.asset_type}</span>
                </li>
              ))}
              {dashboard.assets.length === 0 ? <li className="list-row"><span className="muted">No equipment is recorded at this location yet.</span></li> : null}
            </ul>
          </article>

          <article className="panel span-6">
            <h2>Work history</h2>
            <ul className="list">
              {dashboard.events.map((event) => (
                <li className="list-row" key={event.id}>
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.detail}</p>
                    <p className="muted">{event.source_type} · {dateTime(event.occurred_at)}</p>
                  </div>
                </li>
              ))}
              {dashboard.events.length === 0 ? <li className="list-row"><span className="muted">No work history yet.</span></li> : null}
            </ul>
          </article>
        </section>
      </section>
    </main>
  );
}

function FieldInput({ field, value }: { field: Record<string, unknown>; value: unknown }) {
  const key = typeof field.key === "string" ? field.key : "field";
  const label = typeof field.label === "string" ? field.label : key;
  const type = typeof field.type === "string" ? field.type : "text";
  const required = field.required === true;
  const name = `field:${key}`;

  if (type === "checkbox") {
    return (
      <label className="check-row">
        <input name={name} type="checkbox" defaultChecked={value === true} required={required} />
        {label}{required ? " *" : ""}
      </label>
    );
  }
  if (type === "textarea") {
    return <label>{label}{required ? " *" : ""}<textarea name={name} rows={4} defaultValue={typeof value === "string" ? value : ""} required={required} /></label>;
  }
  if (type === "select" && Array.isArray(field.options)) {
    return (
      <label>
        {label}{required ? " *" : ""}
        <select name={name} defaultValue={typeof value === "string" ? value : ""} required={required}>
          <option value="">Choose</option>
          {field.options.filter((option): option is string => typeof option === "string").map((option) => <option value={option} key={option}>{option}</option>)}
        </select>
      </label>
    );
  }
  const inputType = ["number", "date", "datetime-local", "url", "email", "tel"].includes(type) ? type : "text";
  return (
    <label>
      {label}{required ? " *" : ""}
      <input name={name} type={inputType} defaultValue={typeof value === "string" || typeof value === "number" ? String(value) : ""} required={required} />
    </label>
  );
}
