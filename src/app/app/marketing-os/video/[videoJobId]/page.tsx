import Link from "next/link";
import { notFound } from "next/navigation";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { env } from "@/lib/env";
import { getVideoAdBrief, type JsonRecord } from "@/lib/marketing-os/get-video-ad-brief";
import { getManagedVideoConfiguration } from "@/lib/providers/video-adapters";
import { refreshVideoRenderAction, submitVideoRenderAction } from "./actions";

function textValue(value: unknown, fallback = "Not set") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberValue(value: unknown, fallback = "Not set") {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

function listValue(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function boolLabel(value: unknown) {
  return value ? "Yes" : "No";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function sceneLabel(scene: JsonRecord, index: number) {
  return textValue(scene.label ?? scene.title ?? scene.shot ?? scene.scene, `Scene ${index + 1}`);
}

function sceneDetail(scene: JsonRecord) {
  const details = [
    textValue(scene.visual, ""),
    textValue(scene.copy, ""),
    textValue(scene.note, ""),
    textValue(scene.duration, "")
  ].filter(Boolean);

  return details.join(" / ") || "Scene details are ready for review.";
}

function renderSeconds(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 4) return 4;
  if (number <= 8) return 8;
  return 12;
}

function moneyFromCents(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

export default async function VideoAdBriefPage({ params }: { params: Promise<{ videoJobId: string }> }) {
  const { videoJobId } = await params;
  const brief = await getVideoAdBrief(videoJobId);

  if (!brief) {
    notFound();
  }

  const aspectRatios = listValue(brief.providerRequest.aspectRatios);
  const exportFormats = listValue(brief.providerRequest.exportFormats);
  const supportedProviders = listValue(brief.providerRequest.supportedProviders ?? brief.providerRequest.futureProviders);
  const sourceAssets = listValue(brief.providerRequest.sourceAssets);
  const variants = listValue(brief.metadata.variantPrompts);
  const videoConfiguration = getManagedVideoConfiguration();
  const seconds = renderSeconds(brief.metadata.durationSeconds ?? brief.providerRequest.durationSeconds);
  const estimatedCustomerCharge = videoConfiguration
    ? seconds * videoConfiguration.customerPriceCentsPerSecond
    : null;
  const canSubmit = ["needs_review", "provider_ready", "failed"].includes(brief.status);
  const canRefresh = ["submitted", "processing"].includes(brief.status);

  return (
    <QueuePageShell
      eyebrow="Video Ad Studio"
      title={brief.goal ?? "Video ad brief"}
      description="Review the ad script, scenes, platform notes, and cost status before rendering or sending anything to a provider."
    >
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Brief Status</h2>
            <p className="muted">
              This is a production brief. It does not mean a finished AI video has been rendered or published.
            </p>
          </div>
          <div className="button-row">
            <span className="pill">{brief.status}</span>
            <Link className="mini-button" href="/app/marketing-os">Marketing OS</Link>
            <Link className="mini-button" href="/app/review">Review Queue</Link>
          </div>
        </div>
        <div className="grid section-actions">
          <Metric label="Brand" value={brief.brandName ?? "Current workspace"} />
          <Metric label="Platform" value={textValue(brief.metadata.platform ?? brief.providerRequest.platform)} />
          <Metric label="Duration" value={`${numberValue(brief.metadata.durationSeconds ?? brief.providerRequest.durationSeconds, "?")} sec`} />
          <Metric label="Rendering credits" value={brief.metadata.creditRequiredForRendering ? "Required" : "Brief only"} />
        </div>
      </section>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Live Render Control</h2>
            <p className="muted">
              Briefs remain available without a rendering provider. A live render requires an Operator-level feature gate,
              an active subscription, usage billing, profitable per-second pricing, and global plus workspace cost caps.
            </p>
          </div>
          <span className={`pill ${videoConfiguration ? "" : "medium"}`}>
            {videoConfiguration ? "OpenAI Video configured" : "rendering safely paused"}
          </span>
        </div>
        {canSubmit ? (
          <form action={submitVideoRenderAction} className="form-stack">
            <input name="videoJobId" type="hidden" value={brief.id} />
            <div className="notice-card">
              <div>
                <strong>
                  {estimatedCustomerCharge === null
                    ? "Configure provider pricing and cost caps before submitting."
                    : `Estimated managed-render charge: ${moneyFromCents(estimatedCustomerCharge)} for ${seconds} seconds.`}
                </strong>
                <p className="muted">
                  OpenAI accepts 4, 8, or 12 second clips. Longer briefs render as a 12-second first cut.
                  Rendering does not publish the video.
                </p>
              </div>
            </div>
            <label className="checkbox-row">
              <input name="costApproval" type="checkbox" value="true" required />
              <span>I approve this estimated provider-backed render charge and understand that the result still requires review before publishing.</span>
            </label>
            <button className="button" type="submit" disabled={!videoConfiguration || env.FEROCITY_USAGE_BILLING_ENABLED?.toLowerCase() !== "true"}>
              Submit approved render
            </button>
          </form>
        ) : null}
        {canRefresh ? (
          <form action={refreshVideoRenderAction}>
            <input name="videoJobId" type="hidden" value={brief.id} />
            <button className="button" type="submit">Refresh render status</button>
          </form>
        ) : null}
      </section>

      <div className="grid section-actions">
        <section className="panel span-7 form-stack">
          <h2>Script</h2>
          <p>{brief.scriptText ?? "No script text was stored for this brief."}</p>
          <dl className="detail-grid">
            <Detail label="Service" value={brief.serviceLabel ?? "General"} />
            <Detail label="Offer" value={brief.offerLabel ?? "Not set"} />
            <Detail label="Call To Action" value={brief.ctaText ?? "Not set"} wide />
          </dl>
        </section>

        <section className="panel span-5 form-stack">
          <h2>Voiceover</h2>
          <p>{brief.voiceoverText ?? "No voiceover text was stored."}</p>
          <h3>Cost And Provider Readiness</h3>
          <ul className="list">
            <li className="list-row">
              <span>Rendered video needs credits</span>
              <span className="pill">{boolLabel(brief.metadata.creditRequiredForRendering)}</span>
            </li>
            <li className="list-row">
              <span>Production add-on recommended</span>
              <span className="pill">{boolLabel(brief.metadata.addOnRecommended)}</span>
            </li>
            <li className="list-row">
              <span>Provider</span>
              <span className="pill">{brief.providerKey}</span>
            </li>
          </ul>
        </section>
      </div>

      <section className="panel section-actions">
        <h2>Scene Plan</h2>
        <ul className="list">
          {brief.scenes.map((scene, index) => (
            <li className="list-row" key={`${brief.id}-scene-${index}`}>
              <div>
                <h3>{sceneLabel(scene, index)}</h3>
                <p className="muted">{sceneDetail(scene)}</p>
              </div>
              <span className="pill">scene {index + 1}</span>
            </li>
          ))}
          {brief.scenes.length === 0 ? <li className="list-row"><span className="muted">No scenes were stored for this brief.</span></li> : null}
        </ul>
      </section>

      <div className="grid section-actions">
        <section className="panel span-6 form-stack">
          <h2>Provider Request</h2>
          <DetailList
            rows={[
              ["Platform", textValue(brief.providerRequest.platform)],
              ["Audience", textValue(brief.providerRequest.audience)],
              ["Aspect ratios", aspectRatios.join(", ") || "Not set"],
              ["Export formats", exportFormats.join(", ") || "Not set"],
              ["Supported providers", supportedProviders.join(", ") || "Not connected"]
            ]}
          />
          {sourceAssets.length ? (
            <>
              <h3>Source Assets</h3>
              <ul className="list">
                {sourceAssets.map((asset) => <li className="list-row" key={asset}>{asset}</li>)}
              </ul>
            </>
          ) : null}
        </section>

        <section className="panel span-6 form-stack">
          <h2>Creative Variants</h2>
          <ul className="list">
            {variants.map((variant, index) => (
              <li className="list-row" key={`${brief.id}-variant-${index}`}>
                <span>{variant}</span>
                <span className="pill">variant {index + 1}</span>
              </li>
            ))}
            {variants.length === 0 ? <li className="list-row"><span className="muted">No variants were stored.</span></li> : null}
          </ul>
        </section>
      </div>

      <div className="grid section-actions">
        <section className="panel span-6 form-stack">
          <h2>Production History</h2>
          <ul className="list">
            {brief.history.map((item, index) => (
              <li className="list-row" key={`${brief.id}-history-${index}`}>
                <div>
                  <h3>{textValue(item.status ?? item.action, `Step ${index + 1}`)}</h3>
                  <p className="muted">{textValue(item.note ?? item.message ?? item.at, "Logged")}</p>
                </div>
              </li>
            ))}
            {brief.history.length === 0 ? <li className="list-row"><span className="muted">No production history yet.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-6 form-stack">
          <h2>Output</h2>
          <DetailList
            rows={[
              ["Output URL", brief.outputUrl ?? "No rendered video yet"],
              ["Error", brief.errorMessage ?? "No error recorded"],
              ["Created", formatDate(brief.createdAt)],
              ["Updated", formatDate(brief.updatedAt)]
            ]}
          />
          <div className="button-row">
            {brief.outputUrl ? <Link className="button" href={brief.outputUrl}>Open rendered video</Link> : null}
            <Link className="button secondary-button" href="/app/integrations">Connect providers</Link>
            <Link className="button secondary-button" href="/pricing">Check video pricing</Link>
          </div>
        </section>
      </div>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function Detail({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "detail-wide" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DetailList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="detail-grid">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
