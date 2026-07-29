"use client";

import { useActionState, useEffect, useRef } from "react";
import { TrendingUp } from "lucide-react";
import { runRevenueGrowthScanWithStateAction } from "./actions";

export function RevenueScanForm() {
  const [state, action, pending] = useActionState(runRevenueGrowthScanWithStateAction, {
    ok: false,
    message: "",
    recommendations: 0,
    scoredLeads: 0,
    conversionEvents: 0
  });
  const feedbackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.message) feedbackRef.current?.focus();
  }, [state.message]);

  return (
    <form action={action} className="form-stack compact-actions">
      <button className="button" type="submit" disabled={pending} aria-busy={pending}>
        <TrendingUp size={16} /> {pending ? "Finding missed money..." : "Find Missed Money"}
      </button>
      {state.message ? (
        <div
          ref={feedbackRef}
          className={`action-feedback ${state.ok ? "success-panel" : "error-panel"}`}
          role={state.ok ? "status" : "alert"}
          tabIndex={-1}
        >
          <strong>{state.ok ? "Scan complete" : "Scan failed"}</strong>
          <p className="muted">{state.message}</p>
        </div>
      ) : null}
    </form>
  );
}
