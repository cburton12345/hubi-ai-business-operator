import Link from "next/link";
import { Camera, Clock, MapPin, ReceiptText, Route } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { OfflineFieldBridge } from "@/components/employee/OfflineFieldBridge";
import { getEmployeeWorkday } from "@/lib/employee/get-employee-workday";
import { getOperationsWorkforceDashboard } from "@/lib/operations-workforce/get-operations-workforce-dashboard";
import {
  clockOutTimeEntryAction,
  createClockInAction,
  createExpenseAction,
  createFieldMediaAction,
  createMileageAction,
  respondToEmployeeCashAdvanceAction,
  updateEmployeeLanguageAction
} from "@/app/app/operations-workforce/actions";

export async function EmployeeWorkday({ showOwnerLinks = false }: { showOwnerLinks?: boolean }) {
  const employeeDashboard = showOwnerLinks ? null : await getEmployeeWorkday();
  const dashboard = employeeDashboard ?? await getOperationsWorkforceDashboard();
  const openAssignments = dashboard.assignments.filter((assignment) => assignment.status !== "completed").slice(0, 8);
  const employeeMode = !showOwnerLinks;
  const signedInWorker = employeeDashboard?.workers[0] ?? null;
  const language: "en" | "es" = employeeDashboard?.language === "es" ? "es" : "en";
  const copy = employeeCopy[language];

  return (
    <QueuePageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
    >
      <OfflineFieldBridge />

      {employeeMode && !signedInWorker ? (
        <section className="notice warning">
          <strong>{copy.linkTitle}</strong>
          <p>{copy.linkBody}</p>
          {employeeDashboard?.access.canManageAll ? <Link className="mini-button" href="/app/operations-workforce">Create or link my field profile</Link> : null}
        </section>
      ) : null}

      {employeeMode && signedInWorker ? (
        <form action={updateEmployeeLanguageAction} className="panel inline-form section-actions">
          <strong>{copy.language}</strong>
          <select name="language" defaultValue={language}>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
          <button className="mini-button" type="submit">{copy.saveLanguage}</button>
        </form>
      ) : null}

      <section className="grid section-actions">
        <Metric label={copy.workingNow} value={dashboard.metrics.workingNow} />
        <Metric label={copy.scheduledToday} value={dashboard.metrics.scheduledToday} />
        <Metric label={copy.openAssignments} value={dashboard.metrics.openAssignments} />
        <Metric label={copy.needsReview} value={dashboard.metrics.needsReview} />
      </section>

      {employeeDashboard ? (
        <section className="grid section-actions">
          <section className="panel span-7">
            <h2><Clock size={18} /> {copy.hoursAndWork}</h2>
            <p className="muted">{copy.hoursAndWorkBody}</p>
            <ul className="list">
              {employeeDashboard.timeEntries.map((entry) => (
                <li className="list-row" key={entry.id}>
                  <div>
                    <h3>{entry.assignment} / {entry.hours} {copy.hours}</h3>
                    <p className="muted">{entry.clockIn} → {entry.clockOut}</p>
                    <p className="muted">{copy.location}: {entry.startLocation} → {entry.endLocation}</p>
                    <p>{copy.work}: {entry.notes}</p>
                  </div>
                  <span className="pill">{entry.status}</span>
                </li>
              ))}
              {employeeDashboard.timeEntries.length === 0 ? <li className="list-row"><span className="muted">{copy.noHours}</span></li> : null}
            </ul>
          </section>

          <section className="panel span-5">
            <h2><DollarSignIcon /> {copy.advances}</h2>
            <p className="muted">{copy.advancesBody}</p>
            <ul className="list">
              {employeeDashboard.cashAdvances.map((advance) => (
                <li className="list-row" key={advance.id}>
                  <div>
                    <h3>{advance.amount} / {advance.advancedAt}</h3>
                    <p className="muted">{advance.paymentMethod.replaceAll("_", " ")} / {advance.purpose}</p>
                    {advance.status === "recorded" ? (
                      <div className="form-stack">
                        <form action={respondToEmployeeCashAdvanceAction} className="inline-form">
                          <input name="advanceId" type="hidden" value={advance.id} />
                          <input name="response" type="hidden" value="acknowledged" />
                          <button className="mini-button" type="submit">{copy.acknowledge}</button>
                        </form>
                        <form action={respondToEmployeeCashAdvanceAction} className="form-stack">
                          <input name="advanceId" type="hidden" value={advance.id} />
                          <input name="response" type="hidden" value="disputed" />
                          <input name="note" placeholder={copy.disputeReason} required />
                          <button className="mini-button secondary-button" type="submit">{copy.dispute}</button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                  <span className={`pill ${advance.status === "disputed" ? "high" : ""}`}>{advance.status}</span>
                </li>
              ))}
              {employeeDashboard.cashAdvances.length === 0 ? <li className="list-row"><span className="muted">{copy.noAdvances}</span></li> : null}
            </ul>
          </section>
        </section>
      ) : null}

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>{copy.workList}</h2>
            <p className="muted">{copy.workListBody}</p>
          </div>
          <div className="button-row">
            {showOwnerLinks ? <Link className="mini-button" href="/app/crew-itinerary">Crew Day</Link> : null}
            {showOwnerLinks ? <Link className="mini-button secondary-button" href="/app/operations-workforce">Full workforce view</Link> : null}
          </div>
        </div>
        <ul className="list">
          {openAssignments.map((assignment) => (
            <li className="list-row" key={assignment.id}>
              <div>
                <h3>
                  {assignment.serviceVisitId ? (
                    <Link href={`/employee/visits/${assignment.serviceVisitId}`}>{assignment.title}</Link>
                  ) : assignment.title}
                </h3>
                <p className="muted">{assignment.worker} / {assignment.jobsite}</p>
                <p>{assignment.schedule}</p>
              </div>
              <div className="button-row">
                <span className={`pill ${assignment.priority === "high" || assignment.priority === "urgent" ? "high" : ""}`}>{assignment.status}</span>
                {assignment.serviceVisitId ? <Link className="mini-button" href={`/employee/visits/${assignment.serviceVisitId}`}>{copy.openWork}</Link> : null}
              </div>
            </li>
          ))}
          {openAssignments.length === 0 ? <li className="list-row"><span className="muted">{copy.noWork}</span></li> : null}
        </ul>
      </section>

      <section id="quick-actions" className="grid section-actions">
        <form action={createClockInAction} className="panel form-stack span-6">
          <h2><Clock size={18} /> {copy.punchIn}</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="clockInLocation" placeholder={copy.startLocation} />
          <textarea name="notes" rows={2} placeholder={copy.startNote} />
          <label className="checkbox-row"><input name="gpsVerified" type="checkbox" /><span>{copy.locationChecked}</span></label>
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>{copy.punchInButton}</button>
        </form>

        {employeeDashboard?.openTimeEntry ? (
          <form action={clockOutTimeEntryAction} className="panel form-stack span-6">
            <h2><Clock size={18} /> {copy.punchOut}</h2>
            <input name="employeeMode" type="hidden" value="1" />
            <input name="timeEntryId" type="hidden" value={employeeDashboard.openTimeEntry.id} />
            <p>{copy.punchedIn} {employeeDashboard.openTimeEntry.clockIn}.</p>
            <input name="clockOutLocation" placeholder={copy.endLocation} />
            <input name="breakMinutes" inputMode="numeric" placeholder={copy.breakMinutes} />
            <textarea name="notes" rows={2} placeholder={copy.workPerformed} />
            <button className="button" type="submit">{copy.punchOutButton}</button>
          </form>
        ) : null}

        <form action={createMileageAction} className="panel form-stack span-6">
          <h2><Route size={18} /> {copy.logMiles}</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vehicleLabel" placeholder={copy.vehicle} />
          <input name="startLocation" placeholder={copy.start} />
          <input name="endLocation" placeholder={copy.end} />
          <input name="miles" inputMode="decimal" placeholder={copy.miles} />
          <input name="entryMethod" type="hidden" value="manual" />
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>{copy.saveMiles}</button>
        </form>

        <form action={createExpenseAction} className="panel form-stack span-6">
          <h2><ReceiptText size={18} /> {copy.addCost}</h2>
          <p className="muted">{copy.costBody}</p>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <input name="vendor" placeholder={copy.vendor} />
          <div className="two-col">
            <input name="amount" inputMode="decimal" placeholder={copy.amount} />
            <input name="tax" inputMode="decimal" placeholder={copy.tax} />
          </div>
          <input name="category" placeholder={copy.category} />
          <label>
            Receipt photo
            <input name="receiptPhoto" type="file" accept="image/*,application/pdf" capture="environment" />
            <span className="field-help">On a phone, this can open the camera. The office reviews it before approval.</span>
          </label>
          <input name="receiptUrl" type="url" placeholder="Optional receipt or proof link" />
          <label className="check-row">
            <input name="extractReceipt" type="checkbox" />
            Draft cost details from the receipt
          </label>
          <input name="assignTo" type="hidden" value="job" />
          <select name="reimbursementStatus" defaultValue="submitted">
            <option value="submitted">Needs paid back</option>
            <option value="not_reimbursable">Company card / no payback</option>
          </select>
          <textarea name="aiSummary" rows={2} placeholder={copy.officeNote} />
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>{copy.saveCost}</button>
        </form>

        <form action={createFieldMediaAction} className="panel form-stack span-6">
          <h2><Camera size={18} /> {copy.uploadProof}</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} />}
          <AssignmentSelect assignments={dashboard.assignments} />
          <select name="mediaType" defaultValue="photo">
            <option value="photo">Photo</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
            <option value="receipt">Cost proof</option>
          </select>
          <input name="title" placeholder={copy.proofTitle} required />
          <label>
            Photo, video, or document
            <input name="mediaFile" type="file" accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf" capture="environment" />
            <span className="field-help">On a phone, this can open the camera. Files are stored privately and sent to the office for review.</span>
          </label>
          {showOwnerLinks ? <input name="fileUrl" type="url" placeholder="Optional existing proof link" /> : null}
          <textarea name="aiSummary" rows={2} placeholder={copy.whatShows} />
          <input name="consentStatus" type="hidden" value="internal_only" />
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>{copy.saveProof}</button>
        </form>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><MapPin size={18} /> {copy.fieldNotes}</h2>
            <p className="muted">{copy.fieldNotesBody}</p>
          </div>
          {showOwnerLinks ? <Link className="mini-button" href="/app/notifications">Reminders</Link> : null}
        </div>
      </section>
    </QueuePageShell>
  );
}

