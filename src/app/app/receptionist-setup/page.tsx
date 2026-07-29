import Link from "next/link";
import { Bot, Phone, PlugZap } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getReceptionistSetupDashboard } from "@/lib/office-manager/get-receptionist-setup";
import { listVoiceAgentProviders } from "@/lib/providers/voice-adapters";
import { PhoneSetupChooser } from "./PhoneSetupChooser";
import type { PhoneConnection } from "@/lib/phone/phone-connections";
import {
  placeVoiceTestCallAction,
  selectVoiceProviderRouteAction,
  syncVoiceAssistantAction
} from "./actions";

function label(value: string) {
  return value.replaceAll("_", " ");
}

function PhoneConnectionNextSteps({ connection }: { connection: PhoneConnection | null }) {
  if (!connection) return null;

  const content = connection.connectionPath === "keep_number_forwarding"
    ? {
        title: "Your fast setup",
        steps: [
          connection.ferocityNumber
            ? `Use ${connection.ferocityNumber} as the forwarding destination.`
            : "Ferocity prepares a private answering number for your calls.",
          `Open ${connection.currentCarrier || "your current phone service"} and turn on call forwarding. Your public number does not change.`,
          "Call your normal business number, confirm the AI answers, then test transfer to a person."
        ]
      }
    : connection.connectionPath === "keep_number_full"
      ? {
          title: "Your full connection",
          steps: [
            "Ferocity reviews how the current business number works without interrupting service.",
            "We prepare the direct connection, outbound caller ID, texting, routing, voicemail, and team access.",
            "The old and new paths are tested before anything switches."
          ]
        }
      : connection.connectionPath === "new_ferocity_number"
        ? {
            title: "Your new number",
            steps: [
              `Ferocity looks for an available ${connection.preferredAreaCode || "local"} number.`,
              "You confirm the number and how it should route before activation.",
              "Ferocity tests inbound calls, human transfer, voicemail, and texting before it goes live."
            ]
          }
        : {
            title: "Your advanced connection",
            steps: [
              `Ferocity records ${connection.phoneProviderLabel || "your existing provider"} as the phone connection.`,
              "Open Advanced phone and voice providers below to add credentials and routing.",
              "Complete a signed-webhook check and authorized test call before activation."
            ]
          };

  return (
    <section className="notice-card">
      <div>
        <p className="eyebrow">Current saved setup</p>
        <strong>{content.title}</strong>
        <ol className="section-actions">
          {content.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        <p className="muted">Choose and save a different option above to replace this plan.</p>
      </div>
    </section>
  );
}

export default async function ReceptionistSetupPage() {
  const dashboard = await getReceptionistSetupDashboard();
  const voiceProviders = listVoiceAgentProviders();
  const liveAdapters = voiceProviders.filter((provider) => provider.adapterStatus === "live");
  const orchestrationRoute = dashboard.providers.find((provider) => provider.routeFamily === "voice_orchestrator");

  return (
    <QueuePageShell
      eyebrow="Receptionist Setup"
      title="Connect Your Business Phone"
      description="Keep the number customers already know or get a new one. Ferocity handles the phone-system details behind the scenes."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Current status</p>
            <h2>{dashboard.liveReady ? "Ready To Activate" : "Not Live Yet"}</h2>
            <p className="muted">
              Ferocity can prepare the receptionist now. Real call answering stays off until the number, calling service, test call, billing, and backup rules are ready.
            </p>
          </div>
          <div className="inline-actions">
            <span className={`pill ${dashboard.liveReady ? "" : "medium"}`}>{label(dashboard.status)}</span>
            <Link className="button" href="/app/office-manager">Office Manager</Link>
            <Link className="button secondary-button" href="/app/calls">Call Inbox</Link>
            <Link className="button secondary-button" href="/app/messaging/a2p">Optional texting setup</Link>
          </div>
        </div>
        {dashboard.missing.length ? (
          <ul className="list">
            {dashboard.missing.map((item) => (
              <li className="list-row" key={item}>
                <span className="muted">{item}</span>
                <span className="pill medium">needed</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="panel section-actions" id="phone-setup">
        <div className="list-row flush-row">
          <div>
            <p className="eyebrow">Phone setup</p>
            <h2>How do you want business calls to reach Ferocity?</h2>
            <p className="muted">
              Most businesses should keep their current number and start with forwarding. You can upgrade the connection later without changing the number customers call.
            </p>
          </div>
          <span className="pill">Your number stays yours</span>
        </div>
        <PhoneSetupChooser connection={dashboard.phoneConnection} />
        <PhoneConnectionNextSteps connection={dashboard.phoneConnection} />
      </section>

      <section className="grid section-actions">
        {dashboard.steps.map((step, index) => (
          <Link className="panel span-4 status-card" href={step.href} key={step.key}>
            <span className="pill">Step {index + 1}</span>
            <h3>{step.title}</h3>
            <p className="muted">{step.body}</p>
            <span className={`pill ${step.status === "complete" ? "" : "medium"}`}>{label(step.status)}</span>
          </Link>
        ))}
      </section>

      <section className="panel section-actions" id="numbers">
        <div className="list-row flush-row">
          <div>
            <h2><Phone size={18} /> Phone Numbers</h2>
            <p className="muted">Numbers connected to this business appear here after setup and testing.</p>
          </div>
          <span className="pill medium">setup required</span>
        </div>
        <ul className="list">
          {dashboard.phoneNumbers.map((number) => (
            <li className="list-row" key={number.id}>
              <div>
                <h3>{number.phoneNumber}</h3>
                <p className="muted">{label(number.numberMode)} / review {label(number.complianceStatus)}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{label(number.status)}</span>
                <span className="pill">{number.inboundEnabled ? "inbound on" : "inbound off"}</span>
                <span className="pill">{number.outboundEnabled ? "outbound on" : "outbound off"}</span>
              </div>
            </li>
          ))}
          {dashboard.phoneNumbers.length === 0 ? (
            <li className="list-row">
              <div>
                <h3>No phone number connected yet</h3>
                <p className="muted">Choose a setup path above. Ferocity will guide the remaining steps and show the connected number here.</p>
              </div>
              <span className="pill medium">not connected</span>
            </li>
          ) : null}
        </ul>
      </section>

      <details className="panel section-actions">
        <summary>Advanced phone and voice providers</summary>
      <section className="section-actions">
        <div className="list-row flush-row">
          <div>
            <h2><PlugZap size={18} /> Provider Stack</h2>
            <p className="muted">These routes keep telephony, listening, speaking, realtime AI, and orchestration swappable.</p>
          </div>
          <Link className="button secondary-button" href="/app/integrations">Integrations</Link>
          <Link className="button secondary-button" href="/app/integrations#request-provider">Request another provider</Link>
        </div>
        <ul className="list">
          {dashboard.providers.map((provider) => (
            <li className="list-row" key={provider.routeFamily}>
              <div>
                <h3>{label(provider.routeFamily)}</h3>
                <p className="muted">
                  Primary: {provider.primaryProviderKey}
                  {provider.fallbackProviderKey ? ` / fallback: ${provider.fallbackProviderKey}` : ""}
                </p>
              </div>
              <span className={`pill ${provider.liveActionsEnabled ? "" : "medium"}`}>
                {provider.liveActionsEnabled ? "live enabled" : label(provider.status)}
              </span>
            </li>
          ))}
        </ul>
        <form action={selectVoiceProviderRouteAction} className="panel subtle-panel form-stack section-actions">
          <h3>Choose the calling services</h3>
          <p className="muted">
            Ferocity keeps its CRM, prompts, authority rules, call records, and workflows outside the provider. A live
            provider must be paused before it can be replaced.
          </p>
          <label>
            Preferred voice AI provider
            <select
              name="primaryProviderKey"
              defaultValue={orchestrationRoute?.primaryProviderKey ?? liveAdapters[0]?.providerKey ?? voiceProviders[0]?.providerKey}
            >
              {voiceProviders.map((provider) => (
                <option key={provider.providerKey} value={provider.providerKey}>
                  {provider.displayName} — {provider.adapterStatus === "live" ? "ready to connect" : "coming later"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Backup calling service
            <select name="fallbackProviderKey" defaultValue={orchestrationRoute?.fallbackProviderKey ?? ""}>
              <option value="">No fallback selected</option>
              {voiceProviders.map((provider) => (
                <option key={provider.providerKey} value={provider.providerKey}>
                  {provider.displayName} — {provider.adapterStatus === "live" ? "ready to connect" : "coming later"}
                </option>
              ))}
            </select>
          </label>
          <button className="button secondary-button" type="submit">Save provider preference</button>
        </form>
      </section>
      </details>

      <section className="panel section-actions">
        <h2><Bot size={18} /> Activation Rule</h2>
        <p className="muted">
          Do not turn on live call answering until the test call works, call recording and AI disclosure language is approved, spend limits are set, and the backup plan is clear.
        </p>
        <div className="inline-actions">
          {liveAdapters.map((provider) => (
            <form action={syncVoiceAssistantAction} key={provider.providerKey}>
              <input name="providerKey" type="hidden" value={provider.providerKey} />
              <button className="button" type="submit">Connect {provider.displayName}</button>
            </form>
          ))}
          <Link className="button" href="/app/feature-readiness">Check readiness</Link>
          <Link className="button secondary-button" href="/app/ai-usage">Usage and limits</Link>
          <Link className="button secondary-button" href="/app/safety-readiness">Safety</Link>
        </div>
        {liveAdapters.map((provider) => (
        <details className="panel subtle-panel section-actions" key={provider.providerKey}>
          <summary>Place an authorized test call through {provider.displayName}</summary>
          <form action={placeVoiceTestCallAction} className="form-stack section-actions">
            <input name="providerKey" type="hidden" value={provider.providerKey} />
            <label>
              Test destination in E.164 format
              <input name="toNumber" type="tel" placeholder="+15555550123" required />
            </label>
            <label className="checkbox-row">
              <input name="consentConfirmed" type="checkbox" value="true" required />
              <span>I own or control this destination and consent to receiving this AI test call.</span>
            </label>
            <button className="button" type="submit">Place test call</button>
          </form>
        </details>
        ))}
      </section>
    </QueuePageShell>
  );
}
