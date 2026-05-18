import Link from "next/link";
import { getLeadDashboardRows } from "@/lib/leads/get-lead-dashboard";

export default async function LeadsPage() {
  const leads = await getLeadDashboardRows();

  return (
    <main className="page-shell">
      <section className="workspace">
        <div className="topbar">
          <div>
            <p className="eyebrow">CRM Lite</p>
            <h1>Lead Management</h1>
            <p className="muted">Tenant-scoped lead intake across local service, rental, software, marketplace, and lead-gen brands.</p>
          </div>
          <Link className="button secondary-button" href="/app">
            Dashboard
          </Link>
        </div>

        <section className="panel span-12">
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
