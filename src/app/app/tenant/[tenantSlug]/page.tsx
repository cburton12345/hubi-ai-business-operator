import { notFound } from "next/navigation";
import { getTenantOverview } from "@/lib/dashboard/get-tenant-overview";

export default async function TenantPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const tenant = await getTenantOverview(tenantSlug);

  if (!tenant) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Tenant</p>
            <h1>{tenant.name}</h1>
            <p className="muted">Tenant-scoped operating context. Future customer workspaces use this same shape.</p>
          </div>
        </div>

        <div className="grid">
          <section className="panel span-8">
            <h2>Brand Portfolio</h2>
            <ul className="list">
              {tenant.brands.map((brand) => (
                <li className="list-row" key={brand.slug}>
                  <div>
                    <h3>{brand.name}</h3>
                    <p className="muted">{brand.primaryGoal}</p>
                  </div>
                  <span className={`pill ${brand.riskProfile === "legal_sensitive" ? "high" : ""}`}>
                    {brand.riskProfile}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel span-4">
            <h2>Isolation Rule</h2>
            <p className="muted">
              Tenant access is the security boundary. Brand access is the operating context inside that boundary.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
