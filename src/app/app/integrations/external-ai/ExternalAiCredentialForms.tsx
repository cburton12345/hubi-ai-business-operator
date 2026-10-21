"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PendingSubmitButton } from "@/components/forms/PendingSubmitButton";
import { EXTERNAL_AI_CONSENT_SUMMARY, EXTERNAL_AI_PROTECTED_BOUNDARIES } from "@/lib/mcp/consent-policy";
import {
  createExternalAiCredentialAction,
  rotateExternalAiCredentialAction,
  testExternalAiTokenAction,
} from "./actions";
import type { ExternalAiCredentialActionState, ExternalAiTestState } from "./actions";

const initialState: ExternalAiCredentialActionState = { ok: false, message: "" };

const testInitialState: ExternalAiTestState = { ok: false, message: "" };

function ConnectionTest({ token }: { token: string }) {
  const [state, action, pending] = useActionState(testExternalAiTokenAction, testInitialState);
  return (
    <form action={action} className="form-stack">
      <input type="hidden" name="token" value={token} />
      <PendingSubmitButton className="button secondary-button" pendingLabel="Testing read-only access…" disabled={pending}>
        Test connection safely
      </PendingSubmitButton>
      {state.message ? <p className={state.ok ? "success-text" : "error-text"} role="status">{state.message}</p> : null}
    </form>
  );
}

function OneTimeToken({ token, message, providerKey }: { token?: string; message: string; providerKey?: string }) {
  if (!message) return null;
  return (
    <div className={`notice ${token ? "success-notice" : "warning-notice"}`} role="status">
      <strong>{message}</strong>
      {token ? (
        <div className="form-stack">
          <label>
            One-time bearer token
            <textarea aria-label="One-time bearer token" readOnly rows={3} value={token} onFocus={(event) => event.currentTarget.select()} />
            <span className="muted">Store this directly in the approved assistant&apos;s encrypted connection settings. It is not retained by Ferocity and disappears when this page changes.</span>
          </label>
          <div className="panel subtle-panel form-stack">
            <strong>{providerKey === "muse" ? "Connect Muse" : "Connect another MCP assistant"}</strong>
            <ol>
              <li>Add a Streamable HTTP MCP connection.</li>
              <li>Use <code>https://api.ferocity.live/mcp</code> as the server URL.</li>
              <li>Set <code>Authorization: Bearer &lt;this token&gt;</code>.</li>
              <li>Run the read-only test below, then test from the assistant before using write scopes.</li>
            </ol>
            <ConnectionTest token={token} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function CreateExternalAiCredentialForm() {
  const [state, action, pending] = useActionState(createExternalAiCredentialAction, initialState);
  return (
    <div className="form-stack section-actions">
    <form action={action} className="form-stack section-actions">
      <div className="two-col">
        <label>
          Connection name
          <input name="label" placeholder="Muse for owner operations" required minLength={2} maxLength={180} />
        </label>
        <label>
          Assistant
          <select name="providerKey" defaultValue="muse">
            <option value="muse">Muse</option>
            <option value="generic_mcp">Other MCP assistant</option>
          </select>
        </label>
        <label>
          Expires after
          <select name="expirationDays" defaultValue="90">
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
        <label>
          Requests per day
          <input name="dailyRequestLimit" type="number" min={25} max={10000} defaultValue={500} />
        </label>
        <label>
          Records returned per day
          <input name="dailyRecordLimit" type="number" min={100} max={100000} defaultValue={2500} />
        </label>
      </div>
      <fieldset className="panel subtle-panel form-stack">
        <legend>Step 1 — choose exactly what this assistant can do</legend>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="business:read" defaultChecked />Read the business summary</label>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="customers:read" defaultChecked />Read minimized customer history</label>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="jobs:read" defaultChecked />Read job status</label>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="invoices:read" defaultChecked />Read invoice balances and status</label>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="commitments:read" defaultChecked />Read Ferocity tasks</label>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="workflows:read" defaultChecked />Poll durable work status</label>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="commitments:write" />Create and update internal tasks</label>
        <label className="checkbox-row"><input type="checkbox" name="scopes" value="workflows:write" />Start observe/prepare workflows</label>
      </fieldset>
      <div className="panel subtle-panel form-stack">
        <strong>Step 2 — review the boundary</strong>
        <p><strong>Read access:</strong> business summary, minimized customers, jobs, invoice totals, tasks, and job status only when selected.</p>
        <p><strong>Controlled write access:</strong> internal tasks and prepare/observe workflows only when selected. These tools cannot publish, message customers, move money, buy ads, or bypass approvals.</p>
        <p><strong>Usage ceiling:</strong> requests and returned records stop at the daily limits above. Unexpected bursts create an owner-attention event.</p>
      </div>
      <p className="muted">Financial, legal, external communication, publishing, advertising spend, destructive actions, and money movement are not granted by these scopes.</p>
      <div className="notice warning-notice">
        <strong>What leaves Ferocity</strong>
        <ul>
          {EXTERNAL_AI_PROTECTED_BOUNDARIES.map((boundary) => <li key={boundary}>{boundary}</li>)}
        </ul>
      </div>
      <label className="checkbox-row">
        <input type="checkbox" name="consentAcknowledged" value="yes" required />
        <span>{EXTERNAL_AI_CONSENT_SUMMARY} See the <Link href="/privacy" target="_blank">Privacy Policy</Link>.</span>
      </label>
      <PendingSubmitButton pendingLabel="Creating secure credential…" disabled={pending}>Step 3 — create one-time credential</PendingSubmitButton>
    </form>
    <OneTimeToken token={state.token} message={state.message} providerKey={state.providerKey} />
    </div>
  );
}

export function RotateExternalAiCredentialForm({ credentialId }: { credentialId: string }) {
  const [state, action, pending] = useActionState(rotateExternalAiCredentialAction, initialState);
  return (
    <div className="form-stack">
    <form action={action} className="form-stack">
      <input type="hidden" name="credentialId" value={credentialId} />
      <PendingSubmitButton className="button secondary-button" pendingLabel="Rotating…" disabled={pending}>Rotate token</PendingSubmitButton>
    </form>
    <OneTimeToken token={state.token} message={state.message} providerKey={state.providerKey} />
    </div>
  );
}
