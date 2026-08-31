import { loginUser } from "@/app/login/actions";
import { ActionStatusButton } from "@/components/forms/ActionStatusButton";
import Link from "next/link";
import { safePostLoginDestination } from "@/lib/auth/post-login-destination";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const fieldMode = params.mode === "field" || params.next?.startsWith("/employee");
  const nextPath = safePostLoginDestination(fieldMode ? params.next ?? "/employee" : params.next);

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Choose how you are working</p>
          <h1>{fieldMode ? "Open your field team day." : "Run the business with Ferocity."}</h1>
          <p className="muted">The same secure account can use both views when the company gives it permission. Choosing a view does not permanently label you as an owner or employee.</p>
          <div className="grid section-actions">
            <Link className={`panel span-6 ${fieldMode ? "" : "featured-panel"}`} href="/login?mode=business&next=/app">
              <strong>Manage the business</strong>
              <span className="muted">Customers, jobs, money, team, marketing, decisions, and Ask Ferocity.</span>
            </Link>
            <Link className={`panel span-6 ${fieldMode ? "featured-panel" : ""}`} href="/login?mode=field&next=/employee">
              <strong>Field team</strong>
              <span className="muted">Today’s schedule, hours, location, mileage, costs, photos, and completed work.</span>
            </Link>
          </div>
          <div className="button-row">
            <a className="button secondary-button" href="/start?source=login">
              Start a business account
            </a>
            <a className="button secondary-button" href="/employee/join">
              Request field team access
            </a>
            <a className="button secondary-button" href="/install">
              Install app
            </a>
          </div>
        </div>

        <form action={loginUser} className="panel form-stack auth-panel">
          <h2>{fieldMode ? "Field team sign in" : "Workspace sign in"}</h2>
          <input name="next" type="hidden" value={nextPath} />
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
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
