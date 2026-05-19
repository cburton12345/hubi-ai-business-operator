import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getPublicFormRows, type PublicFormRow } from "@/lib/forms/get-public-forms";

export default async function FormsPage() {
  const rows = await getPublicFormRows();

  return (
    <QueuePageShell eyebrow="Lead Capture" title="Public Lead Forms" description="Reusable form keys route incoming leads to the correct workspace and brand.">
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
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.active ? "active" : "paused"}</span> }
        ]}
      />
    </QueuePageShell>
  );
}
