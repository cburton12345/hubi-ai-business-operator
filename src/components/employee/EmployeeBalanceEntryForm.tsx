"use client";

import { useActionState,type ReactNode } from "react";
import { confirmWorkerPayAllocationAction,createEmployeeCashAdvanceAction,recordWorkerBalanceRepaymentAction,type TimeClockActionState } from "@/app/app/operations-workforce/actions";

const initialState: TimeClockActionState = { ok: true,message: "" };

export function EmployeeBalanceEntryForm({ children,submitLabel,pendingLabel,offlineMessage }: {
  children: ReactNode;submitLabel: string;pendingLabel: string;offlineMessage: string;
}) {
  const [state,action,pending] = useActionState(async (_previous: TimeClockActionState,formData: FormData) => {
    try { return await createEmployeeCashAdvanceAction(formData); }
    catch { return { ok: false,message: offlineMessage }; }
  },initialState);
  return <form id="worker-balance-entry" action={action} className="panel form-stack span-6">
    {children}
    <button className="button" type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</button>
    {state.message ? <p className={state.ok ? "notice success" : "notice warning"} role="status" aria-live="polite">{state.message}</p> : null}
  </form>;
}

export function WorkerLedgerMutationForm({ children,kind,disabled=false }: { children: ReactNode;kind: "repayment" | "allocation";disabled?: boolean }) {
  const [state,action,pending] = useActionState(async (_previous: TimeClockActionState,formData: FormData) => {
    try {
      return kind === "repayment"
        ? await recordWorkerBalanceRepaymentAction(formData)
        : await confirmWorkerPayAllocationAction(formData);
    } catch {
      return { ok: false,message: "Connection lost. The result may be unknown; reconnect and check the ledger before retrying." };
    }
  },initialState);
  return <form action={action} className="form-stack">
    {children}
    <button className="mini-button secondary-button" type="submit" disabled={pending || disabled}>{pending ? "Saving..." : kind === "repayment" ? "Record repayment" : "Confirm allocation preview"}</button>
    {state.message ? <p className={state.ok ? "notice success" : "notice warning"} role="status" aria-live="polite">{state.message}</p> : null}
  </form>;
}
