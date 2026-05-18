import { loginAdmin } from "@/app/login/actions";

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
          <p className="eyebrow">Admin Access</p>
          <h1>Sign in to the operator dashboard.</h1>
          <p className="muted">Use the admin access token configured for this environment.</p>
        </div>

        <form action={loginAdmin} className="panel form-stack auth-panel">
          <input name="next" type="hidden" value={nextPath} />
          <label>
            Access token
            <input name="token" type="password" autoComplete="current-password" required />
          </label>
          {params.error ? <p className="form-error">Invalid access token.</p> : null}
          <button className="button" type="submit">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
