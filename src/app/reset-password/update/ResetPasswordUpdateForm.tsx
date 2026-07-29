"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export function ResetPasswordUpdateForm() {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("Checking reset link...");
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
        setMessage("Password reset needs Supabase auth configuration. Ask an admin to reset this account.");
        return;
      }
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error || !data.session) {
        setMessage("Open the reset link from your email again. This page needs the secure recovery token.");
        setReady(false);
        return;
      }
      setReady(true);
      setMessage("Enter a new password for this workspace account.");
    }
    checkSession();
    return () => {
      active = false;
    };
  }, [supabase]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (password.length < 8) {
      setMessage("Use at least 8 characters.");
      return;
    }

    if (password !== confirm) {
      setMessage("The passwords do not match.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setMessage("The reset link could not update the password. Request a fresh link and try again.");
      return;
    }

    await supabase.auth.signOut();
    window.location.assign("/login?reset=complete");
  }

  return (
    <form className="panel form-stack auth-panel" onSubmit={onSubmit}>
      <h2>Choose new password</h2>
      <p className={ready ? "muted" : "form-error"}>{message}</p>
      <label>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={8} disabled={!ready || saving} required />
      </label>
      <label>
        Confirm password
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} disabled={!ready || saving} required />
      </label>
      <button className="button" disabled={!ready || saving} type="submit">
        {saving ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}
