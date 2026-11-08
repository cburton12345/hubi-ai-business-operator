import { ActionStatusButton } from "@/components/forms/ActionStatusButton";
import { completeLocalPasswordReset } from "./actions";

export default async function LocalPasswordResetPage({ params,searchParams }: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ token },query] = await Promise.all([params,searchParams]);
  const spanish = query.lang === "es";
  return <main className="page-shell" lang={spanish ? "es-US" : "en-US"}>
    <section className="workspace auth-workspace"><div>
      <p className="eyebrow">{spanish ? "Recuperación segura" : "Secure recovery"}</p>
      <h1>{spanish ? "Elija una contraseña nueva." : "Choose a new password."}</h1>
      <p className="muted">{spanish ? "Este enlace solo restablece la contraseña de su cuenta existente. No crea ni cambia acceso al espacio de trabajo." : "This link only resets your existing account password. It does not create or change workspace access."}</p>
    </div><form action={completeLocalPasswordReset} className="panel form-stack auth-panel">
      <input name="token" type="hidden" value={token} /><input name="lang" type="hidden" value={spanish ? "es" : "en"} />
      <label>{spanish ? "Contraseña nueva" : "New password"}<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label>{spanish ? "Confirme la contraseña" : "Confirm password"}<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></label>
      <ActionStatusButton pendingLabel={spanish ? "Guardando..." : "Saving..."}>{spanish ? "Guardar contraseña" : "Save password"}</ActionStatusButton>
    </form></section>
  </main>;
}
