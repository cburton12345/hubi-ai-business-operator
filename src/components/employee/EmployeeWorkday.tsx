import Link from "next/link";
import { Camera, Clock, MapPin, ReceiptText, Route } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { OfflineFieldBridge } from "@/components/employee/OfflineFieldBridge";
import { EmployeeFerocityChat } from "@/components/employee/EmployeeFerocityChat";
import { EmployeeTimeClockForm } from "@/components/employee/EmployeeTimeClockForm";
import { EmployeeBalanceEntryForm } from "@/components/employee/EmployeeBalanceEntryForm";
import { getEmployeeChatInitialState } from "@/lib/employee/employee-chat";
import { getEmployeeWorkday } from "@/lib/employee/get-employee-workday";
import { getOperationsWorkforceDashboard } from "@/lib/operations-workforce/get-operations-workforce-dashboard";
import {
  clockOutTimeEntryAction,
  changeEmployeeBreakAction,
  createClockInAction,
  createExpenseAction,
  createFieldMediaAction,
  createMileageAction,
  respondToEmployeeCashAdvanceAction,
  updateAssignmentTaskStatusAction,
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
  const employeeChat = employeeDashboard?.access.workerId
    ? await getEmployeeChatInitialState(employeeDashboard.access)
    : null;

  return (
    <QueuePageShell
      eyebrow={copy.eyebrow}
      title={copy.title}
      description={copy.description}
      dashboardLabel={language === "es" ? "Panel" : "Dashboard"}
    >
      <OfflineFieldBridge language={language} />

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

      {employeeDashboard && signedInWorker ? <section className="panel section-actions">
        <div className="list-row flush-row"><div><p className="eyebrow">{copy.todayHours}: {employeeDashboard.payBalance.todayHours}</p><h2>{employeeDashboard.openTimeEntry ? employeeDashboard.openTimeEntry.onBreak ? copy.onBreak : copy.workingNowStatus : copy.clockedOutStatus}</h2><p className="muted">{copy.outstandingBalance}: {employeeDashboard.payBalance.outstandingAuthorizedBalance}</p></div><a className="mini-button secondary-button" href="#worker-balance-entry">{copy.addBalanceShortcut}</a></div>
        {!employeeDashboard.openTimeEntry ? <EmployeeTimeClockForm submitAction={createClockInAction} idleLabel={copy.punchInButton} pendingLabel={language === "es" ? "Guardando..." : "Saving..."} offlineMessage={copy.offlineRetry}>
          <EmployeeModeFields employeeMode worker={signedInWorker} copy={copy} />
          <AssignmentSelect assignments={dashboard.assignments} copy={copy} />
          <input name="clockInLocation" placeholder={copy.startLocation} />
        </EmployeeTimeClockForm> : <div className="grid">
          <EmployeeTimeClockForm submitAction={changeEmployeeBreakAction} idleLabel={employeeDashboard.openTimeEntry.onBreak ? copy.endBreak : copy.startBreak} pendingLabel={language === "es" ? "Guardando..." : "Saving..."} offlineMessage={copy.offlineRetry}>
            <input name="timeEntryId" type="hidden" value={employeeDashboard.openTimeEntry.id} />
            <input name="mode" type="hidden" value={employeeDashboard.openTimeEntry.onBreak ? "end" : "start"} />
            <p>{employeeDashboard.openTimeEntry.onBreak ? copy.endBreakBody : copy.startBreakBody}</p>
          </EmployeeTimeClockForm>
          <EmployeeTimeClockForm submitAction={clockOutTimeEntryAction} idleLabel={copy.punchOutButton} pendingLabel={language === "es" ? "Guardando..." : "Saving..."} offlineMessage={copy.offlineRetry}>
            <input name="employeeMode" type="hidden" value="1" />
            <input name="timeEntryId" type="hidden" value={employeeDashboard.openTimeEntry.id} />
            <input name="clockOutLocation" placeholder={copy.endLocation} />
            <input name="breakMinutes" inputMode="numeric" placeholder={copy.breakMinutes} />
          </EmployeeTimeClockForm>
        </div>}
      </section> : null}

      {employeeMode && signedInWorker && employeeChat ? (
        <EmployeeFerocityChat
          initialTurns={employeeChat.turns}
          initialThreadId={employeeChat.threadId}
          language={language}
        />
      ) : null}

      <section className="grid section-actions">
        <Metric label={copy.workingNow} value={dashboard.metrics.workingNow} />
        <Metric label={copy.scheduledToday} value={dashboard.metrics.scheduledToday} />
        <Metric label={copy.openAssignments} value={dashboard.metrics.openAssignments} />
        <Metric label={copy.needsReview} value={dashboard.metrics.needsReview} />
      </section>

      {employeeDashboard ? (
        <section className="grid section-actions">
          <Metric label={copy.grossEstimate} value={employeeDashboard.payBalance.grossEstimate} />
          <Metric label={copy.confirmedAllocations} value={employeeDashboard.payBalance.confirmedAllocations} />
          <Metric label={copy.netEstimate} value={employeeDashboard.payBalance.netPayableEstimate} />
          <Metric label={copy.outstandingBalance} value={employeeDashboard.payBalance.outstandingAuthorizedBalance} />
          <p className="muted span-12">{copy.payPreviewNotice}</p>
        </section>
      ) : null}

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
                    <p className="muted">{balanceEntryKindLabel(advance.entryKind, copy)} / {paymentMethodLabel(advance.paymentMethod, copy)}</p>
                    <p>{advance.purpose}</p>
                    <p className="muted">{copy.managerReview}: {balanceStatusLabel(advance.approvalStatus, language)} / {copy.authorization}: {balanceStatusLabel(advance.workerAuthorizationStatus, language)}</p>
                    <p className="muted">{copy.recovered}: {advance.recovered} / {copy.outstanding}: {advance.outstanding}</p>
                    {advance.repaymentTerms ? <p className="muted">{copy.terms}: {advance.repaymentTerms}</p> : null}
                    {safeEvidenceHref(advance.receiptUrl) ? <a href={safeEvidenceHref(advance.receiptUrl) ?? undefined}>{copy.viewEvidence}</a> : advance.receiptUrl ? <span className="muted">{copy.receiptEvidence}</span> : null}
                    {advance.status === "recorded" || advance.status === "acknowledged" ? (
                      <div className="form-stack">
                        {advance.status === "recorded" ? <form action={respondToEmployeeCashAdvanceAction} className="inline-form">
                          <input name="advanceId" type="hidden" value={advance.id} />
                          <input name="response" type="hidden" value="acknowledged" />
                          <button className="mini-button" type="submit">{copy.acknowledge}</button>
                        </form> : null}
                        {advance.isWorkerDebt && advance.approvalStatus !== "rejected" && advance.workerAuthorizationStatus !== "authorized" ? <form action={respondToEmployeeCashAdvanceAction} className="form-stack">
                          <input name="advanceId" type="hidden" value={advance.id} />
                          <input name="response" type="hidden" value="authorized" />
                          <textarea name="note" placeholder={copy.authorizationEvidence} required />
                          <button className="mini-button" type="submit">{copy.authorizeTerms}</button>
                        </form> : null}
                        <form action={respondToEmployeeCashAdvanceAction} className="form-stack">
                          <input name="advanceId" type="hidden" value={advance.id} />
                          <input name="response" type="hidden" value="disputed" />
                          <input name="note" placeholder={copy.disputeReason} required />
                          <button className="mini-button secondary-button" type="submit">{copy.dispute}</button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                  <span className={`pill ${advance.status === "disputed" ? "high" : ""}`}>{balanceStatusLabel(advance.status, language)}</span>
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
                {assignment.taskList.length > 0 ? (
                  <ul className="list compact-list">
                    {assignment.taskList.map((task) => (
                      <li className="list-row" key={`${assignment.id}-${task.index}`}>
                        <span>{task.title}</span>
                        <form action={updateAssignmentTaskStatusAction}>
                          <input name="assignmentId" type="hidden" value={assignment.id} />
                          <input name="taskIndex" type="hidden" value={task.index} />
                          <input name="status" type="hidden" value={task.status === "done" ? "open" : "done"} />
                          <button className="mini-button secondary-button" type="submit">
                            {task.status === "done" ? copy.reopenTask : copy.completeTask}
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="button-row">
                <span className={`pill ${assignment.priority === "high" || assignment.priority === "urgent" ? "high" : ""}`}>{assignmentStatusLabel(assignment.status,copy)}</span>
                {assignment.serviceVisitId ? <Link className="mini-button" href={`/employee/visits/${assignment.serviceVisitId}`}>{copy.openWork}</Link> : null}
              </div>
            </li>
          ))}
          {openAssignments.length === 0 ? <li className="list-row"><span className="muted">{copy.noWork}</span></li> : null}
        </ul>
      </section>

      <section id="quick-actions" className="grid section-actions">
        {employeeDashboard && signedInWorker ? <EmployeeBalanceEntryForm submitLabel={copy.submitBalance} pendingLabel={language === "es" ? "Guardando..." : "Saving..."} offlineMessage={copy.offlineRetry}>
          <input name="moneyLocale" type="hidden" value={language} />
          <h2><DollarSignIcon /> {copy.addBalanceEntry}</h2>
          <p className="muted">{copy.addBalanceBody}</p>
          <EmployeeModeFields employeeMode worker={signedInWorker} copy={copy} />
          <select name="entryKind" defaultValue="cash_advance">
            <option value="cash_advance">{copy.cashAdvance}</option>
            <option value="personal_purchase">{copy.personalPurchase}</option>
            <option value="gift">{copy.gift}</option>
            <option value="business_expense">{copy.businessExpense}</option>
            <option value="reimbursement">{copy.reimbursement}</option>
            <option value="loss_damage">{copy.lossDamage}</option>
          </select>
          <div className="two-col"><input name="amount" inputMode="decimal" placeholder={copy.amount} required /><input name="advancedAt" type="date" /></div>
          <input name="currency" defaultValue="USD" maxLength={3} aria-label={copy.currency} />
          <select name="paymentMethod" defaultValue="cash"><option value="cash">{copy.cash}</option><option value="check">{copy.check}</option><option value="bank_transfer">{copy.bankTransfer}</option><option value="payroll">{copy.payrollAdvance}</option><option value="other">{copy.other}</option></select>
          <textarea name="purpose" placeholder={copy.balanceReason} required />
          <textarea name="repaymentTerms" placeholder={copy.proposedTerms} />
          <label>{copy.receiptEvidence}<input name="receiptPhoto" type="file" accept="image/*,application/pdf" capture="environment" /></label>
          <input name="receiptUrl" type="url" placeholder={copy.evidenceLink} />
        </EmployeeBalanceEntryForm> : null}

        {!employeeDashboard ? <EmployeeTimeClockForm
          submitAction={createClockInAction}
          idleLabel={copy.punchInButton}
          pendingLabel={language === "es" ? "Guardando..." : "Saving..."}
        >
          <h2><Clock size={18} /> {copy.punchIn}</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} copy={copy} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} copy={copy} />}
          <AssignmentSelect assignments={dashboard.assignments} copy={copy} />
          <input name="clockInLocation" placeholder={copy.startLocation} />
          <textarea name="notes" rows={2} placeholder={copy.startNote} />
          <label className="checkbox-row"><input name="gpsVerified" type="checkbox" /><span>{copy.locationChecked}</span></label>
        </EmployeeTimeClockForm> : null}

        <form action={createMileageAction} className="panel form-stack span-6">
          <h2><Route size={18} /> {copy.logMiles}</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} copy={copy} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} copy={copy} />}
          <AssignmentSelect assignments={dashboard.assignments} copy={copy} />
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
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} copy={copy} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} copy={copy} />}
          <AssignmentSelect assignments={dashboard.assignments} copy={copy} />
          <input name="vendor" placeholder={copy.vendor} />
          <div className="two-col">
            <input name="amount" inputMode="decimal" placeholder={copy.amount} />
            <input name="tax" inputMode="decimal" placeholder={copy.tax} />
          </div>
          <input name="category" placeholder={copy.category} />
          <label>
            {copy.receiptPhoto}
            <input name="receiptPhoto" type="file" accept="image/*,application/pdf" capture="environment" />
            <span className="field-help">{copy.receiptPhotoHelp}</span>
          </label>
          <input name="receiptUrl" type="url" placeholder={copy.optionalReceiptLink} />
          <label className="check-row">
            <input name="extractReceipt" type="checkbox" />
            {copy.draftReceiptDetails}
          </label>
          <input name="assignTo" type="hidden" value="job" />
          <select name="reimbursementStatus" defaultValue="submitted">
            <option value="submitted">{copy.needsPaidBack}</option>
            <option value="not_reimbursable">{copy.companyCard}</option>
          </select>
          <textarea name="aiSummary" rows={2} placeholder={copy.officeNote} />
          <button className="button" type="submit" disabled={employeeMode && !signedInWorker}>{copy.saveCost}</button>
        </form>

        <form action={createFieldMediaAction} className="panel form-stack span-6">
          <h2><Camera size={18} /> {copy.uploadProof}</h2>
          <EmployeeModeFields employeeMode={employeeMode} worker={signedInWorker} copy={copy} />
          {employeeMode ? null : <WorkerSelect workers={dashboard.workers} copy={copy} />}
          <AssignmentSelect assignments={dashboard.assignments} copy={copy} />
          <select name="mediaType" defaultValue="photo">
            <option value="photo">{copy.photo}</option>
            <option value="video">{copy.video}</option>
            <option value="document">{copy.document}</option>
            <option value="receipt">{copy.costProof}</option>
          </select>
          <input name="title" placeholder={copy.proofTitle} required />
          <label>
            {copy.mediaFile}
            <input name="mediaFile" type="file" accept="image/*,video/mp4,video/quicktime,video/webm,application/pdf" capture="environment" />
            <span className="field-help">{copy.mediaFileHelp}</span>
          </label>
          {showOwnerLinks ? <input name="fileUrl" type="url" placeholder={copy.optionalProofLink} /> : null}
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
          {showOwnerLinks ? <Link className="mini-button" href="/app/notifications">{copy.reminders}</Link> : null}
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
    completeTask: "Mark done", reopenTask: "Reopen",
    startNote: "Anything the office should know?", locationChecked: "Location checked", punchInButton: "Punch in",
    punchOut: "Punch Out", punchedIn: "You punched in", endLocation: "Where are you finishing?",
    breakMinutes: "Unpaid break minutes", workPerformed: "What did you complete today?", punchOutButton: "Punch out",
    hoursAndWork: "Hours, location, and work performed", hoursAndWorkBody: "Your recent work record stays visible before payroll review.",
    hours: "hours", location: "Location", work: "Work", noHours: "No time records yet.", advances: "Money advanced",
    advancesBody: "Review money the company recorded as advanced to you. This does not authorize an automatic wage deduction.",
    acknowledge: "Looks correct", dispute: "Report a problem", disputeReason: "What is wrong with this record?", noAdvances: "No advances recorded.",
    grossEstimate: "USD straight-time gross estimate", confirmedAllocations: "Confirmed USD pay allocations", netEstimate: "Proposed USD take-home estimate", outstandingBalance: "Authorized USD amount still owed",
    todayHours: "Hours today", onBreak: "You are on break", workingNowStatus: "You are clocked in", clockedOutStatus: "You are clocked out", startBreak: "Start break", endBreak: "End break", startBreakBody: "Start a persisted break timer.", endBreakBody: "End your break and return to paid work time.",
    offlineRetry: "Could not connect. Nothing was saved; reconnect and try again.",
    addBalanceShortcut: "Add advance or purchase",
    payPreviewNotice: "Preview only. This straight-time estimate excludes overtime adjustments, taxes, and other payroll rules. Hours, rates, and gross records are not changed here. Ferocity does not run payroll or deduct money automatically.",
    managerReview: "Manager review", authorization: "Worker authorization", recovered: "Repaid or allocated", outstanding: "Outstanding", terms: "Proposed terms", viewEvidence: "View evidence",
    authorizationEvidence: "Write the amount, repayment terms, and date you authorize. This is separate from confirming hours or a receipt.", authorizeTerms: "Authorize these repayment terms",
    addBalanceEntry: "Add advance or purchase record", addBalanceBody: "Submit money advanced or an item purchased. Gifts, business expenses, reimbursements, and loss/damage records do not default to worker debt.",
    cashAdvance: "Personal cash advance", personalPurchase: "Personal purchase for me", gift: "Gift - not debt", businessExpense: "Employer business expense - not debt", reimbursement: "Reimbursement owed to me - not debt", lossDamage: "Loss or damage record - review only",
    currency: "Currency", cash: "Cash", check: "Check", bankTransfer: "Bank transfer", payrollAdvance: "Payroll advance", other: "Other", balanceReason: "Reason and what was provided", proposedTerms: "Proposed repayment terms (not a deduction authorization)", receiptEvidence: "Receipt or agreement evidence", evidenceLink: "Optional evidence link", submitBalance: "Submit for review",
    logMiles: "Log Miles", vehicle: "Truck, van, or trailer", start: "Start", end: "End", miles: "Miles", saveMiles: "Save miles",
    addCost: "Add Field Cost", costBody: "Photograph the receipt so the office can review job cost, reimbursement, tax category, and profit records.",
    vendor: "Store or vendor", amount: "Amount", tax: "Tax", category: "Materials, fuel, tools", officeNote: "Short note for the office", saveCost: "Save cost",
    uploadProof: "Upload Proof", proofTitle: "Before photo, completed work, delivery proof", whatShows: "What does this show?", saveProof: "Save proof",
    fieldNotes: "Field Notes", fieldNotesBody: "Keep the office current with job notes, receipts, mileage, and proof while you work.",
    receiptPhoto: "Receipt photo", receiptPhotoHelp: "On a phone, this can open the camera. The office reviews it before approval.", optionalReceiptLink: "Optional receipt or proof link", draftReceiptDetails: "Draft cost details from the receipt", needsPaidBack: "Needs paid back", companyCard: "Company card / no payback",
    photo: "Photo", video: "Video", document: "Document", costProof: "Cost proof", mediaFile: "Photo, video, or document", mediaFileHelp: "On a phone, this can open the camera. Files are stored privately and sent to the office for review.", optionalProofLink: "Optional existing proof link", reminders: "Reminders",
    employeeNotLinked: "Employee profile not linked", whoDoing: "Who is doing this?", whichJob: "Which job?", statusScheduled: "Scheduled", statusInProgress: "In progress", statusBlocked: "Blocked", statusMissed: "Missed", statusCompleted: "Completed"
  },
  es: {
    grossEstimate: "Estimación bruta en USD a tiempo regular", confirmedAllocations: "Asignaciones de pago en USD confirmadas", netEstimate: "Estimación propuesta de pago neto en USD", outstandingBalance: "Monto autorizado en USD aún pendiente",
    todayHours: "Horas de hoy", onBreak: "Está en descanso", workingNowStatus: "Tiene la entrada marcada", clockedOutStatus: "Tiene la salida marcada", startBreak: "Iniciar descanso", endBreak: "Terminar descanso", startBreakBody: "Inicie un temporizador de descanso guardado.", endBreakBody: "Termine el descanso y vuelva al tiempo de trabajo pagado.",
    offlineRetry: "No se pudo conectar. No se guardó nada; vuelva a conectarse e inténtelo de nuevo.",
    addBalanceShortcut: "Agregar adelanto o compra",
    payPreviewNotice: "Solo es una vista previa. Esta estimación a tiempo regular excluye ajustes por horas extra, impuestos y otras reglas de nómina. Aquí no se cambian las horas, tarifas ni registros brutos. Ferocity no ejecuta la nómina ni descuenta dinero automáticamente.",
    managerReview: "Revisión del gerente", authorization: "Autorización del trabajador", recovered: "Reembolsado o asignado", outstanding: "Pendiente", terms: "Términos propuestos", viewEvidence: "Ver comprobante",
    authorizationEvidence: "Escriba el monto, los términos de pago y la fecha que autoriza. Esto es independiente de confirmar horas o un recibo.", authorizeTerms: "Autorizar estos términos de pago",
    addBalanceEntry: "Agregar adelanto o compra", addBalanceBody: "Registre dinero adelantado o un artículo comprado. Los regalos, gastos de la empresa, reembolsos y registros de pérdida o daño no se consideran deuda del trabajador automáticamente.",
    cashAdvance: "Adelanto personal en efectivo", personalPurchase: "Compra personal para mí", gift: "Regalo - no es deuda", businessExpense: "Gasto de la empresa - no es deuda", reimbursement: "Reembolso que se me debe - no es deuda", lossDamage: "Registro de pérdida o daño - solo revisión",
    currency: "Moneda", cash: "Efectivo", check: "Cheque", bankTransfer: "Transferencia bancaria", payrollAdvance: "Adelanto de nómina", other: "Otro", balanceReason: "Motivo y lo que se entregó", proposedTerms: "Términos de pago propuestos (no es una autorización de descuento)", receiptEvidence: "Comprobante o acuerdo", evidenceLink: "Enlace opcional al comprobante", submitBalance: "Enviar para revisión",
    eyebrow: "Equipo de campo", title: "Trabajo de hoy",
    description: "Vea su horario, registre horas y ubicación, anote lo que completó y envíe registros del campo a la oficina.",
    linkTitle: "Su perfil de campo necesita conectarse.",
    linkBody: "Pida una invitación privada a un usuario autorizado de la empresa. Los dueños y gerentes también pueden crear su propio perfil de campo. El enlace conecta únicamente su membresía y registro de trabajador.",
    language: "Idioma", saveLanguage: "Guardar", workingNow: "Trabajando ahora", scheduledToday: "Programado hoy",
    openAssignments: "Trabajos abiertos", needsReview: "Por revisar", workList: "Lista de trabajo",
    workListBody: "Sus trabajos, horario y acciones de campo están juntos en un solo lugar.", openWork: "Abrir trabajo",
    noWork: "Todavía no hay trabajo asignado.", punchIn: "Marcar entrada", startLocation: "¿Dónde empieza?",
    completeTask: "Marcar terminada", reopenTask: "Reabrir",
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
    fieldNotes: "Notas de campo", fieldNotesBody: "Mantenga informada a la oficina con notas, recibos, millas y comprobantes mientras trabaja.",
    receiptPhoto: "Foto del recibo", receiptPhotoHelp: "En un teléfono, esto puede abrir la cámara. La oficina lo revisa antes de aprobarlo.", optionalReceiptLink: "Enlace opcional al recibo o comprobante", draftReceiptDetails: "Preparar los detalles del gasto a partir del recibo", needsPaidBack: "Reembolso pendiente", companyCard: "Tarjeta de la empresa / sin reembolso",
    photo: "Foto", video: "Video", document: "Documento", costProof: "Comprobante de gasto", mediaFile: "Foto, video o documento", mediaFileHelp: "En un teléfono, esto puede abrir la cámara. Los archivos se guardan de forma privada y se envían a la oficina para revisión.", optionalProofLink: "Enlace opcional a un comprobante existente", reminders: "Recordatorios",
    employeeNotLinked: "El perfil del trabajador no está conectado", whoDoing: "¿Quién realiza esto?", whichJob: "¿Qué trabajo?", statusScheduled: "Programado", statusInProgress: "En curso", statusBlocked: "Bloqueado", statusMissed: "No realizado", statusCompleted: "Completado"
  }
} as const;

