"use client";

import { useActionState, useEffect, useRef } from "react";
import { calculateLeadScoreWithStateAction } from "@/app/app/leads/actions";

export function LeadScoreForm({ leadId }: { leadId: string }) {
  const [state, action, pending] = useActionState(calculateLeadScoreWithStateAction, { ok: false, message: "", reasons: [] });
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
  }, [state.message]);

  return (
    <form action={action} className="form-stack">
      <input name="leadId" type="hidden" value={leadId} />
      <button className="button secondary-button" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Calculating..." : "Calculate score"}
      </button>
      {state.message ? (
        <div
          ref={feedbackRef}
          className={`action-feedback ${state.ok ? "success-panel" : "error-panel"}`}
          role={state.ok ? "status" : "alert"}
          tabIndex={-1}
        >
          <strong>{state.ok ? "Score updated" : "Score failed"}</strong>
          <p className="muted">{state.message}</p>
          {state.reasons?.length ? <p className="muted">Reasons: {state.reasons.join(", ")}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