function DollarSignIcon() {
  return <span aria-hidden="true">$</span>;
}

const employeeCopy = {
  en: {
    eyebrow: "Field Team", title: "Today's Work",
    description: "See your schedule, record hours and location, note what you completed, and send field records to the office.",
    linkTitle: "Your field profile needs to be linked.",
    linkBody: "Ask an authorized company user for a private invitation. Owners and managers can also create a field profile for themselves. The link connects only your company membership and worker record.",
    language: "Language", saveLanguage: "Save", workingNow: "Working now", scheduledToday: "Scheduled today",
    openAssignments: "Open assignments", needsReview: "Needs review", workList: "Work List",
    workListBody: "Your assigned work, schedule, and field actions are together in one place.", openWork: "Open work",
    noWork: "No work is assigned yet.", punchIn: "Punch In", startLocation: "Where are you starting?",
    startNote: "Anything the office should know?", locationChecked: "Location checked", punchInButton: "Punch in",
    punchOut: "Punch Out", punchedIn: "You punched in", endLocation: "Where are you finishing?",
    breakMinutes: "Unpaid break minutes", workPerformed: "What did you complete today?", punchOutButton: "Punch out",
    hoursAndWork: "Hours, location, and work performed", hoursAndWorkBody: "Your recent work record stays visible before payroll review.",
    hours: "hours", location: "Location", work: "Work", noHours: "No time records yet.", advances: "Money advanced",
    advancesBody: "Review money the company recorded as advanced to you. This does not authorize an automatic wage deduction.",
    acknowledge: "Looks correct", dispute: "Report a problem", disputeReason: "What is wrong with this record?", noAdvances: "No advances recorded.",
    logMiles: "Log Miles", vehicle: "Truck, van, or trailer", start: "Start", end: "End", miles: "Miles", saveMiles: "Save miles",
    addCost: "Add Field Cost", costBody: "Photograph the receipt so the office can review job cost, reimbursement, tax category, and profit records.",
    vendor: "Store or vendor", amount: "Amount", tax: "Tax", category: "Materials, fuel, tools", officeNote: "Short note for the office", saveCost: "Save cost",
    uploadProof: "Upload Proof", proofTitle: "Before photo, completed work, delivery proof", whatShows: "What does this show?", saveProof: "Save proof",
    fieldNotes: "Field Notes", fieldNotesBody: "Keep the office current with job notes, receipts, mileage, and proof while you work."
  },
  es: {
    eyebrow: "Equipo de campo", title: "Trabajo de hoy",
    description: "Vea su horario, registre horas y ubicación, anote lo que completó y envíe registros del campo a la oficina.",
    linkTitle: "Su perfil de campo necesita conectarse.",
    linkBody: "Pida una invitación privada a un usuario autorizado de la empresa. Los dueños y gerentes también pueden crear su propio perfil de campo. El enlace conecta únicamente su membresía y registro de trabajador.",
    language: "Idioma", saveLanguage: "Guardar", workingNow: "Trabajando ahora", scheduledToday: "Programado hoy",
    openAssignments: "Trabajos abiertos", needsReview: "Por revisar", workList: "Lista de trabajo",
    workListBody: "Sus trabajos, horario y acciones de campo están juntos en un solo lugar.", openWork: "Abrir trabajo",
    noWork: "Todavía no hay trabajo asignado.", punchIn: "Marcar entrada", startLocation: "¿Dónde empieza?",
    startNote: "¿Hay algo que la oficina deba saber?", locationChecked: "Ubicación verificada", punchInButton: "Marcar entrada",
    punchOut: "Marcar salida", punchedIn: "Marcó entrada a las", endLocation: "¿Dónde termina?",
    breakMinutes: "Minutos de descanso no pagados", workPerformed: "¿Qué trabajo completó hoy?", punchOutButton: "Marcar salida",
    hoursAndWork: "Horas, ubicación y trabajo realizado", hoursAndWorkBody: "Su registro reciente permanece visible antes de la revisión de nómina.",
    hours: "horas", location: "Ubicación", work: "Trabajo", noHours: "Todavía no hay registros de tiempo.", advances: "Dinero adelantado",
    advancesBody: "Revise el dinero que la empresa registró como adelanto. Esto no autoriza una deducción automática del salario.",
    acknowledge: "Es correcto", dispute: "Reportar un problema", disputeReason: "¿Qué está incorrecto en este registro?", noAdvances: "No hay adelantos registrados.",
    logMiles: "Registrar millas", vehicle: "Camión, camioneta o remolque", start: "Inicio", end: "Fin", miles: "Millas", saveMiles: "Guardar millas",
    addCost: "Agregar gasto de campo", costBody: "Fotografíe el recibo para que la oficina revise el costo, reembolso, categoría fiscal y registros de ganancias.",
    vendor: "Tienda o proveedor", amount: "Monto", tax: "Impuesto", category: "Materiales, combustible, herramientas", officeNote: "Nota corta para la oficina", saveCost: "Guardar gasto",
    uploadProof: "Subir comprobante", proofTitle: "Foto anterior, trabajo terminado, prueba de entrega", whatShows: "¿Qué muestra esto?", saveProof: "Guardar comprobante",
    fieldNotes: "Notas de campo", fieldNotesBody: "Mantenga informada a la oficina con notas, recibos, millas y comprobantes mientras trabaja."
  }
} as const;

function EmployeeModeFields({
  employeeMode,
  worker
}: {
  employeeMode: boolean;
  worker: { id: string; name: string; trade: string } | null;
}) {
  if (!employeeMode) return null;
  return (
    <>
      <input name="employeeMode" type="hidden" value="1" />
      <input name="workerId" type="hidden" value={worker?.id ?? ""} />
      <p className="muted">{worker ? `${worker.name} / ${worker.trade}` : "Employee profile not linked"}</p>
    </>
  );
}

function WorkerSelect({ workers }: { workers: { id: string; name: string; trade: string }[] }) {
  return (
    <select name="workerId" defaultValue="">
      <option value="">Who is doing this?</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>{worker.name} / {worker.trade}</option>
      ))}
    </select>
  );
}

function AssignmentSelect({ assignments }: { assignments: { id: string; title: string; jobsite: string }[] }) {
  return (
    <select name="assignmentId" defaultValue="">
      <option value="">Which job?</option>
      {assignments.map((assignment) => (
        <option key={assignment.id} value={assignment.id}>{assignment.title} / {assignment.jobsite}</option>
      ))}
    </select>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel metric span-3">
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{label}</span>
    </section>
  );
}
