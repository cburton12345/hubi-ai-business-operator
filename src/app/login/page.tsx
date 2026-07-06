import { loginAdmin, loginUser } from "@/app/login/actions";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string }>;
}) {
  const params = await searchParams;
  const nextPath = params.next ?? "/app";

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">Workspace Access</p>
          <h1>Sign in to Ferocity.</h1>
          <p className="muted">Use your business account. Need access first? Start from the public site.</p>
          <div className="button-row">
            <a className="button secondary-button" href="/start?source=login">
              Request access
            </a>
            <a className="button secondary-button" href="/install">
              Install app
            </a>
          </div>
        </div>

        <form action={loginUser} className="panel form-stack auth-panel">
          <h2>Workspace sign in</h2>
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
          <button className="button" type="submit">
            Continue
          </button>
          <a className="mini-button" href="/reset-password">
            Forgot password?
          </a>
        </form>

        <form action={loginAdmin} className="panel form-stack auth-panel">
          <h2>Emergency admin access</h2>
          <input name="next" type="hidden" value={nextPath} />
          <label>
            Access token
            <input name="token" type="password" autoComplete="current-password" required />
          </label>
          {params.error === "1" ? <p className="form-error">Invalid access token.</p> : null}
          <button className="button" type="submit">
            Continue with token
          </button>
        </form>
      </section>
    </main>
  );
}
