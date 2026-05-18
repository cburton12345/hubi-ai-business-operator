import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getAccessOverviewRows, type AccessOverviewRow } from "@/lib/auth/get-access-overview";

export default async function AccessPage() {
  const rows = await getAccessOverviewRows();

  return (
    <QueuePageShell
      eyebrow="SaaS Platform"
      title="Access Control"
      description="Tenant membership, platform roles, and workspace permissions for internal and future customer accounts."
    >
      <QueueTable<AccessOverviewRow>
        rows={rows}
        columns={[
          {
            key: "user",
            label: "User",
            render: (row) => (
              <>
                <strong>{row.userName}</strong>
                <span className="muted">{row.userEmail}</span>
              </>
            )
          },
          {
            key: "tenant",
            label: "Tenant",
            render: (row) => (
              <>
                <strong>{row.tenantName}</strong>
                <span className="muted">{row.tenantSlug}</span>
              </>
            )
          },
          { key: "platformRole", label: "Platform", render: (row) => <span className="pill">{row.platformRole}</span> },
          { key: "tenantRole", label: "Tenant Role", render: (row) => <span className="pill">{row.tenantRole}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "description", label: "Permission Scope", render: (row) => row.roleDescription }
        ]}
      />
    </QueuePageShell>
  );
}
