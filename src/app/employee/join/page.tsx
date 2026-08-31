import Link from "next/link";

export default async function EmployeeJoinPage({
  searchParams
}: {
  searchParams: Promise<{ company?: string; requested?: string; error?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const spanish = params.lang === "es";
  const requested = params.requested === "1";
  const error = params.error;

  return (
    <main className="page-shell">
      <section className="workspace auth-workspace">
        <div>
          <p className="eyebrow">{spanish ? "Acceso del equipo de campo" : "Field team access"}</p>
          <h1>{spanish ? "Conéctese con su empresa" : "Connect to your company"}</h1>
          <p className="muted">
            {spanish
              ? "Envíe una solicitud segura. Su empresa debe aprobarla antes de que pueda ver horarios o información del trabajo."
              : "Send a secure request. Your company must approve it before you can see schedules or work information."}
          </p>
        </div>

        {requested ? (
          <section className="success-panel auth-panel">
            <h2>{spanish ? "Solicitud enviada" : "Request sent"}</h2>
            <p>{spanish ? "Notificamos a su empresa. Recibirá por correo electrónico su enlace privado después de la aprobación." : "We notified your company. You will receive your private account link by email after approval."}</p>
            <Link className="button secondary-button" href="/login">{spanish ? "Volver al inicio de sesión" : "Back to sign in"}</Link>
          </section>
        ) : (
          <form action="/api/public/employee-access" method="post" className="panel form-stack auth-panel">
            {error ? <p className="notice warning">{error === "company" ? (spanish ? "No encontramos ese código de empresa. Verifíquelo con su empleador." : "We could not find that company code. Check it with your employer.") : (spanish ? "No pudimos enviar la solicitud. Revise los datos e inténtelo de nuevo." : "We could not send the request. Check the information and try again.")}</p> : null}
            <label>{spanish ? "Código de empresa" : "Company code"}<input name="companyCode" defaultValue={params.company ?? ""} autoCapitalize="none" required /></label>
            <label>{spanish ? "Su nombre" : "Your name"}<input name="name" autoComplete="name" required /></label>
            <label>{spanish ? "Correo electrónico de trabajo" : "Work email"}<input name="email" type="email" autoComplete="email" required /></label>
            <label>{spanish ? "Teléfono (opcional)" : "Phone (optional)"}<input name="phone" type="tel" autoComplete="tel" /></label>
            <label>{spanish ? "Idioma" : "Language"}
              <select name="preferredLanguage" defaultValue={spanish ? "es" : "en"}>
                <option value="en">English</option><option value="es">Español</option>
              </select>
            </label>
            <label className="sr-only" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
            <p className="field-help">{spanish ? "La solicitud no concede acceso por sí sola. Un usuario autorizado de la empresa debe aprobarla." : "The request does not grant access by itself. An authorized company user must approve it."}</p>
            <button className="button" type="submit">{spanish ? "Solicitar acceso" : "Request field team access"}</button>
            <Link className="button secondary-button" href="/login">{spanish ? "Ya tengo una cuenta" : "I already have an account"}</Link>
          </form>
        )}
      </section>
    </main>
  );
}
