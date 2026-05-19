import Link from "next/link";
import { getLeadDashboardRows } from "@/lib/leads/get-lead-dashboard";
import { leadPriorities, leadStatuses, qualificationStatuses } from "@/lib/leads/constants";

export default async function LeadsPage({
  searchParams
}: {
  searchParams: Promise<{ brand?: string; status?: string; qualification?: string; priority?: string; q?: string }>;
}) {
  const params = await searchParams;
  const allLeads = await getLeadDashboardRows();
  const brandOptions = [...new Map(allLeads.map((lead) => [lead.brandSlug || lead.brandName, lead.brandName])).entries()];
  const leads = allLeads.filter((lead) => {
    const query = params.q?.trim().toLowerCase();
    return (
      (!params.brand || params.brand === "all" || lead.brandSlug === params.brand || lead.brandName === params.brand) &&
      (!params.status || params.status === "all" || lead.status === params.status) &&
      (!params.qualification || params.qualification === "all" || lead.qualificationStatus === params.qualification) &&
      (!params.priority || params.priority === "all" || lead.priority === params.priority) &&
      (!query ||
        [lead.name, lead.email, lead.phone, lead.brandName, lead.leadType].some((value) => value.toLowerCase().includes(query)))
    );
  });

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">CRM Lite</p>
            <h1>Lead Management</h1>
            <p className="muted">Workspace-scoped lead intake across local service, rental, software, marketplace, and lead-gen brands.</p>
          </div>
          <Link className="button secondary-button" href="/app">
            Dashboard
          </Link>
        </div>

        <section className="panel span-12">
          <form className="filter-bar">
            <label>
              Search
              <input name="q" defaultValue={params.q ?? ""} placeholder="Name, email, phone, brand" />
            </label>
            <label>
              Brand
              <select name="brand" defaultValue={params.brand ?? "all"}>
                <option value="all">All brands</option>
                {brandOptions.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue={params.status ?? "all"}>
                <option value="all">All statuses</option>
                {leadStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Qualification
              <select name="qualification" defaultValue={params.qualification ?? "all"}>
                <option value="all">All qualification</option>
                {qualificationStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select name="priority" defaultValue={params.priority ?? "all"}>
                <option value="all">All priorities</option>
                {leadPriorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <button className="button" type="submit">
              Filter
            </button>
            <Link className="button secondary-button" href="/app/leads">
              Reset
            </Link>
          </form>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Brand</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Qualification</th>
                  <th>Priority</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <Link href={`/app/leads/${lead.id}`}>
                        <strong>{lead.name}</strong>
                      </Link>
                      <span className="muted">{lead.email || lead.phone || "No contact info"}</span>
                    </td>
                    <td>{lead.brandName}</td>
                    <td>{lead.leadType}</td>
                    <td>
                      <span className="pill">{lead.status}</span>
                    </td>
                    <td>{lead.qualificationStatus}</td>
                    <td>
                      <span className={`pill ${lead.priority === "high" ? "high" : ""}`}>{lead.priority}</span>
                    </td>
                    <td>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(lead.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
