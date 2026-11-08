import Link from "next/link";
import { redirect } from "next/navigation";
import { getInviteByToken } from "@/lib/auth/get-invite-by-token";
import { acceptInviteAction } from "./actions";
import { workerLocale, withWorkerLocale } from "@/lib/employee/worker-locale";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";

export default async function InvitePage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const invite = await getInviteByToken(token);

  if (!invite) {
    redirect(query.lang === "es" ? "/login?mode=field&next=/employee&error=invite&lang=es" : "/login?error=invite");
  }
  const locale = invite.invitePurpose === "employee"
    ? workerLocale(query.lang ?? invite.preferredLanguage)
    : "en";
  const spanish = locale === "es";

  return (
    <main className="page-shell" lang={locale === "es" ? "es-US" : "en-US"}>
      {invite.invitePurpose === "employee" ? <WorkerDocumentLanguage language={locale} /> : null}
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">{invite.invitePurpose === "employee" ? (spanish ? "Acceso del empleado" : "Employee access") : "Workspace invite"}</p>
          <h1>{invite.invitePurpose === "employee" ? (spanish ? `Abra su aplicación de trabajo de ${invite.workspaceName}` : `Open your ${invite.workspaceName} work app`) : `Join ${invite.workspaceName}`}</h1>
          <p className="muted">
            {invite.invitePurpose === "employee"
              ? (spanish
                  ? `Cree el inicio de sesión seguro para ${invite.email}. Esto conecta únicamente su propio horario y sus registros de campo.`
                  : `Create the secure login for ${invite.email}. This connects only your own schedule and field records.`)
              : `Your email address (${invite.email}) will be your username. Create your private password below. Your role will be ${invite.role}.`}
          </p>
        </div>
        <form action={acceptInviteAction} className="panel form-stack auth-panel">
          <input name="token" type="hidden" value={token} />
          <input name="lang" type="hidden" value={locale} />
          <label>
            {spanish ? "Nombre" : "Name"}
            <input name="name" autoComplete="name" required />
          </label>
          <label>
            {spanish ? "Contraseña" : "Password"}
            <input name="password" type="password" minLength={8} autoComplete="new-password" required />
          </label>
          <label>
            {spanish ? "Confirmar contraseña" : "Confirm password"}
            <input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required />
          </label>
          <button className="button" type="submit">{invite.invitePurpose === "employee" ? (spanish ? "Crear inicio de sesión del empleado" : "Create employee login") : "Create account and open my workspace"}</button>
          <Link className="button secondary-button" href={withWorkerLocale(invite.invitePurpose === "employee" ? "/login?mode=field&next=/employee" : "/login", locale)}>{spanish ? "Volver al inicio de sesión" : "Back to login"}</Link>
        </form>
      </section>
    </main>
  );
}
