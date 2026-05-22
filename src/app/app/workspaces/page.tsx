import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getTenantSelectorRows, type TenantSelectorRow } from "@/lib/tenancy/get-tenant-selector";

export default async function WorkspacesPage() {
  const rows = await getTenantSelectorRows();

  return (
    <QueuePageShell eyebrow="SaaS Platform" title="Workspace Selector" description="Separate organization workspaces for customer accounts, internal brands, and future client teams.">
      <div className="button-row section-actions">
        <Link className="button" href="/app/onboarding">
          Create organization workspace
        </Link>
      </div>
      <QueueTable<TenantSelectorRow>
        rows={rows}
        emptyMessage="No organization workspaces have been created yet."
        columns={[
          {
            key: "name",
            label: "Workspace",
            render: (row) => (
              <Link href={`/app/workspace/${row.slug}`}>
                <strong>{row.name}</strong>
                <span className="muted">{row.slug}</span>
              </Link>
            )
          },
          { key: "type", label: "Type", render: (row) => row.accountType },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "onboarding", label: "Onboarding", render: (row) => <span className="pill">{row.onboardingStatus}</span> }
        ]}
      />
    </QueuePageShell>
  );
}
