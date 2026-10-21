"use client";

import { useActionState } from "react";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";
import { saveGrowthBaselineAction } from "./actions";

export function GrowthBaselineForm() {
  const [state, action] = useActionState(saveGrowthBaselineAction, { ok: false });
  return (
    <form action={action} className="stacked-form">
      <div className="grid">
        <label className="span-3">Baseline date<input name="baselineDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label className="span-3">Monthly revenue<input name="monthlyRevenue" inputMode="decimal" placeholder="25000" required /></label>
        <label className="span-3">Monthly leads<input name="monthlyLeads" inputMode="numeric" placeholder="40" required /></label>
        <label className="span-3">Booked jobs<input name="monthlyBookedJobs" inputMode="numeric" placeholder="12" required /></label>
        <label className="span-3">Ad spend<input name="monthlyAdSpend" inputMode="decimal" placeholder="1500" required /></label>
        <label className="span-3">Average ticket<input name="averageTicket" inputMode="decimal" placeholder="2500" required /></label>
        <label className="span-3">Close rate %<input name="closeRatePercent" inputMode="decimal" placeholder="30" required /></label>
        <label className="span-3">Review count<input name="reviewCount" inputMode="numeric" placeholder="50" required /></label>
        <label className="span-3">Review rating<input name="reviewRating" inputMode="decimal" placeholder="4.7 (optional)" /></label>
        <label className="span-3">Website sessions<input name="websiteSessions" inputMode="numeric" placeholder="1200" required /></label>
      </div>
      <label>Notes<textarea name="notes" placeholder="Where did these numbers come from?" /></label>
      {state.error ? <div className="notice danger" role="alert">{state.error}</div> : null}
      {state.message ? <div className="notice success" role="status">{state.message}</div> : null}
      <PendingSubmitButton pendingLabel="Saving baseline…">Save baseline</PendingSubmitButton>
    </form>
  );
}
