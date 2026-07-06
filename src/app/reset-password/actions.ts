"use server";

import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { env, hasSupabaseBrowserConfig } from "@/lib/env";
import { logAppError } from "@/lib/observability/log-error";

const resetSchema = z.object({
  email: z.string().email()
});

async function getOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  if (env.FEROCITY_APP_URL) return env.FEROCITY_APP_URL;
  if (host) return `${proto}://${host}`;
  return "https://ferocity.live";
}

export type ResetPasswordState = {
  status: "idle" | "sent" | "error" | "not_ready";
  message: string;
};

export async function requestPasswordReset(
  _state: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const parsed = resetSchema.safeParse({
    email: formData.get("email")
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address."
    };
  }

  if (!hasSupabaseBrowserConfig()) {
    await logAppError({
      source: "reset-password",
      message: "Password reset requested before Supabase public auth config was available.",
      severity: "info"
    });
    return {
      status: "not_ready",
      message: "Password reset is not connected yet. Ask an admin to reset this account."
    };
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email.toLowerCase(), {
    redirectTo: `${await getOrigin()}/reset-password/update`
  });

  if (error) {
    await logAppError({
      source: "reset-password",
      message: "Supabase password reset email failed.",
      severity: "warning",
      metadata: {
        reason: error.message
      }
    });
  }

  return {
    status: "sent",
    message: "If that email has access, a reset link is on the way."
  };
}
