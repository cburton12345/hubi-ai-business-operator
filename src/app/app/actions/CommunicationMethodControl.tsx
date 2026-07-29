"use client";

import { useActionState, useState } from "react";
import {
  completeCommunicationPreference,
  communicationMethodLabels,
  communicationMethods,
  type CommunicationMethod,
  type CommunicationMethodPreference
} from "@/lib/preferences/communication-catalog";
import {
  ApprovalSelector,
  FallbackChooser,
  ProviderStatusBadge,
  SaveScopeSelector
} from "@/components/preferences/PreferenceControls";
import { browserAssistedMessagingProvider } from "@/lib/communication/assisted-messaging-provider";
import {
  updateCommunicationMethodAction,
  type CommunicationMethodActionState
} from "./actions";

const initialState: CommunicationMethodActionState = { ok: false, message: "" };

function sourceLabel(value: string) {
  const labels: Record<string, string> = {
    organization: "Business default",
    workflow: "Workflow default",
    contact: "Contact preference",
    customer: "Customer preference",
    user: "My default",
    "this action": "This action"
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export function CommunicationMethodControl(props: {
  actionId: string;
  currentMethod: CommunicationMethod;
  preference?: CommunicationMethodPreference;
  resolvedScope: string;
  subject: string;
  body: string;
  phone: string | null;
  email: string | null;
}) {
  const [state, formAction, pending] = useActionState(updateCommunicationMethodAction, initialState);
  const [method, setMethod] = useState<CommunicationMethod>(props.currentMethod);
  const [changing, setChanging] = useState(false);
  const current = state.ok && state.method ? state.method : method;
  const preference = completeCommunicationPreference({ ...props.preference, method: current });

  async function copyMessage(openGoogleVoice = false) {
    await navigator.clipboard.writeText(browserAssistedMessagingProvider.copyMessage(props.body));
    if (openGoogleVoice) window.open(browserAssistedMessagingProvider.openGoogleVoice(), "_blank", "noopener,noreferrer");
  }

  return (
    <section className="communication-method-control" aria-label={`Communication method for ${props.subject}`}>
      <div className="inline-actions">
        <span className="muted">Current method:</span>
        <strong>{communicationMethodLabels[current]}</strong>
        <ProviderStatusBadge label={sourceLabel(props.resolvedScope)} />
        <button className="mini-button secondary-button" type="button" onClick={() => setChanging((value) => !value)}>
          {changing ? "Close" : "Change"}
        </button>
      </div>

      {changing ? (
        <form action={formAction} className="form-stack compact-form section-actions">
          <input name="actionId" type="hidden" value={props.actionId} />
          <label>
            Method
            <select name="method" value={method} onChange={(event) => setMethod(event.target.value as CommunicationMethod)}>
              {communicationMethods.map((value) => (
                <option key={value} value={value}>{communicationMethodLabels[value]}</option>
              ))}
            </select>
          </label>
          <SaveScopeSelector />
          <details>
            <summary>Advanced</summary>
            <div className="form-grid two section-actions">
              <label>
                Execution
                <select name="executionMode" defaultValue={preference.executionMode}>
                  <option value="automatic">Automatic</option>
                  <option value="user_confirmation">Ask before acting</option>
                  <option value="open_native_app">Open the selected app</option>
                  <option value="copy_only">Copy only</option>
                  <option value="human_action">Human completes it</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
              <ApprovalSelector defaultValue={preference.approvalLevel} />
              <label>
                Provider choice
                <select name="providerPreference" defaultValue={preference.providerPreference}>
                  <option value="best_available">Best available</option>
                  <option value="organization_default">Organization default</option>
                  <option value="user_default">My default</option>
                  <option value="workflow_provider">Workflow provider</option>
                  <option value="contact_provider">Contact preference</option>
                  <option value="manual_assisted">Manual or assisted</option>
                </select>
              </label>
              <label>
                Language
                <select name="languageMode" defaultValue={preference.languageMode}>
                  <option value="contact_preference">Contact preference</option>
                  <option value="auto_detect">Detect automatically</option>
                  <option value="organization_default">Organization default</option>
                  <option value="selected">Choose a language</option>
                </select>
              </label>
              <FallbackChooser defaultMode={preference.fallbackMode} defaultMethods={preference.fallbackMethods} />
            </div>
          </details>
          <button className="mini-button" disabled={pending} type="submit">
            {pending ? "Saving…" : "Use this method"}
          </button>
          {state.message ? <p className={state.ok ? "success-text" : "danger-text"} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
        </form>
      ) : null}

      <div className="inline-actions section-actions">
        {current === "native_sms" && props.phone ? <a className="mini-button" href={browserAssistedMessagingProvider.openNativeSMS(props.phone, props.body)}>Continue in SMS app</a> : null}
        {current === "google_voice" ? <button className="mini-button" type="button" onClick={() => copyMessage(true)}>Copy and open Google Voice</button> : null}
        {current === "copy_message" ? <button className="mini-button" type="button" onClick={() => copyMessage(false)}>Copy message</button> : null}
        {current === "email" && props.email ? <a className="mini-button" href={browserAssistedMessagingProvider.openEmailDraft(props.email, props.subject, props.body)}>Continue in email</a> : null}
        {current === "human_call" && props.phone ? <a className="mini-button" href={browserAssistedMessagingProvider.openDialer(props.phone)}>Call now</a> : null}
        {current === "automatic_sms" ? <span className="muted">Approve this action when the automated SMS provider and consent are ready.</span> : null}
        {current === "ai_voice_call" ? <span className="muted">Review the call objective and approve the AI voice call.</span> : null}
        {current === "skip" ? <span className="muted">This communication is skipped.</span> : null}
      </div>
    </section>
  );
}
