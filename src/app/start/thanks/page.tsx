import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

export default async function StartThanksPage({
  searchParams
}: {
  searchParams: Promise<{ workspace?: string; workspaceSlug?: string; invite?: string }>;
}) {
  const params = await searchParams;
  const inviteUrl = params.invite ? `/invite/${params.invite}` : "";
  const workspaceCreated = params.workspace === "created";
  const workspaceReused = params.workspace === "reused";
  const existingAccount = params.workspace === "existing";
  const workspacePending = params.workspace === "pending";

  return (
    <main className="public-page">
      <section className="public-shell">
        <nav className="public-nav">
          <Link className="brand-mark" href="/">
            Ferocity
          </Link>
          <div>
            <Link href="/demo">Demo</Link>
            <Link href="/features">Features</Link>
            <Link href="/automations">Automations</Link>
            <Link href="/pricing">Plans</Link>
            <Link href="/login">Sign in</Link>
          </div>
        </nav>

        <section className="public-hero">
          <p className="eyebrow">Request received</p>
          <h1>
            {workspaceCreated
              ? "Your Ferocity workspace is ready to claim."
              : workspaceReused
                ? "Your existing Ferocity invite was refreshed."
                : existingAccount
                  ? "That email already has a Ferocity workspace."
                  : "Good. Your Ferocity setup request is in."}
          </h1>
          <p className="muted">
            This request does not send customer messages, publish content, change ads, sync outside accounts, or start billing.
          </p>
          <div className="button-row">
            {inviteUrl ? (
              <Link className="button" href={inviteUrl}>
                Claim workspace
              </Link>
            ) : existingAccount ? (
              <Link className="button" href="/login">
                Sign in
              </Link>
            ) : (
              <Link className="button" href="/demo/tour">
                Keep touring Ferocity
              </Link>
            )}
            <Link className="button secondary-button" href="/automations">
              View automations
            </Link>
          </div>
        </section>

        <section className="panel">
          <div className="list-row flush-row">
            <div>
              <h2>Next step</h2>
              <p className="muted">
                {workspaceCreated
                  ? `Use the invite link to create your owner account${params.workspaceSlug ? ` for ${params.workspaceSlug}` : ""}. The workspace starts locked down and setup-first.`
                  : workspaceReused
                    ? `Use the refreshed invite link to claim the existing workspace${params.workspaceSlug ? ` for ${params.workspaceSlug}` : ""}. Ferocity did not create a duplicate tenant.`
                    : existingAccount
                      ? `Sign in with that email${params.workspaceSlug ? ` for ${params.workspaceSlug}` : ""}. Ferocity did not create a duplicate tenant.`
                  : workspacePending
                    ? "The request was saved for review. Ferocity will create an invite from Access Requests."
                    : "Ferocity will review the request, choose a sensible starting point, and create an invite or guided setup path."}
              </p>
              {inviteUrl ? (
                <label className="form-stack">
                  Invite link
                  <input readOnly value={inviteUrl} />
                </label>
              ) : null}
            </div>
            <CheckCircle2 size={24} />
          </div>
        </section>
      </section>
    </main>
  );
}
