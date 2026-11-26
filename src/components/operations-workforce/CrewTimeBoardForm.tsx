"use client";

import { useActionState,useState } from "react";
import { correctCrewTimeEntryAction,type TimeClockActionState } from "@/app/app/operations-workforce/actions";
import { captureWorkforceLocation,useWorkforceQueue,type WorkforceActionType } from "@/components/employee/WorkforceQuickActions";

const initialCorrection: TimeClockActionState = { ok: true,message: "" };

function localDateTimeValue(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime()-offset*60_000).toISOString().slice(0,16);
}

export function CrewTimeBoardForm({ workers,assignments }: {
  workers: { id: string;name: string;clockStatus: string;todayHours: string }[];
  assignments: { id: string;title: string }[];
}) {
  const [selected,setSelected] = useState<string[]>([]);
  const [assignmentId,setAssignmentId] = useState("");
  const [manualLocation,setManualLocation] = useState("");
  const [workContext,setWorkContext] = useState("");
  const [busy,setBusy] = useState(false);
  const [payOpen,setPayOpen] = useState(false);
  const [payAmount,setPayAmount] = useState("");
  const [payMethod,setPayMethod] = useState<"cash" | "check" | "ach" | "card" | "payroll_provider" | "other">("ach");
  const [paymentType,setPaymentType] = useState<"payroll" | "subcontractor" | "bonus" | "reimbursement" | "draw" | "other">("payroll");
  const { submit,pendingCount,message,setMessage,syncNow } = useWorkforceQueue("en");

  async function run(type: WorkforceActionType) {
    if (!selected.length) return void setMessage("Tap at least one worker first.");
    setBusy(true);setMessage("");
    try {
      const location = await captureWorkforceLocation();
      for (const workerId of selected) await submit({ actionType: type,workerId,assignmentId: assignmentId || undefined,manualLocation,workContext,location });
      setMessage(`${selected.length} worker${selected.length === 1 ? "" : "s"} saved. Offline actions will sync automatically.`);
    } catch { setMessage("The action could not be stored on this device. Try again."); }
    finally { setBusy(false); }
  }

  async function recordPayment() {
    const amount = Number(payAmount.replace(/[$,]/g,""));
    if (!selected.length) return void setMessage("Tap the worker who was paid.");
    if (!Number.isFinite(amount) || amount <= 0) return void setMessage("Enter the amount paid.");
    setBusy(true);setMessage("");
    try {
      for (const workerId of selected) await submit({
        actionType: "worker_payment",workerId,assignmentId: assignmentId || undefined,
        manualLocation,workContext,
        payment: { amountCents: Math.round(amount * 100),method: payMethod,paymentType }
      },{ captureLocation: false });
      setPayAmount("");setPayOpen(false);setMessage("Payment recorded. It remains in the audit ledger.");
    } catch { setMessage("The payment could not be stored on this device. Try again."); }
    finally { setBusy(false); }
  }

  return <section className="panel form-stack span-12 workforce-quick-actions">
    <div className="list-row flush-row"><div><h2>Crew today</h2><p className="muted">Tap people, then tap one action. Location is captured only at that tap. No service is okay.</p></div><div className="button-row">{pendingCount ? <><span className="pill medium">{pendingCount} pending</span><button className="mini-button secondary-button" type="button" onClick={() => void syncNow()}>Sync now</button></> : <span className="pill">Synced</span>}</div></div>
    <div className="button-row"><button className="mini-button secondary-button" type="button" onClick={() => setSelected(workers.map((worker) => worker.id))}>Select all</button><button className="mini-button secondary-button" type="button" onClick={() => setSelected([])}>Clear</button><span className="muted">{selected.length} selected</span></div>
    <div className="grid">{workers.map((worker) => <label className={`panel span-3 checkbox-row ${selected.includes(worker.id) ? "selected-workforce-card" : ""}`} key={worker.id}>
      <input type="checkbox" value={worker.id} checked={selected.includes(worker.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current,worker.id] : current.filter((id) => id !== worker.id))} />
      <span><strong>{worker.name}</strong><br /><span className="muted">{worker.clockStatus} / {worker.todayHours} h today</span></span>
    </label>)}</div>
    <select value={assignmentId} onChange={(event) => setAssignmentId(event.target.value)}><option value="">No job selected</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}</select>
    <div className="two-col"><input value={manualLocation} onChange={(event) => setManualLocation(event.target.value)} maxLength={220} placeholder="Town or address for selected workers (optional)" autoComplete="street-address" /><input value={workContext} onChange={(event) => setWorkContext(event.target.value)} maxLength={220} placeholder="Other company or job (optional)" /></div>
    <p className="field-help">GPS captures when you tap an action. Enter a town or address when GPS is unavailable or the crew is working somewhere else; both values are preserved.</p>
    <div className="workforce-action-grid">
      <button className="button workforce-primary-action" type="button" disabled={busy} onClick={() => void run("clock_in")}>Start</button>
      <button className="button secondary-button" type="button" disabled={busy} onClick={() => void run("start_break")}>Break</button>
      <button className="button secondary-button" type="button" disabled={busy} onClick={() => void run("end_break")}>Resume</button>
      <button className="button" type="button" disabled={busy} onClick={() => void run("clock_out")}>Finish</button>
      <button className="button secondary-button" type="button" disabled={busy} onClick={() => setPayOpen((value) => !value)}>Mark paid</button>
    </div>
    {payOpen ? <div className="form-stack"><div className="two-col"><input value={payAmount} onChange={(event) => setPayAmount(event.target.value)} inputMode="decimal" placeholder="Amount per selected worker" /><select value={payMethod} onChange={(event) => setPayMethod(event.target.value as typeof payMethod)}><option value="ach">ACH / bank</option><option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="payroll_provider">Payroll provider</option><option value="other">Other</option></select></div><select value={paymentType} onChange={(event) => setPaymentType(event.target.value as typeof paymentType)}><option value="payroll">Wages / payroll</option><option value="subcontractor">Subcontractor payment</option><option value="reimbursement">Expense reimbursement</option><option value="bonus">Bonus</option><option value="draw">Draw</option><option value="other">Other payment</option></select><p className="field-help">This records {payAmount && Number.isFinite(Number(payAmount.replace(/[$,]/g,""))) ? `$${(Number(payAmount.replace(/[$,]/g,""))*selected.length).toFixed(2)} total across ${selected.length} selected` : `the entered amount for each of ${selected.length} selected`}. It does not move money.</p><button className="button" type="button" disabled={busy} onClick={() => void recordPayment()}>Confirm payment</button></div> : null}
    {message ? <div className="notice success" role="status" aria-live="polite"><strong>{message}</strong></div> : null}
  </section>;
}

