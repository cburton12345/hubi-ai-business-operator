import { notFound } from "next/navigation";
import { getTenantOverview } from "@/lib/dashboard/get-tenant-overview";
import { generateWorkspaceMarketingPlanAction } from "@/app/app/tenant/[tenantSlug]/actions";

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspace = await getTenantOverview(workspaceSlug);

  if (!workspace) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>{workspace.name}</h1>
            <p className="muted">Workspace-scoped operating context for brands, users, lead capture, service operations, and AI marketing work.</p>
          </div>
          <form action={generateWorkspaceMarketingPlanAction}>
            <input name="workspaceSlug" type="hidden" value={workspace.slug} />
            <button className="button" type="submit">
              Generate workspace marketing plan
            </button>
          </form>
        </div>

        <div className="grid">
          <section className="panel span-12">
            <h2>Workspace Readiness</h2>
            <div className="button-row">
              <span className="pill">{workspace.accountType}</span>
              <span className="pill">{workspace.status}</span>
              <span className="pill">{workspace.onboardingStatus}</span>
            </div>
          </section>

          <section className="panel span-8">
            <h2>Brand Portfolio</h2>
            <ul className="list">
              {workspace.brands.map((brand) => (
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
            <h2>Access Boundary</h2>
            <p className="muted">
              Workspace access is the security boundary. Brand access controls what each teammate can operate inside that workspace.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
