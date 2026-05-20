import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getAccessOverviewRows, type AccessOverviewRow } from "@/lib/auth/get-access-overview";
import { getWorkspaceInviteRows, type WorkspaceInviteRow } from "@/lib/auth/get-workspace-invites";
import { createWorkspaceInviteAction, createWorkspaceUserAction } from "./actions";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const [rows, invites, query] = await Promise.all([getAccessOverviewRows(), getWorkspaceInviteRows(), searchParams]);
  const inviteUrl = query.invite ? `/invite/${query.invite}` : "";

  return (
    <QueuePageShell
      eyebrow="SaaS Platform"
      title="Access Control"
      description="Organization membership, platform roles, and workspace permissions for internal and future customer accounts."
    >
      <form action={createWorkspaceUserAction} className="panel form-stack section-actions">
        <h2>Create Workspace User</h2>
        <p className="muted">Create an account for the currently selected organization. Messages are not sent automatically.</p>
        <div className="filter-bar">
          <label>
            Name
            <input name="name" placeholder="Jane Operator" required />
          </label>
          <label>
            Email
            <input name="email" type="email" placeholder="jane@example.com" required />
          </label>
          <label>
            Temporary password
            <input name="password" type="password" minLength={8} required />
          </label>
          <label>
            Role
            <select name="role" defaultValue="operator">
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <button className="button" type="submit">
            Create user
          </button>
        </div>
      </form>
      <form action={createWorkspaceInviteAction} className="panel form-stack section-actions">
        <h2>Create Invite Link</h2>
        <p className="muted">Generate an invite link for a customer or teammate. The app does not email it automatically.</p>
        {inviteUrl ? (
          <label>
            New invite link
            <input readOnly value={inviteUrl} />
          </label>
        ) : null}
        <div className="filter-bar">
          <label>
            Email
            <input name="inviteEmail" type="email" placeholder="client@example.com" required />
          </label>
          <label>
            Role
            <select name="inviteRole" defaultValue="viewer">
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <button className="button" type="submit">
            Create invite
          </button>
        </div>
      </form>
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
            key: "organization",
            label: "Organization",
            render: (row) => (
              <>
                <strong>{row.tenantName}</strong>
                <span className="muted">{row.tenantSlug}</span>
              </>
            )
          },
          { key: "platformRole", label: "Platform", render: (row) => <span className="pill">{row.platformRole}</span> },
          { key: "tenantRole", label: "Workspace Role", render: (row) => <span className="pill">{row.tenantRole}</span> },
          { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
          { key: "description", label: "Permission Scope", render: (row) => row.roleDescription }
        ]}
      />
      <section className="panel section-actions">
        <h2>Invite Links</h2>
        <QueueTable<WorkspaceInviteRow>
          rows={invites}
          columns={[
            { key: "email", label: "Email", render: (row) => <><strong>{row.email}</strong><span className="muted">{row.inviteLink}</span></> },
            { key: "role", label: "Role", render: (row) => <span className="pill">{row.role}</span> },
            { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
            { key: "expires", label: "Expires", render: (row) => row.expiresAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(row.expiresAt)) : "No expiry" }
          ]}
        />
      </section>
    </QueuePageShell>
  );
}
