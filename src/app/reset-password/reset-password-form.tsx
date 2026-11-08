"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ResetPasswordState } from "@/app/reset-password/actions";
import type { WorkerLocale } from "@/lib/employee/worker-locale";

const initialState: ResetPasswordState = {
  status: "idle",
  message: ""
};

export function ResetPasswordForm({ locale, fieldMode }: { locale: WorkerLocale; fieldMode: boolean }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);
  const spanish = fieldMode && locale === "es";

  return (
    <form action={formAction} className="panel form-stack auth-panel">
      <h2>{spanish ? "Enviar enlace de restablecimiento" : "Email reset link"}</h2>
      <input name="lang" type="hidden" value={locale} />
      <input name="mode" type="hidden" value={fieldMode ? "field" : "business"} />
      <label>
        {spanish ? "Correo electrónico" : "Email"}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {state.message ? <p className={state.status === "error" || state.status === "not_ready" ? "form-error" : "muted"}>{state.message}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? (spanish ? "Enviando..." : "Sending...") : (spanish ? "Enviar enlace" : "Send reset link")}
      </button>
    </form>
  );
}
