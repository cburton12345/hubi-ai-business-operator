import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { checkLeadIntakeLimits } from "@/lib/billing/plan-limits";
import { getPublicFormRows, type PublicFormRow } from "@/lib/forms/get-public-forms";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import { rotateFormPublicKeyAction } from "./actions";

export default async function FormsPage() {
  const [rows, workspaceId] = await Promise.all([getPublicFormRows(), getCurrentWorkspaceId()]);
  const limits = await checkLeadIntakeLimits(workspaceId);

  return (
    <QueuePageShell eyebrow="Lead Capture" title="Public Lead Forms" description="Reusable form keys route incoming leads to the correct workspace and brand.">
      <section className="panel section-actions">
        <div className="list-row flush-row">
          <div>
            <h2>Plan Limits</h2>
            <p className="muted">
              {limits.monthlyLeadLimit === null
                ? `${limits.monthlyLeadsUsed} leads this month. This plan has no fixed lead limit.`
                : `${limits.monthlyLeadsUsed} of ${limits.monthlyLeadLimit} leads used this month.`}
            </p>
            <p className="muted">
              {limits.formsLimit === null
                ? `${limits.activeForms} active forms.`
                : `${limits.activeForms} of ${limits.formsLimit} active forms allowed on ${limits.planKey}.`}
            </p>
          </div>
          <div className="inline-actions">
            <span className={`pill ${limits.ok ? "" : "high"}`}>{limits.ok ? "accepting leads" : "upgrade needed"}</span>
            <Link className="mini-button" href="/app/billing">Review plan</Link>
          </div>
        </div>
      </section>
      <QueueTable<PublicFormRow>
        rows={rows}
        columns={[
          {
            key: "form",
            label: "Form",
            render: (row) => (
              <Link href={`/forms/${row.publicKey}`}>
                <strong>{row.name}</strong>
                <span className="muted">{row.publicKey}</span>
              </Link>
            )
          },
          { key: "brand", label: "Brand", render: (row) => row.brandName },
          { key: "slug", label: "Slug", render: (row) => row.slug },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.active ? "active" : "paused"}</span> },
          {
            key: "rotation",
            label: "Last Rotation",
            render: (row) => (
              <>
                <strong>{row.lastRotatedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.lastRotatedAt)) : "Never"}</strong>
                <span className="muted">{row.lastRotatedBy}</span>
              </>
            )
          },
          {
            key: "rotate",
            label: "Key Safety",
            render: (row) => (
              <form action={rotateFormPublicKeyAction}>
                <input name="formId" type="hidden" value={row.id} />
                <button className="mini-button danger-button" type="submit">
                  Rotate key
                </button>
              </form>
            )
          }
        ]}
      />
    </QueuePageShell>
  );
}