function EmployeeModeFields({
  employeeMode,
  worker,
  copy
}: {
  employeeMode: boolean;
  worker: { id: string; name: string; trade: string } | null;
  copy: typeof employeeCopy.en | typeof employeeCopy.es;
}) {
  if (!employeeMode) return null;
  return (
    <>
      <input name="employeeMode" type="hidden" value="1" />
      <input name="workerId" type="hidden" value={worker?.id ?? ""} />
      <p className="muted">{worker ? `${worker.name} / ${worker.trade}` : copy.employeeNotLinked}</p>
    </>
  );
}

function WorkerSelect({ workers,copy }: { workers: { id: string; name: string; trade: string }[];copy: typeof employeeCopy.en | typeof employeeCopy.es }) {
  return (
    <select name="workerId" defaultValue="">
      <option value="">{copy.whoDoing}</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>{worker.name} / {worker.trade}</option>
      ))}
    </select>
  );
}

function AssignmentSelect({ assignments,copy }: { assignments: { id: string; title: string; jobsite: string }[];copy: typeof employeeCopy.en | typeof employeeCopy.es }) {
  return (
    <select name="assignmentId" defaultValue="">
      <option value="">{copy.whichJob}</option>
      {assignments.map((assignment) => (
        <option key={assignment.id} value={assignment.id}>{assignment.title} / {assignment.jobsite}</option>
      ))}
    </select>
  );
}

