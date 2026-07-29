import Link from "next/link";
import { Camera, ClipboardCheck, FileText, ShieldAlert, Video } from "lucide-react";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getAiWalkthroughDashboard } from "@/lib/ai-walkthrough/get-ai-walkthrough-dashboard";
import { createAiWalkthroughAction, updateWalkthroughEstimateItemAction, updateWalkthroughObservationAction } from "./actions";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function AiWalkthroughPage() {
  const dashboard = await getAiWalkthroughDashboard();

  return (
    <QueuePageShell
      eyebrow="AI Field Assistant"
      title="AI Walkthrough"
      description="Walk, talk, record, and document jobsites, roofs, rentals, inspections, claims, assets, and projects. Ferocity turns reviewed observations into reports, tasks, estimate items, and operating records."
    >
      <div className="grid section-actions">
        <Metric label="Walkthroughs" value={dashboard.metrics.sessions} />
        <Metric label="Needs review" value={dashboard.metrics.needsReview} />
        <Metric label="Observations" value={dashboard.metrics.observations} />
        <Metric label="Draft estimate items" value={dashboard.metrics.estimateItems} />
        <Metric label="Media items" value={dashboard.metrics.mediaItems} />
      </div>

      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>How It Works</h2>
            <p className="muted">
              This MVP uses typed walkthrough notes as the transcript. Audio, video, drone, Meta Glasses, live speech, and visual damage detection are staged behind provider integration.
            </p>
          </div>
          <div className="inline-actions">
            <Link className="mini-button" href="/app/service">Work Records</Link>
            <Link className="mini-button" href="/app/proof">Customer Proof</Link>
          </div>
        </div>
        <div className="operating-loop">
          {[
            ["Walk and talk", "Record natural observations, damage, quantities, requests, and questions."],
            ["AI organizes", "Create summaries, findings, safety flags, open questions, and draft scope."],
            ["Review", "Keep, edit, reject, or approve low-confidence items before they become records."],
            ["Convert", "Move approved details into estimates, jobs, reports, tasks, proof, and content."]
          ].map(([title, body], index) => (
            <article className="loop-step" key={title}>
              <strong>{index + 1}. {title}</strong>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid section-actions">
        <form action={createAiWalkthroughAction} className="panel form-stack span-7">
          <div>
            <p className="eyebrow">Create Walkthrough</p>
            <h2>Paste or type what you said on site</h2>
            <p className="muted">
              Example: Two windows need replacement on the east side. About thirty feet of fascia damage. Customer wants white siding.
            </p>
          </div>
          <input name="title" placeholder="North Ridge storm inspection" required />
          <div className="two-col">
            <label>
              Walkthrough type
              <select name="walkthroughType" defaultValue="roof">
                <option value="property">Property</option>
                <option value="roof">Roof</option>
                <option value="inspection">Inspection</option>
                <option value="damage_claim">Damage claim</option>
                <option value="rental">Rental</option>
                <option value="jobsite">Jobsite</option>
                <option value="equipment">Equipment</option>
                <option value="fleet">Fleet</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Capture mode
              <select name="captureMode" defaultValue="spoken_notes">
                <option value="spoken_notes">Spoken notes / transcript</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
                <option value="photos">Photos</option>
                <option value="mixed">Mixed</option>
                <option value="drone">Drone</option>
                <option value="meta_glasses">Meta Glasses</option>
              </select>
            </label>
          </div>
          <input name="siteLocation" placeholder="East side, west roof slope, unit 4, jobsite address" />
          <textarea
            name="transcriptText"
            rows={8}
            placeholder="Walkthrough notes, transcript, or field observations..."
            required
          />
          <div className="two-col">
            <input name="mediaTitle" placeholder="Optional media title" />
            <select name="mediaType" defaultValue="photo">
              <option value="photo">Photo</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="extracted_frame">Extracted frame</option>
              <option value="drone_video">Drone video</option>
              <option value="meta_glasses_video">Meta Glasses video</option>
              <option value="other">Other</option>
            </select>
          </div>
          <textarea name="mediaDescription" rows={2} placeholder="Optional media notes, file links, or proof details." />
          <label className="checkbox-row">
            <input name="contentModeEnabled" type="checkbox" />
            <span>Also prepare marketing/content ideas from this walkthrough after review.</span>
          </label>
          <button className="button" type="submit">Create AI walkthrough</button>
        </form>

        <aside className="panel span-5">
          <p className="eyebrow">Prepared Capabilities</p>
          <div className="stacked-list">
            {[
              ["Speech recognition", "Manual transcript works now. A speech provider connection can replace manual entry when configured."],
              ["Visual analysis", "Photo/video metadata and review queues are ready for provider output."],
              ["Smart counting", "Quantities, materials, and units are extracted from spoken observations."],
              ["Reports", "Inspection and insurance support drafts are generated for review."],
              ["Estimates", "Draft line items can flow into existing estimate workflows after approval."],
              ["Content mode", "Before/after and social recap planning is staged, not auto-published."]
            ].map(([title, body]) => (
              <div className="notice-card" key={title}>
                <ClipboardCheck size={18} />
                <div>
                  <strong>{title}</strong>
                  <p className="muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="panel section-actions">
        <h2><Video size={18} /> Recent Walkthroughs</h2>
        <ul className="list">
          {dashboard.sessions.map((session) => (
            <li className="list-row" key={session.id}>
              <div>
                <h3>{session.title}</h3>
                <p className="muted">
                  {session.walkthroughType} / {session.siteLocation} / {dateLabel(session.createdAt)}
                </p>
                <p className="muted">
                  {session.observations} observation(s), {session.estimateItems} estimate item(s), {session.mediaItems} media item(s)
                </p>
              </div>
              <div className="inline-actions">
                <span className={`pill ${session.status === "needs_review" ? "medium" : ""}`}>{session.status}</span>
                <span className={`pill ${session.confidence === "low" ? "high" : session.confidence === "medium" ? "medium" : ""}`}>
                  {session.confidence} confidence
                </span>
              </div>
            </li>
          ))}
          {dashboard.sessions.length === 0 ? <li className="list-row"><span className="muted">No walkthroughs yet.</span></li> : null}
        </ul>
      </section>

      <section className="grid section-actions">
        <section className="panel span-7">
          <h2><ShieldAlert size={18} /> Observation Review</h2>
          <ul className="list">
            {dashboard.observations.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.sessionTitle} / {item.observationType} / {item.locationReference || "no location"}</p>
                  <p>{item.description}</p>
                  <p className="muted">
                    {item.quantity ? `Quantity: ${item.quantity} ${item.unit}` : "No quantity"} / {item.confidence} confidence
                  </p>
                </div>
                <form action={updateWalkthroughObservationAction} className="inline-actions">
                  <input name="observationId" type="hidden" value={item.id} />
                  <select name="reviewStatus" defaultValue={item.reviewStatus}>
                    <option value="needs_review">needs review</option>
                    <option value="approved">approved</option>
                    <option value="edited">edited</option>
                    <option value="rejected">rejected</option>
                    <option value="converted">converted</option>
                  </select>
                  <button className="mini-button" type="submit">Save</button>
                </form>
              </li>
            ))}
            {dashboard.observations.length === 0 ? <li className="list-row"><span className="muted">Run a walkthrough to create observations here.</span></li> : null}
          </ul>
        </section>

        <section className="panel span-5">
          <h2><FileText size={18} /> Draft Estimate Items</h2>
          <ul className="list">
            {dashboard.estimateItems.map((item) => (
              <li className="list-row" key={item.id}>
                <div>
                  <h3>{item.lineItem}</h3>
                  <p className="muted">{item.sessionTitle}</p>
                  <p className="muted">{item.quantity ? `${item.quantity} ${item.unit}` : "Needs quantity/pricing review"} / {item.confidence}</p>
                </div>
                <form action={updateWalkthroughEstimateItemAction} className="inline-actions">
                  <input name="estimateItemId" type="hidden" value={item.id} />
                  <select name="status" defaultValue={item.status}>
                    <option value="draft">draft</option>
                    <option value="approved">approved</option>
                    <option value="sent_to_estimate">sent to estimate</option>
                    <option value="rejected">rejected</option>
                  </select>
                  <button className="mini-button" type="submit">Save</button>
                </form>
              </li>
            ))}
            {dashboard.estimateItems.length === 0 ? <li className="list-row"><span className="muted">Run a walkthrough to prepare draft line items.</span></li> : null}
          </ul>
        </section>
      </section>

      <section className="panel section-actions">
        <h2><Camera size={18} /> Media Review</h2>
        <p className="muted">
          Photo and video references work now. Provider upload, frame extraction, and visual detection attach to this same review queue when those accounts are connected.
        </p>
        <ul className="list">
          {dashboard.media.map((item) => (
            <li className="list-row" key={item.id}>
              <div>
                <h3>{item.aiTitle}</h3>
                <p className="muted">{item.sessionTitle} / {item.mediaType} / {item.locationReference || "no location"}</p>
                <p>{item.aiDescription || "No description yet."}</p>
              </div>
              <div className="inline-actions">
                <span className="pill">{item.status}</span>
                <span className={`pill ${item.confidence === "low" ? "high" : item.confidence === "medium" ? "medium" : ""}`}>{item.confidence}</span>
              </div>
            </li>
          ))}
          {dashboard.media.length === 0 ? <li className="list-row"><span className="muted">No media references yet.</span></li> : null}
        </ul>
      </section>
    </QueuePageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <section className="panel span-3 metric">
      <span className="muted">{label}</span>
      <strong>{typeof value === "number" ? value.toLocaleString() : value}</strong>
    </section>
  );
}
