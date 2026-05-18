import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getBrandSelectorRows, type BrandSelectorRow } from "@/lib/brands/get-brand-selector";
import Link from "next/link";

export default async function BrandsPage() {
  const rows = await getBrandSelectorRows();

  return (
    <QueuePageShell eyebrow="Multi-Brand" title="Brand Selector" description="Brand-level operating contexts inside the current tenant.">
      <QueueTable<BrandSelectorRow>
        rows={rows}
        columns={[
          {
            key: "name",
            label: "Brand",
            render: (row) => (
              <Link href={`/app/brands/${row.slug}`}>
                <strong>{row.name}</strong>
                <span className="muted">{row.primaryGoal}</span>
              </Link>
            )
          },
          { key: "model", label: "Model", render: (row) => row.businessModel },
          { key: "industry", label: "Industry", render: (row) => row.industry },
          { key: "risk", label: "Risk", render: (row) => <span className={`pill ${row.riskProfile === "legal_sensitive" ? "high" : ""}`}>{row.riskProfile}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> }
        ]}
      />
    </QueuePageShell>
  );
}
