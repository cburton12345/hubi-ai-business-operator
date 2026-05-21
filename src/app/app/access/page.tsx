import { QueuePageShell } from "@/components/admin/QueuePageShell";
import { QueueTable } from "@/components/admin/QueueTable";
import { getAccessOverviewRows, getBrandAccessOptions, getBrandAccessRows, type AccessOverviewRow, type BrandAccessRow } from "@/lib/auth/get-access-overview";
import { getWorkspaceInviteRows, type WorkspaceInviteRow } from "@/lib/auth/get-workspace-invites";
import { createWorkspaceInviteAction, createWorkspaceUserAction, grantBrandAccessAction } from "./actions";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const [rows, invites, brandAccessRows, options, query] = await Promise.all([
    getAccessOverviewRows(),
    getWorkspaceInviteRows(),
    getBrandAccessRows(),
    getBrandAccessOptions(),
    searchParams
  ]);
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
      <section className="panel section-actions form-stack">
        <h2>Brand Access Rules</h2>
        <p className="muted">Restrict or prepare brand-specific access inside this organization. Workspace owners and admins still retain full control.</p>
        <form action={grantBrandAccessAction} className="filter-bar">
          <label>
            Brand
            <select name="brandId" required>
              <option value="">Select brand</option>
              {options.brands.map((brand) => (
                <option key={brand.id} value={brand.id}>{brand.label}</option>
              ))}
            </select>
          </label>
          <label>
            User
            <select name="userId" required>
              <option value="">Select user</option>
              {options.users.map((user) => (
                <option key={user.id} value={user.id}>{user.label}</option>
              ))}
            </select>
          </label>
          <label>
            Brand role
            <select name="brandRole" defaultValue="operator">
              <option value="owner">owner</option>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="viewer">viewer</option>
            </select>
          </label>
          <label>
            Notes
            <input name="notes" placeholder="Optional scope notes" />
          </label>
          <button className="button" type="submit">Grant access</button>
        </form>
        <QueueTable<BrandAccessRow>
          rows={brandAccessRows}
          columns={[
            { key: "brand", label: "Brand", render: (row) => <><strong>{row.brandName}</strong><span className="muted">{row.brandSlug}</span></> },
            { key: "user", label: "User", render: (row) => <><strong>{row.userName}</strong><span className="muted">{row.userEmail}</span></> },
            { key: "role", label: "Brand Role", render: (row) => <span className="pill">{row.role}</span> },
            { key: "status", label: "Status", render: (row) => <span className="pill">{row.status}</span> },
            { key: "notes", label: "Notes", render: (row) => row.notes || "No notes" }
          ]}
        />
      </section>
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
