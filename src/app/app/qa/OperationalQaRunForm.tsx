"use client";

import { useActionState, useEffect, useRef } from "react";
import { runOperationalQaWithStateAction } from "./actions";

export function OperationalQaRunForm() {
  const [state, action, pending] = useActionState(runOperationalQaWithStateAction, { ok: false, message: "", checks: 0, failed: 0 });
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
  }, [state.message]);

  return (
    <form action={action} className="form-stack">
      <button className="button" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Running QA..." : "Run operational QA"}
      </button>
      {state.message ? (
        <div
          ref={feedbackRef}
          className={`action-feedback ${state.ok ? "success-panel" : "error-panel"}`}
          role={state.ok ? "status" : "alert"}
          tabIndex={-1}
        >
          <strong>{state.ok ? "QA run saved" : "QA failed"}</strong>
          <p className="muted">{state.message}</p>
          {typeof state.checks === "number" ? <p className="muted">{state.checks} checks run / {state.failed ?? 0} failed.</p> : null}
        </div>
      ) : null}
    </form>
  );
}
