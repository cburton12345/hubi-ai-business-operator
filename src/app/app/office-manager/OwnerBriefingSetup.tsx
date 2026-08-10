"use client";

import { useActionState } from "react";
import {
  resendOwnerVerificationAction,
  saveOwnerBriefingSetupAction,
  verifyOwnerDestinationAction,
  type OwnerBriefingSetupState
} from "./actions";

const initialState: OwnerBriefingSetupState = { status: "idle", message: "" };

type OwnerBriefingDefaults = {
  status: string;
  destinationPreview: string | null;
  destinationVerified: boolean;
  voiceEnabled: boolean;
  smsEnabled: boolean;
  maximumCallsPerDay: number;
  timezone: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  voicemailAllowed: boolean;
  retryAllowed: boolean;
  textSummaryAfterCall: boolean;
};

function ResultMessage({ state }: { state: OwnerBriefingSetupState }) {
  if (!state.message) return null;
  return (
    <p
      aria-live="polite"
      className={`notice ${state.status === "error" ? "warning" : "success"}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.message}
    </p>
  );
}

export function OwnerBriefingSetup({ defaults }: { defaults: OwnerBriefingDefaults }) {
  const [saveState, saveAction, savePending] = useActionState(saveOwnerBriefingSetupAction, initialState);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyOwnerDestinationAction, initialState);
  const [resendState, resendAction, resendPending] = useActionState(resendOwnerVerificationAction, initialState);
  const verificationNeeded = !defaults.destinationVerified
    && (defaults.status === "pending_verification" || saveState.status === "success");

  return (
    <section className="panel section-actions">
      <div>
        <p className="eyebrow">Private owner channel</p>
        <h2>Let Ferocity brief you and take instructions</h2>
        <p className="muted">
          Choose how Ferocity should reach you when something matters. Your number is encrypted, calls and texts stay
          off until it is verified, and high-impact decisions still follow your authority rules.
        </p>
      </div>

      <form action={saveAction} className="form-stack section-actions">
        <label>
          Private phone number
          <input
            autoComplete="tel"
            inputMode="tel"
            maxLength={32}
            name="phoneNumber"
            placeholder={defaults.destinationPreview ? `Verified number ending ${defaults.destinationPreview.slice(-4)}` : "(715) 555-0123"}
            required={!defaults.destinationPreview}
            type="tel"
          />
          <small className="muted">
            {defaults.destinationPreview
              ? "Leave blank to keep the saved number. Enter a new number only when you want to replace and reverify it."
              : "Ferocity sends a six-digit code before this number can receive private business information."}
          </small>
        </label>

        <div className="grid">
          <label className="span-6 checkbox-row">
            <input defaultChecked={defaults.voiceEnabled} name="voiceEnabled" type="checkbox" />
            Call me for urgent briefings
          </label>
          <label className="span-6 checkbox-row">
            <input defaultChecked={defaults.smsEnabled} name="smsEnabled" type="checkbox" />
            Text me important updates
          </label>
        </div>

        <details>
          <summary>Timing and call preferences</summary>
          <div className="form-stack section-actions">
            <div className="grid">
              <label className="span-4">
                Maximum proactive calls per day
                <input defaultValue={defaults.maximumCallsPerDay} max={20} min={0} name="maximumProactiveCallsPerDay" type="number" />
              </label>
              <label className="span-4">
                Quiet hours start
                <input defaultValue={defaults.quietHoursStart ?? "21:00"} name="quietHoursStart" type="time" />
              </label>
              <label className="span-4">
                Quiet hours end
                <input defaultValue={defaults.quietHoursEnd ?? "07:00"} name="quietHoursEnd" type="time" />
              </label>
            </div>
            <label>
              Local timezone
              <input defaultValue={defaults.timezone} maxLength={80} name="timezone" required />
            </label>
            <div className="grid">
              <label className="span-4 checkbox-row">
                <input defaultChecked={defaults.voicemailAllowed} name="voicemailAllowed" type="checkbox" />
                Leave a voicemail
              </label>
              <label className="span-4 checkbox-row">
                <input defaultChecked={defaults.retryAllowed} name="retryAllowed" type="checkbox" />
                Retry missed calls
              </label>
              <label className="span-4 checkbox-row">
                <input defaultChecked={defaults.textSummaryAfterCall} name="textSummaryAfterCall" type="checkbox" />
                Text a recap after calls
              </label>
            </div>
          </div>
        </details>

        <button className="button" disabled={savePending} type="submit">
          {savePending ? "Saving…" : defaults.destinationVerified ? "Save briefing preferences" : "Save and verify my number"}
        </button>
        <ResultMessage state={saveState} />
      </form>

      {verificationNeeded ? (
        <div className="form-stack section-actions">
          <div>
            <h3>Enter the code Ferocity texted you</h3>
            <p className="muted">The code expires after 10 minutes and locks after five incorrect attempts.</p>
          </div>
          <form action={verifyAction} className="button-row">
            <input
              aria-label="Six-digit verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="code"
              pattern="[0-9]{6}"
              placeholder="123456"
              required
            />
            <button className="button" disabled={verifyPending} type="submit">
              {verifyPending ? "Verifying…" : "Verify number"}
            </button>
          </form>
          <ResultMessage state={verifyState} />
          <form action={resendAction}>
            <button className="button secondary-button" disabled={resendPending} type="submit">
              {resendPending ? "Sending…" : "Send a new code"}
            </button>
          </form>
          <ResultMessage state={resendState} />
        </div>
      ) : null}
    </section>
  );
}
