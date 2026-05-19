import { loginAdmin, loginUser } from "@/app/login/actions";

export default async function LoginPage({
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
          <p className="eyebrow">Workspace Access</p>
          <h1>Sign in to Hubi Operator.</h1>
          <p className="muted">Use a workspace account. The admin token remains available for emergency internal access.</p>
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
          <button className="button" type="submit">
            Continue
          </button>
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
