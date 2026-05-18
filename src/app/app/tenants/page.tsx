import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getTenantSelectorRows, type TenantSelectorRow } from "@/lib/tenancy/get-tenant-selector";

export default async function TenantsPage() {
  const rows = await getTenantSelectorRows();

  return (
    <QueuePageShell eyebrow="SaaS Platform" title="Tenant Selector" description="Separate workspaces for internal brands and future customer accounts.">
      <QueueTable<TenantSelectorRow>
        rows={rows}
        columns={[
          {
            key: "name",
            label: "Tenant",
            render: (row) => (
              <Link href={`/app/tenant/${row.slug}`}>
                <strong>{row.name}</strong>
                <span className="muted">{row.slug}</span>
              </Link>
            )
          },
          { key: "type", label: "Type", render: (row) => row.accountType },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> }
        ]}
      />
    </QueuePageShell>
  );
}
