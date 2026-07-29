"use client";

import { useActionState } from "react";
import { createCalendarFeedAction } from "./actions";

const initialState: { ok: boolean; url?: string; message?: string } = { ok: false };

export function CalendarFeedCreator() {
  const [state, action, pending] = useActionState(createCalendarFeedAction, initialState);

  return (
    <div className="section-actions">
      {state.url ? (
        <div className="notice">
          <strong>Copy this new private feed now</strong>
          <p className="muted">Paste this HTTPS URL into a calendar subscription screen. The raw token is not stored by Ferocity.</p>
          <div className="inline-actions">
            <input aria-label="Private calendar feed URL" readOnly value={state.url} />
            <a className="mini-button secondary-button" href={state.url}>Open .ics</a>
          </div>
        </div>
      ) : null}
      {state.message ? <p className="notice warning">{state.message}</p> : null}
      <form action={action} className="inline-actions">
        <input name="label" defaultValue="Operations schedule" maxLength={80} required />
        <button className="mini-button" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create private calendar feed"}
        </button>
      </form>
    </div>
  );
}
