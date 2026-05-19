import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getWorkspaceSettings } from "@/lib/workspace/get-workspace-settings";
import { updateChecklistAction, updateWorkspaceSettingsAction } from "./actions";

export default async function WorkspaceSettingsPage() {
  const settings = await getWorkspaceSettings();
  const checklistText = settings.onboardingChecklist.map((item) => `${item.done ? "[x]" : "[ ]"} ${item.label}`).join("\n");

  return (
    <QueuePageShell
      eyebrow="Workspace Settings"
      title="Organization Readiness"
      description="Customer-facing workspace profile, onboarding checklist, usage placeholders, and billing placeholders without Stripe."
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
            Plan placeholder
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
          <h2>Usage Placeholder</h2>
          <pre>{JSON.stringify(settings.usage, null, 2)}</pre>
        </section>

        <section className="panel span-6">
          <h2>Billing Placeholder</h2>
          <ul className="list">
            <li className="list-row">
              <strong>Plan</strong>
              <span className="pill">{settings.planKey}</span>
            </li>
            <li className="list-row">
              <strong>Billing</strong>
              <span className="pill">{settings.billingStatus}</span>
            </li>
            <li className="list-row">
              <strong>Stripe</strong>
              <span className="pill">not connected</span>
            </li>
          </ul>
        </section>
      </div>
    </QueuePageShell>
  );
}
