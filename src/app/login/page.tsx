import { loginUser } from "@/app/login/actions";
import { ActionStatusButton } from "@/components/forms/ActionStatusButton";
import Link from "next/link";
import { safePostLoginDestination } from "@/lib/auth/post-login-destination";
import { workerLocale, withWorkerLocale } from "@/lib/employee/worker-locale";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string; next?: string; reset?: string; mode?: string; email?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const fieldMode = params.mode === "field" || params.next?.startsWith("/employee");
  const locale = workerLocale(params.lang);
  const spanish = fieldMode && locale === "es";
  const copy = spanish ? {
    eyebrow: "Inicio de sesión seguro",
    title: "Abra su jornada del equipo de campo.",
    description: "Inicie sesión para ver su horario, horas, ubicación, millas, gastos, fotos y trabajo terminado.",
    manage: "Administrar el negocio",
    install: "Instalar la aplicación",
    heading: "Inicio de sesión del equipo de campo",
    email: "Correo electrónico",
    password: "Contraseña",
    invalid: "El correo electrónico o la contraseña no son válidos.",
    invite: "La invitación ya no está disponible. Solicite un enlace nuevo a su empresa.",
    reset: "Contraseña actualizada. Inicie sesión con la nueva contraseña.",
    signing: "Iniciando sesión...",
    continue: "Continuar",
    forgot: "¿Olvidó su contraseña?"
  } : null;
  const nextPath = safePostLoginDestination(fieldMode ? params.next ?? "/employee" : params.next);

  return (
    <main className="page-shell" lang={fieldMode && locale === "es" ? "es-US" : "en-US"}>
      {fieldMode ? <WorkerDocumentLanguage language={locale} /> : null}
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">{copy?.eyebrow ?? "Secure sign in"}</p>
          <h1>{copy?.title ?? (fieldMode ? "Open your field team day." : "Open your Ferocity workspace.")}</h1>
          <p className="muted">
            {copy?.description ?? (fieldMode
              ? "Sign in to see your schedule, hours, location, mileage, costs, photos, and completed work."
              : "Sign in with the email and password you used when accepting your invitation. Ferocity will open the correct business automatically.")}
          </p>
          <div className="button-row">
            {fieldMode ? <Link className="mini-button" href="/login?mode=business&next=/app">{copy?.manage ?? "Manage the business instead"}</Link> : <Link className="mini-button" href="/login?mode=field&next=/employee">I need the field team view</Link>}
            <Link className="mini-button" href="/install">{copy?.install ?? "Install the app"}</Link>
          </div>
        </div>

        <form action={loginUser} className="panel form-stack auth-panel">
          <h2>{copy?.heading ?? (fieldMode ? "Field team sign in" : "Workspace sign in")}</h2>
          <input name="next" type="hidden" value={nextPath} />
          <input name="lang" type="hidden" value={locale} />
          <label>
            {copy?.email ?? "Email"}
            <input name="email" type="email" autoComplete="email" defaultValue={params.email ?? ""} required />
          </label>
          <label>
            {copy?.password ?? "Password"}
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {params.error === "credentials" ? <p className="form-error">{copy?.invalid ?? "Invalid email or password."}</p> : null}
          {params.error === "invite" ? <p className="form-error">{copy?.invite ?? "This invitation is no longer available. Ask your company for a new link."}</p> : null}
          {params.reset === "complete" ? <p className="muted">{copy?.reset ?? "Password updated. Sign in with the new password."}</p> : null}
          <ActionStatusButton pendingLabel={copy?.signing ?? "Signing in..."}>{copy?.continue ?? "Continue"}</ActionStatusButton>
          <Link className="mini-button" href={withWorkerLocale("/reset-password?mode=field", locale)}>
            {copy?.forgot ?? "Forgot password?"}
          </Link>
        </form>

      </section>
    </main>
  );
}
