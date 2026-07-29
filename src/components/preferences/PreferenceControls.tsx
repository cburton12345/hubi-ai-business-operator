"use client";

import type {
  CommunicationApprovalLevel,
  CommunicationFallbackMode,
  CommunicationMethod
} from "@/lib/preferences/communication-catalog";
import { communicationMethodLabels, communicationMethods } from "@/lib/preferences/communication-catalog";

export function ProviderStatusBadge({ label, ready = true }: { label: string; ready?: boolean }) {
  return <span className={`pill ${ready ? "" : "warning-pill"}`}>{ready ? label : `${label} unavailable`}</span>;
}

export function SaveScopeSelector() {
  return (
    <fieldset>
      <legend>Remember this choice</legend>
      <label><input defaultChecked name="saveScope" type="radio" value="one_time" /> This time only</label>
      <label><input name="saveScope" type="radio" value="workflow" /> This workflow</label>
      <label><input name="saveScope" type="radio" value="contact" /> This contact</label>
      <label><input name="saveScope" type="radio" value="user" /> My default</label>
      <label><input name="saveScope" type="radio" value="organization" /> Organization-wide</label>
    </fieldset>
  );
}

export function ApprovalSelector({ defaultValue }: { defaultValue: CommunicationApprovalLevel }) {
  return (
    <label>
      Approval
      <select name="approvalLevel" defaultValue={defaultValue}>
        <option value="no_approval">No approval</option>
        <option value="review_before_sending">Review before sending</option>
        <option value="low_confidence_only">Only when confidence is low</option>
        <option value="always_require_approval">Always require approval</option>
      </select>
    </label>
  );
}

export function FallbackChooser(props: {
  defaultMode: CommunicationFallbackMode;
  defaultMethods: CommunicationMethod[];
}) {
  return (
    <>
      <label>
        If unavailable
        <select name="fallbackMode" defaultValue={props.defaultMode}>
          <option value="ask">Offer alternatives</option>
          <option value="automatic">Use approved fallback automatically</option>
          <option value="none">Stop and explain</option>
        </select>
      </label>
      <label>
        Preferred fallback
        <select name="fallbackMethod" defaultValue={props.defaultMethods[0] ?? "native_sms"}>
          {communicationMethods.filter((method) => method !== "skip").map((method) => (
            <option key={method} value={method}>{communicationMethodLabels[method]}</option>
          ))}
        </select>
      </label>
    </>
  );
}