export function TimeCorrectionForm({ entry }: {
  entry: { id: string;clockInIso: string;clockOutIso: string;breakMinutes: number };
}) {
  const [clockInOffsetMinutes,setClockInOffsetMinutes] = useState(() => new Date(entry.clockInIso).getTimezoneOffset());
  const [clockOutOffsetMinutes,setClockOutOffsetMinutes] = useState(() => new Date(entry.clockOutIso).getTimezoneOffset());
  const [clockInValue,setClockInValue] = useState(() => localDateTimeValue(entry.clockInIso));
  const [clockOutValue,setClockOutValue] = useState(() => localDateTimeValue(entry.clockOutIso));
  const [state,action,pending] = useActionState(
    async (_previous: TimeClockActionState,formData: FormData) => correctCrewTimeEntryAction(formData),
    initialCorrection
  );
  return <form action={action} className="form-stack">
    <input name="timeEntryId" type="hidden" value={entry.id} />
    <input name="clockInOffsetMinutes" type="hidden" value={clockInOffsetMinutes} />
    <input name="clockOutOffsetMinutes" type="hidden" value={clockOutOffsetMinutes} />
    <div className="two-col"><label>Clock in<input name="clockInAt" type="datetime-local" value={clockInValue} onChange={(event) => { setClockInValue(event.target.value);setClockInOffsetMinutes(new Date(event.target.value).getTimezoneOffset()); }} required /></label><label>Clock out<input name="clockOutAt" type="datetime-local" value={clockOutValue} onChange={(event) => { setClockOutValue(event.target.value);setClockOutOffsetMinutes(new Date(event.target.value).getTimezoneOffset()); }} required /></label></div>
    <input name="breakMinutes" type="number" min={0} max={1440} defaultValue={entry.breakMinutes} aria-label="Break minutes" />
    <input name="reason" placeholder="Required correction reason" required />
    <button className="mini-button secondary-button" type="submit" disabled={pending}>{pending ? "Saving..." : "Save reviewed correction"}</button>
    {state.message ? <p className={state.ok ? "notice success" : "notice warning"} role="status">{state.message}</p> : null}
  </form>;
}
