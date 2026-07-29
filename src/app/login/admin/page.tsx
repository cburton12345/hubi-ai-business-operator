import Link from "next/link";
import { loginAdmin } from "@/app/login/actions";
import { ActionStatusButton } from "@/components/forms/ActionStatusButton";

export default async function AdminLoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next ?? "/app";

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Restricted Access</p>
          <h1>Platform recovery</h1>
          <p className="muted">For authorized Ferocity platform recovery only.</p>
        </div>

        <form action={loginAdmin} className="panel form-stack auth-panel">
          <input name="next" type="hidden" value={nextPath} />
          <label>
            Recovery token
            <input name="token" type="password" autoComplete="current-password" required />
          </label>
          {params.error === "1" ? <p className="form-error">That recovery token is not valid.</p> : null}
          <ActionStatusButton pendingLabel="Checking...">Continue</ActionStatusButton>
          <Link className="mini-button" href="/login">Back to sign in</Link>
        </form>
      </section>
    </main>
  );
}
