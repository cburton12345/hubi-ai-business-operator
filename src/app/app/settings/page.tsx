import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { can } from "@/lib/auth/permissions";
import { getCurrentActor } from "@/lib/auth/require-permission";
import { getFeaturedDemo, getPublicCopy, publicCopyKeys } from "@/lib/public-site/featured-demo";
import { getWorkspaceSettings } from "@/lib/workspace/get-workspace-settings";
import { updateChecklistAction, updateFeaturedDemoAction, updatePublicCopyAction, updateWorkspaceSettingsAction } from "./actions";

const publicCopyLabels = {
  home_hero: "Homepage headline",
  home_final_cta: "Homepage final invitation",
  demo_hero: "Demo page headline",
  pricing_hero: "Pricing page headline"
} as const;

export default async function WorkspaceSettingsPage({ searchParams }: { searchParams: Promise<{ demo?: string; content?: string; slot?: string }> }) {
  const query = await searchParams;
  const [settings, actor, featuredDemo, ...copySlots] = await Promise.all([
    getWorkspaceSettings(),
    getCurrentActor(),
    getFeaturedDemo(),
    ...publicCopyKeys.map((key) => getPublicCopy(key))
  ]);
  const canManagePublicSite = can(actor, "platform:manage");
  const checklistText = settings.onboardingChecklist.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.label}`).join("\n");
  const usageEntries = Object.entries(settings.usage ?? {});
  const billingStatus = settings.billingStatus === "not_connected" ? "Not connected" : settings.billingStatus.replaceAll("_", " ");

  return (
    <QueuePageShell
      eyebrow="Workspace Settings"
      title="Organization Readiness"
      description="Customer-facing workspace profile, onboarding checklist, usage summary, billing status, and export rules."
    >
      <div className="grid">
        <form action={updateWorkspaceSettingsAction} className="panel span-6 form-stack">
          <h2>Organization Profile</h2>
          <label>
            Display name
            <input name="displayName" defaultValue={settings.displayName} />
          </label>
          <label>
            Timezone
            <input name="timezone" defaultValue={settings.timezone} />
          </label>
          <label>
            Report email
            <input name="defaultReportEmail" type="email" defaultValue={settings.defaultReportEmail} />
          </label>
          <label>
            Plan key
            <input name="planKey" defaultValue={settings.planKey} />
          </label>
          <label>
            Export policy
            <select name="exportPolicy" defaultValue={settings.exportPolicy}>
              <option value="manual_only">manual only</option>
              <option value="approved_exports_only">approved exports only</option>
            </select>
          </label>
          <button className="button" type="submit">Save settings</button>
        </form>

        <form action={updateChecklistAction} className="panel span-6 form-stack">
          <h2>Onboarding Checklist</h2>
          <textarea name="items" rows={13} defaultValue={checklistText} />
          <button className="button" type="submit">Save checklist</button>
        </form>

        <section className="panel span-6">
          <h2>Usage Summary</h2>
          {usageEntries.length ? (
            <ul className="list">
              {usageEntries.map(([key, value]) => (
                <li className="list-row" key={key}>
                  <strong>{key.replaceAll("_", " ")}</strong>
                  <span className="pill">{String(value)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No usage recorded yet.</p>
          )}
        </section>

        <section className="panel span-6">
          <h2>Billing Status</h2>
          <ul className="list">
            <li className="list-row">
              <strong>Plan</strong>
              <span className="pill">{settings.planKey}</span>
            </li>
            <li className="list-row">
              <strong>Billing</strong>
              <span className="pill">{billingStatus}</span>
            </li>
            <li className="list-row">
              <strong>Payment system</strong>
              <span className="pill">{settings.billingStatus === "active" ? "ready" : "review"}</span>
            </li>
          </ul>
        </section>

        {canManagePublicSite ? (
          <form action={updateFeaturedDemoAction} className="panel span-12 form-stack">
            <div>
              <p className="eyebrow">Ferocity public site</p>
              <h2>Featured product demo</h2>
              <p className="muted">Change the homepage and public demo video without a code deployment. Unsupported or disabled media safely falls back to the built-in walkthrough.</p>
            </div>
            {query.demo === "saved" ? <p className="success-message">The public demo was updated.</p> : null}
            {query.demo === "invalid" || query.demo === "invalid_url" ? (
              <p className="error-message">That video setup could not be saved. Use HTTPS and choose the matching direct-video, YouTube, or Vimeo source.</p>
            ) : null}
            <label className="checkbox-row">
              <input name="enabled" type="checkbox" defaultChecked={featuredDemo.enabled} />
              <span>Show the configured video publicly</span>
            </label>
            <label>
              Video source
              <select name="sourceType" defaultValue={featuredDemo.sourceType}>
                <option value="direct_video">Direct MP4, WebM, or MOV URL</option>
                <option value="youtube">YouTube</option>
                <option value="vimeo">Vimeo</option>
              </select>
            </label>
            <label>
              Video URL
              <input name="mediaUrl" type="url" defaultValue={featuredDemo.mediaUrl} placeholder="https://..." />
            </label>
            <label>
              Optional poster image URL
              <input name="posterUrl" type="url" defaultValue={featuredDemo.posterUrl} placeholder="https://..." />
            </label>
            <div className="form-grid two">
              <label>Label<input name="eyebrow" defaultValue={featuredDemo.eyebrow} /></label>
              <label>Button text<input name="ctaLabel" defaultValue={featuredDemo.ctaLabel} /></label>
            </div>
            <label>Headline<input name="headline" defaultValue={featuredDemo.headline} /></label>
            <label>Description<textarea name="body" rows={3} defaultValue={featuredDemo.body} /></label>
            <label>Button destination<input name="ctaHref" defaultValue={featuredDemo.ctaHref} /></label>
            <button className="button" type="submit">Save public demo</button>
          </form>
        ) : null}

        {canManagePublicSite ? (
          <section className="panel span-12 form-stack">
            <div>
              <p className="eyebrow">Public messaging</p>
              <h2>Headlines and calls to action</h2>
              <p className="muted">Edit the highest-impact public wording without changing layouts or deploying code. Every saved revision is retained.</p>
            </div>
            {query.content === "saved" ? <p className="success-message">The public wording was updated.</p> : null}
            {query.content === "invalid" ? <p className="error-message">That wording could not be saved. Keep links inside Ferocity and stay within the field limits.</p> : null}
            <div className="grid">
              {publicCopyKeys.map((key, index) => {
                const slot = copySlots[index];
                return (
                  <form action={updatePublicCopyAction} className="panel span-6 form-stack" key={key}>
                    <input name="contentKey" type="hidden" value={key} />
                    <h3>{publicCopyLabels[key]}</h3>
                    <label>Small label<input name="eyebrow" defaultValue={slot.eyebrow} /></label>
                    <label>Headline<input name="headline" defaultValue={slot.headline} /></label>
                    <label>Description<textarea name="body" rows={4} defaultValue={slot.body} /></label>
                    <div className="form-grid two">
                      <label>Primary button<input name="ctaLabel" defaultValue={slot.ctaLabel} /></label>
                      <label>Primary destination<input name="ctaHref" defaultValue={slot.ctaHref} /></label>
                      <label>Second button<input name="secondaryCtaLabel" defaultValue={slot.secondaryCtaLabel} /></label>
                      <label>Second destination<input name="secondaryCtaHref" defaultValue={slot.secondaryCtaHref} /></label>
                    </div>
                    <button className="button" type="submit">Save {publicCopyLabels[key].toLowerCase()}</button>
                  </form>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </QueuePageShell>
  );
}
