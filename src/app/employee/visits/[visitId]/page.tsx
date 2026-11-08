import Link from "next/link";
import { notFound } from "next/navigation";
import { getFieldVisit } from "@/lib/field-ops/get-field-visit";
import {
  saveVisitFieldNoteAction,
  saveVisitSignatureAction,
  submitFieldFormAction,
  updateEmployeeVisitStatusAction
} from "./actions";
import { formatWorkerDateTime, workerPlural, type WorkerLocale } from "@/lib/employee/worker-locale";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";

export const dynamic = "force-dynamic";

function dateTime(value: string | null, language: WorkerLocale) {
  if (!value) return language === "es" ? "Sin horario" : "Not scheduled";
  return formatWorkerDateTime(value, language);
}

const visitCopy = {
  en: {
    fieldWork: "Field work", today: "Today", there: "there", professional: "your service professional",
    onWayMessage: (name: string, worker: string, title: string) => `Hi ${name}, ${worker} is on the way for ${title}. We will see you soon.`,
    priority: "priority", location: "Service location", call: "Call customer", textOnWay: "Text I'm on my way", directions: "Directions", scopeEstimate: "Scope / estimate",
    know: "What you need to know", address: "Address", addressNeeded: "Address needed", scope: "Scope", scopeFallback: "Open the linked estimate or ask the office for scope details.",
    dispatch: "Dispatch notes", noDispatch: "No dispatch notes.", customerNotes: "Customer notes", noCustomerNotes: "No customer notes.", access: "Access", noAccess: "No access instructions.", parking: "Parking", noParking: "No parking instructions.", gate: "Gate / entry",
    move: "Move the visit", moveBody: "Ferocity records the real dispatch timestamps. Completion is blocked until required forms pass.", saveStatus: "Save field status", completion: "Completion",
    evidence: "Required Evidence", finish: "Finish the work record once", required: "required", saveForm: "Validate and save form", noForms: "No field forms assigned", noFormsBody: "The office can assign a service-specific checklist.",
    fieldNote: "Field note", notePlaceholder: "Describe completed work, a delay, damage, delivery, safety concern, or customer request.", addHistory: "Add to permanent work history",
    acknowledgment: "Capture acknowledgment", workCompletion: "Work completion", customerAuthorization: "Customer authorization", scopeChange: "Scope change", workerAttestation: "Worker attestation", other: "Other", signer: "Signer name", signerRole: "Customer, manager, technician...", statement: "I acknowledge the work and information shown above.", acknowledgmentHelp: "Typed acknowledgment is recorded with timestamp and device context. Drawn signatures can be enabled after encrypted file storage is connected.", recordAcknowledgment: "Record acknowledgment",
    photos: "Job photos and proof", readyReview: "Ready for office review.", viewFile: "View file", noPhotos: "No job photos or proof uploaded yet.", equipment: "Equipment and assets", unknownMaker: "Unknown maker", noSerial: "No serial", warranty: "Warranty", notRecorded: "not recorded", noEquipment: "No equipment is recorded at this location yet.", history: "Work history", noHistory: "No work history yet.", choose: "Choose",
    notices: { form_saved: "Form saved.", acknowledgment_saved: "Acknowledgment recorded.", note_saved: "Field note saved.", status_saved: "Field status saved.", schedule_blocked: "A blocking schedule conflict prevents that status change. Contact the office.", evidence_required: "Required evidence is still missing. Complete the required forms before marking this visit complete." }
  },
  es: {
    fieldWork: "Trabajo de campo", today: "Hoy", there: "allí", professional: "su profesional de servicio",
    onWayMessage: (name: string, worker: string, title: string) => `Hola ${name}, ${worker} va en camino para ${title}. Nos vemos pronto.`,
    priority: "prioridad", location: "Lugar del servicio", call: "Llamar al cliente", textOnWay: "Avisar que voy en camino", directions: "Indicaciones", scopeEstimate: "Alcance / estimado",
    know: "Lo que necesita saber", address: "Dirección", addressNeeded: "Falta la dirección", scope: "Alcance", scopeFallback: "Abra el estimado vinculado o consulte a la oficina sobre el alcance.",
    dispatch: "Notas de despacho", noDispatch: "No hay notas de despacho.", customerNotes: "Notas del cliente", noCustomerNotes: "No hay notas del cliente.", access: "Acceso", noAccess: "No hay instrucciones de acceso.", parking: "Estacionamiento", noParking: "No hay instrucciones de estacionamiento.", gate: "Puerta / entrada",
    move: "Actualizar la visita", moveBody: "Ferocity registra las horas reales de despacho. No se puede completar hasta que se aprueben los formularios requeridos.", saveStatus: "Guardar estado de campo", completion: "Finalización",
    evidence: "Evidencia requerida", finish: "Complete una vez el registro del trabajo", required: "requeridos", saveForm: "Validar y guardar formulario", noForms: "No hay formularios de campo asignados", noFormsBody: "La oficina puede asignar una lista específica para el servicio.",
    fieldNote: "Nota de campo", notePlaceholder: "Describa el trabajo terminado, una demora, daño, entrega, riesgo de seguridad o solicitud del cliente.", addHistory: "Agregar al historial permanente",
    acknowledgment: "Registrar confirmación", workCompletion: "Trabajo terminado", customerAuthorization: "Autorización del cliente", scopeChange: "Cambio de alcance", workerAttestation: "Declaración del trabajador", other: "Otro", signer: "Nombre del firmante", signerRole: "Cliente, gerente, técnico...", statement: "Confirmo el trabajo y la información que se muestran arriba.", acknowledgmentHelp: "La confirmación escrita se registra con la hora y el contexto del dispositivo. Las firmas dibujadas pueden habilitarse después de conectar el almacenamiento cifrado.", recordAcknowledgment: "Registrar confirmación",
    photos: "Fotos y comprobantes del trabajo", readyReview: "Listo para revisión de la oficina.", viewFile: "Ver archivo", noPhotos: "Todavía no hay fotos ni comprobantes.", equipment: "Equipos y activos", unknownMaker: "Fabricante desconocido", noSerial: "Sin número de serie", warranty: "Garantía", notRecorded: "no registrada", noEquipment: "Todavía no hay equipos registrados en este lugar.", history: "Historial de trabajo", noHistory: "Todavía no hay historial de trabajo.", choose: "Seleccione",
    notices: { form_saved: "Formulario guardado.", acknowledgment_saved: "Confirmación registrada.", note_saved: "Nota de campo guardada.", status_saved: "Estado de campo guardado.", schedule_blocked: "Un conflicto de horario impide ese cambio. Comuníquese con la oficina.", evidence_required: "Todavía falta evidencia requerida. Complete los formularios antes de marcar la visita como terminada." }
  }
} as const;

