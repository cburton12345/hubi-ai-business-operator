"use client";

import { useActionState, type ReactNode } from "react";
import type { TimeClockActionState } from "@/app/app/operations-workforce/actions";

const initialState: TimeClockActionState = { ok: true, message: "" };

export function EmployeeTimeClockForm({
  submitAction,
  idleLabel,
  pendingLabel,
  offlineMessage = "Could not connect. Nothing was saved; reconnect and try again.",
  children
}: {
  submitAction: (formData: FormData) => Promise<TimeClockActionState>;
  idleLabel: string;
  pendingLabel: string;
  offlineMessage?: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(
    async (_previous: TimeClockActionState, formData: FormData) => {
      try {
        return await submitAction(formData);
      } catch {
        return { ok: false,message: offlineMessage };
      }
    },
    initialState
  );

  return (
    <form action={formAction} className="panel form-stack span-6">
      {children}
      <button className="button" type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? pendingLabel : idleLabel}
      </button>
      {state.message ? (
        <p className={state.ok ? "notice success" : "notice warning"} role="status" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
