import { getResendEmailReadiness, sendEmailWithResend } from "@/lib/email/resend";

export type EmailSendInput = {
  tenantId: string;
  to: string;
  subject: string;
  body: string;
  idempotencyKey: string;
};

export type EmailSendResult =
  | { ok: true; providerKey: string; providerMessageId: string | null }
  | { ok: false; providerKey: string; status: number; error: string; retryable: boolean };

export interface EmailProvider {
  providerKey: string;
  displayName: string;
  getStatus(): { ready: boolean; missing: string[]; status: "ready" | "not_configured" | "planned" | "disabled" };
  sendEmail(input: EmailSendInput): Promise<EmailSendResult>;
}

const resendProvider: EmailProvider = {
  providerKey: "resend_email",
  displayName: "Resend Email",
  getStatus() {
    const readiness = getResendEmailReadiness();
    return {
      ready: readiness.ready,
      missing: readiness.missing,
      status: readiness.ready ? "ready" : "not_configured"
    };
  },
  async sendEmail(input) {
    const result = await sendEmailWithResend({
      to: input.to,
      subject: input.subject,
      text: input.body,
      queueId: input.idempotencyKey,
      tenantId: input.tenantId
    });
    return result.ok
      ? {
          ok: true,
          providerKey: "resend_email",
          providerMessageId: result.providerMessageId
        }
      : {
          ok: false,
          providerKey: "resend_email",
          status: result.status,
          error: result.error,
          retryable: result.status === 0 || result.status >= 500
        };
  }
};

const providers = new Map<string, EmailProvider>([
  [resendProvider.providerKey, resendProvider]
]);

export function getEmailProvider(providerKey: string) {
  return providers.get(providerKey) ?? null;
}

export function listEmailProviders() {
  return [...providers.values()];
}
