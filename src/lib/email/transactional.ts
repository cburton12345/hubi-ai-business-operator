import { env } from "@/lib/env";
import { sendEmailWithResend } from "@/lib/email/resend";
import { logAppError } from "@/lib/observability/log-error";

export type TransactionalEmailResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; skipped: boolean; error: string };

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
  tenantId?: string | null;
  eventKey: string;
  metadata?: Record<string, unknown>;
}): Promise<TransactionalEmailResult> {
  const result = await sendEmailWithResend({
    to: input.to,
    subject: input.subject,
    text: input.text,
    queueId: `transactional:${input.eventKey}`.slice(0, 180),
    tenantId: input.tenantId ?? "platform"
  });

  if (!result.ok) {
    await logAppError({
      source: `email.transactional.${input.eventKey}`,
      severity: result.status === 0 ? "warning" : "error",
      message: result.error,
      tenantId: input.tenantId,
      metadata: {
        to: input.to,
        subject: input.subject,
        skipped: result.status === 0,
        providerStatus: result.status,
        ...(input.metadata ?? {})
      }
    });

    return {
      ok: false,
      skipped: result.status === 0,
      error: result.error
    };
  }

  return {
    ok: true,
    providerMessageId: result.providerMessageId
  };
}

export async function sendFerocityNotificationEmail(input: {
  subject: string;
  text: string;
  eventKey: string;
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!env.FEROCITY_NOTIFY_EMAIL) {
    await logAppError({
      source: `email.notification.${input.eventKey}`,
      severity: "info",
      message: "Admin notification email skipped because FEROCITY_NOTIFY_EMAIL is not configured.",
      tenantId: input.tenantId,
      metadata: input.metadata
    });
    return { ok: false as const, skipped: true, error: "FEROCITY_NOTIFY_EMAIL is not configured." };
  }

  return sendTransactionalEmail({
    to: env.FEROCITY_NOTIFY_EMAIL,
    subject: input.subject,
    text: input.text,
    tenantId: input.tenantId,
    eventKey: input.eventKey,
    metadata: input.metadata
  });
}