function assignmentStatusLabel(status: string,copy: typeof employeeCopy.en | typeof employeeCopy.es) {
  const labels: Record<string,string> = {
    scheduled: copy.statusScheduled,in_progress: copy.statusInProgress,blocked: copy.statusBlocked,
    missed: copy.statusMissed,completed: copy.statusCompleted
  };
  return labels[status] ?? status.replaceAll("_"," ");
}

function balanceEntryKindLabel(entryKind: string, copy: typeof employeeCopy.en | typeof employeeCopy.es) {
  const labels: Record<string, string> = {
    cash_advance: copy.cashAdvance,
    personal_purchase: copy.personalPurchase,
    gift: copy.gift,
    business_expense: copy.businessExpense,
    reimbursement: copy.reimbursement,
    loss_damage: copy.lossDamage
  };
  return labels[entryKind] ?? entryKind;
}

function paymentMethodLabel(method: string, copy: typeof employeeCopy.en | typeof employeeCopy.es) {
  const labels: Record<string, string> = {
    cash: copy.cash,
    check: copy.check,
    bank_transfer: copy.bankTransfer,
    payroll: copy.payrollAdvance,
    other: copy.other
  };
  return labels[method] ?? method;
}

function balanceStatusLabel(status: string, language: "en" | "es") {
  const labels = language === "es"
    ? {
        recorded: "Registrado",
        acknowledged: "Confirmado",
        disputed: "En disputa",
        partially_recovered: "Recuperado parcialmente",
        recovered: "Recuperado",
        void: "Anulado",
        pending: "Pendiente",
        approved: "Aprobado",
        rejected: "Rechazado",
        reversed: "Revertido",
        authorized: "Autorizado",
        declined: "No autorizado"
      }
    : {
        recorded: "Recorded",
        acknowledged: "Acknowledged",
        disputed: "Disputed",
        partially_recovered: "Partially recovered",
        recovered: "Recovered",
        void: "Voided",
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected",
        reversed: "Reversed",
        authorized: "Authorized",
        declined: "Not authorized"
      };
  return labels[status as keyof typeof labels] ?? status;
}

function safeEvidenceHref(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel metric span-3">
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
      <span>{label}</span>
    </section>
  );
}
