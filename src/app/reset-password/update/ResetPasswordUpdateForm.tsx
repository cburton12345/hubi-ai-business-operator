"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import type { WorkerLocale } from "@/lib/employee/worker-locale";

export function ResetPasswordUpdateForm({ locale, fieldMode }: { locale: WorkerLocale; fieldMode: boolean }) {
  const router = useRouter();
  const spanish = fieldMode && locale === "es";
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState(spanish ? "Verificando el enlace..." : "Checking reset link...");
  const [saving, setSaving] = useState(false);
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key);
  }, []);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      if (!supabase) {
        setMessage(spanish ? "El restablecimiento necesita configuración de autenticación. Pida a un administrador que restablezca esta cuenta." : "Password reset needs Supabase auth configuration. Ask an admin to reset this account.");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) {
        setMessage(spanish ? "Abra de nuevo el enlace de su correo. Esta página necesita el token seguro de recuperación." : "Open the reset link from your email again. This page needs the secure recovery token.");
        setReady(false);
        return;
      }
      setReady(true);
      setMessage(spanish ? "Ingrese una nueva contraseña para esta cuenta." : "Enter a new password for this workspace account.");
    }
    checkSession();
    return () => {
      active = false;
    };
  }, [spanish, supabase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (password.length < 8) {
      setMessage(spanish ? "Use al menos 8 caracteres." : "Use at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setMessage(spanish ? "Las contraseñas no coinciden." : "The passwords do not match.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setMessage(spanish ? "El enlace no pudo actualizar la contraseña. Solicite uno nuevo e inténtelo otra vez." : "The reset link could not update the password. Request a fresh link and try again.");
      return;
    }

    await supabase.auth.signOut();
    router.replace(fieldMode ? `/login?mode=field&next=/employee&reset=complete${spanish ? "&lang=es" : ""}` : "/login?reset=complete");
  }

  return (
    <form className="panel form-stack auth-panel" onSubmit={onSubmit}>
      <h2>{spanish ? "Elegir nueva contraseña" : "Choose new password"}</h2>
      <p className={ready ? "muted" : "form-error"}>{message}</p>
      <label>
        {spanish ? "Nueva contraseña" : "New password"}
        <input name="password" type="password" autoComplete="new-password" minLength={8} disabled={!ready || saving} required />
      </label>
      <label>
        {spanish ? "Confirmar contraseña" : "Confirm password"}
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} disabled={!ready || saving} required />
      </label>
      <button className="button" disabled={!ready || saving} type="submit">
        {saving ? (spanish ? "Guardando..." : "Saving...") : (spanish ? "Guardar nueva contraseña" : "Save new password")}
      </button>
    </form>
  );
}
