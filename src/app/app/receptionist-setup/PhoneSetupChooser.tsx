"use client";

import { useState } from "react";
import { savePhoneConnectionAction } from "./actions";
import type { PhoneConnection } from "@/lib/phone/phone-connections";

type PhonePath = PhoneConnection["connectionPath"];

const choices: Array<{
  key: PhonePath;
  title: string;
  description: string;
  detail: string;
  recommended?: boolean;
}> = [
  {
    key: "keep_number_forwarding",
    title: "Keep my current business number",
    description: "Fast setup using call forwarding.",
    detail: "Usually takes about five minutes. Your customers keep calling the same number.",
    recommended: true
  },
  {
    key: "keep_number_full",
    title: "Keep my number with full integration",
    description: "Best long-term experience.",
    detail: "Adds inbound and outbound calling, texting, transfers, routing, voicemail, and team support."
  },
  {
    key: "new_ferocity_number",
    title: "Get a new Ferocity number",
    description: "A new number for your business, a campaign, or a department.",
    detail: "Also works as a temporary number while your existing number is transferred."
  },
  {
    key: "bring_own_provider",
    title: "Advanced",
    description: "Bring your own phone provider.",
    detail: "For businesses that already manage phone infrastructure or want a specific provider."
  }
];

export function PhoneSetupChooser({ connection }: { connection: PhoneConnection | null }) {
  const [path, setPath] = useState<PhonePath>(connection?.connectionPath ?? "keep_number_forwarding");

  return (
    <form action={savePhoneConnectionAction} className="form-stack section-actions">
      <div className="phone-choice-grid">
        {choices.map((choice) => (
          <label className={`phone-choice-card ${path === choice.key ? "selected" : ""}`} key={choice.key}>
            <input
              type="radio"
              name="connectionPath"
              value={choice.key}
              checked={path === choice.key}
              onChange={() => setPath(choice.key)}
            />
            <span>
              <strong>{choice.title}</strong>
              {choice.recommended ? <span className="pill">Recommended</span> : null}
              <span>{choice.description}</span>
              <small>{choice.detail}</small>
            </span>
          </label>
        ))}
      </div>

      {path === "keep_number_forwarding" || path === "keep_number_full" ? (
        <div className="grid">
          <label className="span-6">
            Current business phone number
            <input
              name="businessNumber"
              type="tel"
              defaultValue={connection?.businessNumber ?? ""}
              placeholder="(555) 555-0123"
              required
            />
          </label>
          <label className="span-6">
            Who provides your phone service now?
            <input
              name="currentCarrier"
              defaultValue={connection?.currentCarrier ?? ""}
              placeholder="For example: Verizon, Comcast, RingCentral"
            />
          </label>
        </div>
      ) : null}

      {path === "keep_number_full" ? (
        <label>
          How does your phone work today?
          <select name="fullIntegrationMethod" defaultValue={connection?.fullIntegrationMethod ?? "number_port"}>
            <option value="number_port">It is a regular business number</option>
            <option value="cloud_phone">We use a cloud phone service</option>
            <option value="pbx">We have an office phone system</option>
            <option value="carrier_connection">I am not sure—help me choose</option>
          </select>
        </label>
      ) : null}

      {path === "new_ferocity_number" ? (
        <div className="grid">
          <label className="span-6">
            Preferred area code
            <input
              name="preferredAreaCode"
              inputMode="numeric"
              pattern="[0-9]{3}"
              defaultValue={connection?.preferredAreaCode ?? ""}
              placeholder="702"
            />
          </label>
          <label className="span-6">
            What will this number be used for?
            <select name="intendedUse" defaultValue={connection?.intendedUse ?? "main_business"}>
              <option value="main_business">Main business number</option>
              <option value="temporary_porting">Temporary while moving my number</option>
              <option value="marketing_campaign">Marketing campaign</option>
              <option value="department">Department or secondary line</option>
            </select>
          </label>
        </div>
      ) : null}

      {path === "bring_own_provider" ? (
        <div className="grid">
          <label className="span-6">
            Phone provider
            <select name="phoneProviderKey" defaultValue={connection?.phoneProviderKey ?? ""} required>
              <option value="">Choose provider</option>
              <option value="twilio_phone">Twilio</option>
              <option value="telnyx_phone">Telnyx</option>
              <option value="signalwire_phone">SignalWire</option>
              <option value="vonage_phone">Vonage</option>
              <option value="generic_sip">Existing phone or PBX system</option>
              <option value="other">Another provider</option>
            </select>
          </label>
          <label className="span-6">
            Provider or system name
            <input
              name="phoneProviderLabel"
              defaultValue={connection?.phoneProviderLabel ?? ""}
              placeholder="Optional unless you chose another provider"
            />
          </label>
        </div>
      ) : null}

      <div className="grid">
        <label className="span-6">
          Where should Ferocity transfer important calls?
          <input
            name="humanTransferNumber"
            type="tel"
            defaultValue={connection?.humanTransferNumber ?? ""}
            placeholder="Owner, office, or on-call phone"
          />
        </label>
        <div className="span-6 form-stack">
          <p className="muted">
            Texting is optional and separate from the AI receptionist. You can activate voice now and add automated or assisted messaging later.
          </p>
          <label className="checkbox-row">
            <input name="smsRequested" type="checkbox" value="true" defaultChecked={connection?.smsRequested ?? false} />
            <span>Add business texting when this connection supports it.</span>
          </label>
          <label className="checkbox-row">
            <input name="mmsRequested" type="checkbox" value="true" defaultChecked={connection?.mmsRequested ?? false} />
            <span>I want picture messaging when this connection supports it.</span>
          </label>
        </div>
      </div>

      <div className="button-row">
        <button className="button" type="submit">Continue phone setup</button>
        {connection ? <span className="pill">{connection.status.replaceAll("_", " ")}</span> : null}
      </div>
    </form>
  );
}
