import Link from "next/link";
import { notFound } from "next/navigation";
import { getInviteByToken } from "@/lib/auth/get-invite-by-token";
import { acceptInviteAction } from "./actions";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getInviteByToken(token);

  if (!invite) {
    notFound();
  }

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Workspace Invite</p>
          <h1>Join {invite.workspaceName}</h1>
          <p className="muted">
            Create your account for {invite.email}. Your role will be {invite.role}.
          </p>
        </div>
        <form action={acceptInviteAction} className="panel form-stack auth-panel">
          <input name="token" type="hidden" value={token} />
          <label>
            Name
            <input name="name" autoComplete="name" required />
          </label>
          <label>
            Password
            <input name="password" type="password" minLength={8} autoComplete="new-password" required />
          </label>
          <button className="button" type="submit">Accept invite</button>
          <Link className="button secondary-button" href="/login">Back to login</Link>
        </form>
      </section>
    </main>
  );
}
