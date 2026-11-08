import Link from "next/link";
import { ResetPasswordForm } from "@/app/reset-password/reset-password-form";
import { workerLocale, withWorkerLocale } from "@/lib/employee/worker-locale";
import { WorkerDocumentLanguage } from "@/components/employee/WorkerDocumentLanguage";

export default async function ResetPasswordPage({
  searchParams
}: {
  searchParams: Promise<{ lang?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const fieldMode = params.mode === "field";
  const locale = workerLocale(params.lang);
  const spanish = fieldMode && locale === "es";
  return (
    <main className="page-shell" lang={fieldMode && locale === "es" ? "es-US" : "en-US"}>
      {fieldMode ? <WorkerDocumentLanguage language={locale} /> : null}
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">{spanish ? "Recuperación de la cuenta" : "Account Recovery"}</p>
          <h1>{spanish ? "Restablezca su contraseña de Ferocity." : "Reset your Ferocity password."}</h1>
          <p className="muted">
            {spanish ? "Ingrese el correo electrónico vinculado a su cuenta de Ferocity. Si la cuenta puede recibir correo, Ferocity enviará un enlace seguro." : "Enter the email tied to your Ferocity account. If the account can receive email, Ferocity will send a secure reset link."}
          </p>
          <div className="button-row">
            <Link className="button secondary-button" href={withWorkerLocale(fieldMode ? "/login?mode=field&next=/employee" : "/login", locale)}>
              {spanish ? "Volver al inicio de sesión" : "Back to sign in"}
            </Link>
          </div>
        </div>
        <ResetPasswordForm locale={locale} fieldMode={fieldMode} />
      </section>
    </main>
  );
}
