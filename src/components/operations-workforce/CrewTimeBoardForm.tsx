"use client";

import { useActionState,useState } from "react";
import { bulkCrewTimeAction,correctCrewTimeEntryAction,type BulkTimeActionState,type TimeClockActionState } from "@/app/app/operations-workforce/actions";

const initialBulk: BulkTimeActionState = { ok: true,message: "",applied: 0,skipped: 0,failures: [] };
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
  const [state,action,pending] = useActionState(async (previous: BulkTimeActionState,formData: FormData) => {
    try {
      return await bulkCrewTimeAction(previous,formData);
    } catch {
      return { ok: false,message: "Connection lost. Some workers may already be updated; reconnect and retry. Workers already in the requested state will be skipped safely.",applied: previous.applied,skipped: previous.skipped,failures: ["Network unavailable"] };
    }
  },initialBulk);
  return <form action={action} className="panel form-stack span-12">
    <div><h2>Crew time board</h2><p className="muted">Select one or more workers, then use one large action. Replays are skipped instead of creating duplicate shifts.</p></div>
    <div className="grid">{workers.map((worker) => <label className="panel span-3 checkbox-row" key={worker.id}>
      <input name="workerIds" type="checkbox" value={worker.id} />
      <span><strong>{worker.name}</strong><br /><span className="muted">{worker.clockStatus} / {worker.todayHours} h today</span></span>
    </label>)}</div>
    <select name="assignmentId" defaultValue=""><option value="">No shared assignment</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}</select>
    <input name="note" placeholder="Optional crew note" />
    <div className="button-row">
      <button className="button" name="intent" value="clock_in" disabled={pending}>Clock in selected</button>
      <button className="button secondary-button" name="intent" value="start_break" disabled={pending}>Start break</button>
      <button className="button secondary-button" name="intent" value="end_break" disabled={pending}>End break</button>
      <button className="button" name="intent" value="clock_out" disabled={pending}>Clock out selected</button>
    </div>
    {state.message ? <div className={state.ok ? "notice success" : "notice warning"} role="status" aria-live="polite"><strong>{state.message}</strong>{state.failures.length ? <p>{state.failures.join(", ")}</p> : null}</div> : null}
  </form>;
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