const enumLabels: Record<WorkerLocale, Record<string, string>> = {
  en: {},
  es: {
    low: "baja", normal: "normal", high: "alta", urgent: "urgente", dispatched: "despachada", en_route: "en camino", arrived: "llegó", in_progress: "en curso", paused: "en pausa", completed: "terminada", no_show: "no se presentó", canceled: "cancelada", pending: "pendiente", submitted: "enviado", approved: "aprobado", rejected: "rechazado", blocked: "bloqueado", ready: "lista", photo: "foto", video: "video", document: "documento", receipt: "recibo", worker: "trabajador"
  }
};

function enumLabel(value: string, language: WorkerLocale) {
  return enumLabels[language][value] ?? value.replaceAll("_", " ");
}

export default async function EmployeeVisitPage({ params, searchParams }: { params: Promise<{ visitId: string }>; searchParams: Promise<{ notice?: string }> }) {
  const { visitId } = await params;
  const query = await searchParams;
  const dashboard = await getFieldVisit(visitId);
  if (!dashboard) notFound();
  const { visit } = dashboard;
  const language = dashboard.language;
  const copy = visitCopy[language];
  const notice = query.notice && query.notice in copy.notices
    ? copy.notices[query.notice as keyof typeof copy.notices]
    : null;
  const onMyWayMessage = copy.onWayMessage(visit.customerName.split(" ")[0] || copy.there, dashboard.workerName || copy.professional, visit.title);
  const onMyWayHref = visit.customerPhone
    ? `sms:${visit.customerPhone}?body=${encodeURIComponent(onMyWayMessage)}`
    : null;
  const readiness = visit.completionReadiness as { blockers?: Array<{ title?: string; detail?: string }> };

  return (
    <main className="page-shell employee-shell" lang={language === "es" ? "es-US" : "en-US"}>
      <WorkerDocumentLanguage language={language} />
      <section className="workspace">
        <header className="app-shell-header panel">
          <Link href="/employee" className="brand-mark">Ferocity</Link>
          <div className="session-chip">
            <strong>{visit.title}</strong>
            <span className="muted">{visit.workOrderNumber || copy.fieldWork}</span>
          </div>
          <Link className="mini-button" href="/employee">{copy.today}</Link>
        </header>

        {notice ? <p className={`notice ${query.notice === "schedule_blocked" || query.notice === "evidence_required" ? "warning" : "success"}`} role="status">{notice}</p> : null}

        <section className="panel hero-panel">
          <span className="eyebrow">{enumLabel(visit.priority, language)} {copy.priority} · {enumLabel(visit.status, language)}</span>
          <h1>{visit.title}</h1>
          <p>{visit.customerName} · {visit.locationName || copy.location}</p>
          <p className="muted">{dateTime(visit.scheduledStart, language)} - {dateTime(visit.scheduledEnd, language)}</p>
          <div className="button-row">
            {visit.customerPhone ? <a className="button" href={`tel:${visit.customerPhone}`}>{copy.call}</a> : null}
            {onMyWayHref ? <a className="button" href={onMyWayHref}>{copy.textOnWay}</a> : null}
            {visit.address ? <a className="button secondary-button" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.address)}`} target="_blank" rel="noreferrer">{copy.directions}</a> : null}
            {visit.estimateId ? <Link className="button secondary-button" href={`/app/service/estimates/${visit.estimateId}`}>{copy.scopeEstimate}</Link> : null}
          </div>
        </section>

        <section className="grid">
          <article className="panel span-8">
            <h2>{copy.know}</h2>
            <dl className="detail-list">
              <div><dt>{copy.address}</dt><dd>{visit.address || copy.addressNeeded}</dd></div>
              <div><dt>{copy.scope}</dt><dd>{visit.workOrderDescription || visit.fieldInstructions || copy.scopeFallback}</dd></div>
              <div><dt>{copy.dispatch}</dt><dd>{visit.dispatchNotes || copy.noDispatch}</dd></div>
              <div><dt>{copy.customerNotes}</dt><dd>{visit.customerNotes || copy.noCustomerNotes}</dd></div>
              <div><dt>{copy.access}</dt><dd>{visit.accessInstructions || copy.noAccess}</dd></div>
              <div><dt>{copy.parking}</dt><dd>{visit.parkingInstructions || copy.noParking}</dd></div>
              {visit.gateCode ? <div><dt>{copy.gate}</dt><dd>{visit.gateCode}</dd></div> : null}
            </dl>
          </article>

          <article className="panel span-4">
            <h2>{copy.move}</h2>
            <p className="muted">{copy.moveBody}</p>
            <form action={updateEmployeeVisitStatusAction} className="form-stack">
              <input type="hidden" name="visitId" value={visit.id} />
              <select name="status" defaultValue={visit.status}>
                {(["dispatched", "en_route", "arrived", "in_progress", "paused", "completed", "no_show", "canceled"] as const).map((status) => <option value={status} key={status}>{enumLabel(status, language)}</option>)}
              </select>
              <button className="button" type="submit">{copy.saveStatus}</button>
            </form>
            <div className={`notice ${visit.completionReadinessStatus === "blocked" ? "warning" : ""}`}>
              <strong>{copy.completion}: {enumLabel(visit.completionReadinessStatus, language)}</strong>
              {(readiness.blockers ?? []).map((blocker, index) => (
                <p key={`${blocker.title}-${index}`}>{blocker.title}: {blocker.detail}</p>
              ))}
            </div>
          </article>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <span className="eyebrow">{copy.evidence}</span>
              <h2>{copy.finish}</h2>
            </div>
            <span className="pill">{dashboard.forms.filter((form) => form.requiredForCompletion).length} {workerPlural(dashboard.forms.filter((form) => form.requiredForCompletion).length, language, { en: ["required", "required"], es: ["requerido", "requeridos"] })}</span>
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
                  <span className="pill">{enumLabel(form.latestSubmissionStatus || form.status, language)}</span>
                </div>
                {form.fields.map((field, index) => (
                  <FieldInput
                    key={`${String(field.key)}-${index}`}
                    field={field}
                    value={form.latestResponses[String(field.key)]}
                    language={language}
                  />
                ))}
                <button className="button" type="submit">{copy.saveForm}</button>
              </form>
            ))}
            {dashboard.forms.length === 0 ? <div className="empty-state span-12"><h3>{copy.noForms}</h3><p>{copy.noFormsBody}</p></div> : null}
          </div>
        </section>

        <section className="grid">
          <form action={saveVisitFieldNoteAction} className="panel span-6 form-stack">
            <h2>{copy.fieldNote}</h2>
            <input type="hidden" name="visitId" value={visit.id} />
            <textarea name="note" rows={5} placeholder={copy.notePlaceholder} required />
            <button className="button" type="submit">{copy.addHistory}</button>
          </form>

          <form action={saveVisitSignatureAction} className="panel span-6 form-stack">
            <h2>{copy.acknowledgment}</h2>
            <input type="hidden" name="visitId" value={visit.id} />
            <select name="signatureType" defaultValue="work_completion">
              <option value="work_completion">{copy.workCompletion}</option>
              <option value="customer_authorization">{copy.customerAuthorization}</option>
              <option value="scope_change">{copy.scopeChange}</option>
              <option value="worker_attestation">{copy.workerAttestation}</option>
              <option value="other">{copy.other}</option>
            </select>
            <input name="signerName" placeholder={copy.signer} required />
            <input name="signerRole" placeholder={copy.signerRole} />
            <textarea name="statementText" rows={3} defaultValue={copy.statement} required />
            <input name="signatureDataUrl" type="hidden" value="" />
            <p className="muted">{copy.acknowledgmentHelp}</p>
            <button className="button" type="submit">{copy.recordAcknowledgment}</button>
          </form>
        </section>

        <section className="grid">
          <article className="panel span-6">
            <h2>{copy.photos}</h2>
            <ul className="list">
              {dashboard.media.map((media) => (
                <li className="list-row" key={media.id}>
                  <div>
                    <h3>{media.title}</h3>
                    <p className="muted">{enumLabel(media.media_type, language)} · {dateTime(media.created_at, language)}</p>
                    <p>{media.ai_summary || copy.readyReview}</p>
                    {media.file_url ? (
                      <a className="mini-button" href={`/api/field/media/${media.id}`} target="_blank" rel="noreferrer">
                        {copy.viewFile}
                      </a>
                    ) : null}
                  </div>
                  <span className="pill">{enumLabel(media.status, language)}</span>
                </li>
              ))}
              {dashboard.media.length === 0 ? <li className="list-row"><span className="muted">{copy.noPhotos}</span></li> : null}
            </ul>
          </article>

          <article className="panel span-6">
            <h2>{copy.equipment}</h2>
            <ul className="list">
              {dashboard.assets.map((asset) => (
                <li className="list-row" key={asset.id}>
                  <div>
                    <h3>{asset.name}</h3>
                    <p className="muted">{asset.manufacturer || copy.unknownMaker} {asset.model || ""} · {asset.serial_number || copy.noSerial}</p>
                    <p className="muted">{enumLabel(asset.condition, language)} · {copy.warranty} {asset.warranty_expires_at || copy.notRecorded}</p>
                  </div>
                  <span className="pill">{enumLabel(asset.asset_type, language)}</span>
                </li>
              ))}
              {dashboard.assets.length === 0 ? <li className="list-row"><span className="muted">{copy.noEquipment}</span></li> : null}
            </ul>
          </article>

          <article className="panel span-6">
            <h2>{copy.history}</h2>
            <ul className="list">
              {dashboard.events.map((event) => (
                <li className="list-row" key={event.id}>
                  <div>
                    <h3>{event.title}</h3>
                    <p>{event.detail}</p>
                    <p className="muted">{enumLabel(event.source_type, language)} · {dateTime(event.occurred_at, language)}</p>
                  </div>
                </li>
              ))}
              {dashboard.events.length === 0 ? <li className="list-row"><span className="muted">{copy.noHistory}</span></li> : null}
            </ul>
          </article>
        </section>
      </section>
    </main>
  );
}

function FieldInput({ field, value, language }: { field: Record<string, unknown>; value: unknown; language: WorkerLocale }) {
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
          <option value="">{visitCopy[language].choose}</option>
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
