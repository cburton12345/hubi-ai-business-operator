import Link from "next/link";
import { ResetPasswordUpdateForm } from "@/app/reset-password/update/ResetPasswordUpdateForm";
import { workerLocale, withWorkerLocale } from "@/lib/employee/worker-locale";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";

export default async function ResetPasswordUpdatePage({ searchParams }: { searchParams: Promise<{ lang?: string; mode?: string }> }) {
  const params = await searchParams;
  const fieldMode = params.mode === "field";
  const locale = workerLocale(params.lang);
  const spanish = fieldMode && locale === "es";
  return (
    <main className="page-shell" lang={fieldMode && locale === "es" ? "es-US" : "en-US"}>
      {fieldMode ? <WorkerDocumentLanguage language={locale} /> : null}
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">{spanish ? "Restablecimiento seguro" : "Secure Reset"}</p>
          <h1>{spanish ? "Elija una nueva contraseña." : "Set a new password."}</h1>
          <p className="muted">{spanish ? "Esta página solo funciona desde el enlace enviado a su correo electrónico." : "This page only works from the reset link sent to your email."}</p>
          <div className="button-row">
            <Link className="button secondary-button" href={withWorkerLocale(fieldMode ? "/login?mode=field&next=/employee" : "/login", locale)}>
              {spanish ? "Volver al inicio de sesión" : "Back to sign in"}
            </Link>
          </div>
        </div>
        <ResetPasswordUpdateForm locale={locale} fieldMode={fieldMode} />
      </section>
    </main>
  );
}
