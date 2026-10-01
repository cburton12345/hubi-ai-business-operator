import { loginUser } from "@/app/login/actions";
import { ActionStatusButton } from "@/components/forms/ActionStatusButton";
import Link from "next/link";
import { safePostLoginDestination } from "@/lib/auth/post-login-destination";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string; mode?: string; email?: string }>;
}) {
  const params = await searchParams;
  const fieldMode = params.mode === "field" || params.next?.startsWith("/employee");
  const nextPath = safePostLoginDestination(fieldMode ? params.next ?? "/employee" : params.next);

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Secure sign in</p>
          <h1>{fieldMode ? "Open your field team day." : "Open your Ferocity workspace."}</h1>
          <p className="muted">
            {fieldMode
              ? "Sign in to see your schedule, hours, location, mileage, costs, photos, and completed work."
              : "Sign in with the email and password you used when accepting your invitation. Ferocity will open the correct business automatically."}
          </p>
          <div className="button-row">
            {fieldMode ? <Link className="mini-button" href="/login?mode=business&next=/app">Manage the business instead</Link> : <Link className="mini-button" href="/login?mode=field&next=/employee">I need the field team view</Link>}
            <Link className="mini-button" href="/install">Install the app</Link>
          </div>
        </div>

        <form action={loginUser} className="panel form-stack auth-panel">
          <h2>{fieldMode ? "Field team sign in" : "Workspace sign in"}</h2>
          <input name="next" type="hidden" value={nextPath} />
          <label>
            Email
            <input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {params.error === "credentials" ? <p className="form-error">Invalid email or password.</p> : null}
          {params.reset === "complete" ? <p className="muted">Password updated. Sign in with the new password.</p> : null}
          <ActionStatusButton pendingLabel="Signing in...">Continue</ActionStatusButton>
          <a className="mini-button" href="/reset-password">
            Forgot password?
          </a>
        </form>

      </section>
    </main>
  );
}
