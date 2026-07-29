"use client";

import { useActionState } from "react";
import {
  saveVoiceCustomizationAction,
  type VoiceCustomizationState
} from "./actions";

const initialState: VoiceCustomizationState = { status: "idle", message: "" };

export type VoiceCustomizationDefaults = {
  profileId: string;
  displayName: string;
  greeting: string;
  tone: string;
  languages: string[];
  callGoals: string[];
  customInstructions: string[];
  escalationRules: string[];
};

export function VoiceAgentCustomizationForm({ defaults }: { defaults: VoiceCustomizationDefaults }) {
  const [state, action, pending] = useActionState(saveVoiceCustomizationAction, initialState);

  return (
    <form action={action} className="form-stack section-actions">
      <input name="profileId" type="hidden" value={defaults.profileId} />
      <div className="grid">
        <label className="span-6">
          What should callers call the AI?
          <input defaultValue={defaults.displayName} maxLength={80} name="displayName" required />
        </label>
        <label className="span-6">
          Speaking style
          <input
            defaultValue={defaults.tone}
            maxLength={180}
            name="tone"
            placeholder="Warm, confident, concise, and practical"
            required
          />
        </label>
      </div>
      <label>
        Greeting
        <input defaultValue={defaults.greeting} maxLength={280} name="greeting" required />
      </label>
      <label>
        Languages
        <input
          defaultValue={defaults.languages.join(", ")}
          maxLength={400}
          name="languages"
          placeholder="English, Spanish"
        />
        <small className="muted">Separate languages with commas. Ferocity will offer a human handoff when the caller needs another language.</small>
      </label>
      <div className="grid">
        <label className="span-6">
          What should it accomplish on calls?
          <textarea
            defaultValue={defaults.callGoals.join("\n")}
            maxLength={1800}
            name="callGoals"
            placeholder={"Understand the caller's need\nCapture contact and service details\nOffer an appointment"}
            rows={6}
          />
        </label>
        <label className="span-6">
          Business-specific instructions
          <textarea
            defaultValue={defaults.customInstructions.join("\n")}
            maxLength={3000}
            name="customInstructions"
            placeholder={"Ask about the property type\nMention our workmanship warranty only when verified\nNever quote unseen work"}
            rows={6}
          />
        </label>
      </div>
      <label>
        When should it immediately bring in a person?
        <textarea
          defaultValue={defaults.escalationRules.join("\n")}
          maxLength={1800}
          name="escalationTopics"
          placeholder={"Safety emergency\nAngry caller\nPrice exception\nLow confidence"}
          rows={5}
        />
      </label>
      <p className="muted">
        Ferocity automatically adds the workspace’s industry knowledge, services, authority rules, and safety guardrails.
        These settings customize how the phone agent represents this business, regardless of the calling provider.
      </p>
      <button className="button" disabled={pending} type="submit">
        {pending ? "Saving phone agent…" : "Save phone-agent behavior"}
      </button>
      {state.message ? (
        <p
          aria-live="polite"
          className={`notice ${state.status === "error" ? "warning" : "success"}`}
          role={state.status === "error" ? "alert" : "status"}
          tabIndex={-1}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
