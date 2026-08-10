import Link from "next/link";
import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { getProviderReportingResources } from "@/lib/integrations/provider-reporting-resources";
import { discoverGoogleReportingResourcesAction, selectGoogleReportingResourceAction, syncGoogleReportingResourceAction } from "./actions";

export default async function ReportingConnectionsPage() {
  const resources = await getProviderReportingResources();
  return (
    <QueuePageShell eyebrow="Search and analytics" title="Connect The Data, Then Choose The Right Property" description="Google login proves access. Ferocity does not assume which website or analytics property belongs to this workspace.">
      <div className="button-row section-actions">
        <Link className="button secondary-button" href="/app/integrations">All connections</Link>
        <Link className="button secondary-button" href="/app/website">Websites</Link>
        <Link className="button secondary-button" href="/app/reports">Reports</Link>
      </div>
      {(["search_console", "analytics"] as const).map((provider) => {
        const providerResources = resources.filter((row) => row.providerKey === provider);
        const selected = providerResources.find((row) => row.selected);
        const label = provider === "search_console" ? "Google Search Console" : "Google Analytics 4";
        return (
          <section className="panel section-actions" key={provider}>
            <div className="list-row flush-row">
              <div><h2>{label}</h2><p className="muted">Read-only reporting. Connecting this does not edit the website.</p></div>
              <span className="pill">{selected ? "Property selected" : "Choose a property"}</span>
            </div>
            <form action={discoverGoogleReportingResourcesAction} className="button-row section-actions">
              <input type="hidden" name="provider" value={provider} />
              <button className="button" type="submit">Find my properties</button>
              <Link className="button secondary-button" href={`/api/integrations/${provider}/oauth/start`}>Connect Google account</Link>
            </form>
            <ul className="list section-actions">
              {providerResources.map((resource) => (
                <li className="list-row" key={resource.id}>
                  <div><strong>{resource.displayName}</strong><p className="muted">{resource.status}{resource.lastError ? ` · ${resource.lastError}` : ""}</p></div>
                  <form action={selectGoogleReportingResourceAction}>
                    <input type="hidden" name="provider" value={provider} />
                    <input type="hidden" name="resourceId" value={resource.id} />
                    <button className="mini-button" type="submit" disabled={resource.selected}>{resource.selected ? "Selected" : "Use this property"}</button>
                  </form>
                </li>
              ))}
              {!providerResources.length ? <li className="list-row"><span className="muted">No properties discovered yet.</span></li> : null}
            </ul>
            {selected ? (
              <form action={syncGoogleReportingResourceAction} className="section-actions">
                <input type="hidden" name="provider" value={provider} />
                <button className="button" type="submit">Sync the last 28 days</button>
              </form>
            ) : null}
          </section>
        );
      })}
    </QueuePageShell>
  );
}
