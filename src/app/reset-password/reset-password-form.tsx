"use client";

import { useActionState } from "react";
import { requestPasswordReset, type ResetPasswordState } from "@/app/reset-password/actions";

const initialState: ResetPasswordState = {
  status: "idle",
  message: ""
};

export function ResetPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <form action={formAction} className="panel form-stack auth-panel">
      <h2>Email reset link</h2>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {state.message ? <p className={state.status === "error" || state.status === "not_ready" ? "form-error" : "muted"}>{state.message}</p> : null}
      <button className="button" disabled={pending} type="submit">
        {pending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
