"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword,hashSessionToken } from "@/lib/auth/password";
import { consumeLocalPasswordReset } from "@/lib/auth/password-reset-token";
import { withPostgresTransactionResult } from "@/lib/db/postgres";

const resetSchema = z.object({
  token: z.string().min(20),password: z.string().min(8).max(200),confirmPassword: z.string().min(8).max(200),lang: z.enum(["en","es"]).optional()
}).refine((value) => value.password === value.confirmPassword,{ path: ["confirmPassword"],message: "Passwords must match." });

export async function completeLocalPasswordReset(formData: FormData) {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),password: formData.get("password"),confirmPassword: formData.get("confirmPassword"),lang: formData.get("lang")
  });
  const spanish = formData.get("lang") === "es";
  if (!parsed.success) redirect(`/reset-password?error=invalid${spanish ? "&mode=field&lang=es" : ""}`);
  const credential = hashPassword(parsed.data.password);
  const result = await withPostgresTransactionResult((client) => consumeLocalPasswordReset(client,{
    tokenHash: hashSessionToken(parsed.data.token),passwordHash: credential.hash,
    passwordSalt: credential.salt,passwordIterations: credential.iterations
  }));
  if (!result.ok || result.value.outcome !== "updated") {
    redirect(`/reset-password?error=expired${spanish ? "&mode=field&lang=es" : ""}`);
  }
  redirect(`/login?reset=complete${spanish ? "&mode=field&next=/employee&lang=es" : ""}`);
}
