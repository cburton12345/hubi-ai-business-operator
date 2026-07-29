import { randomUUID } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";

function safeMetadata(metadata: Record<string, unknown> = {}) {
  const blocked = new Set(["authorization", "cookie", "password", "secret", "token", "apikey", "api_key", "rawbody", "payload"]);
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      blocked.has(key.toLowerCase()) ? "[redacted]" : value
    ])
  );
}

export async function logAppError(input: {
  source: string;
  message: string;
  severity?: "info" | "warning" | "error" | "critical";
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
  category?: string;
  retryable?: boolean;
  correlationId?: string;
}) {
  const correlationId = input.correlationId ?? randomUUID();
  await queryPostgres(
    `
    insert into public.app_error_events (tenant_id, source, severity, message, metadata_json)
    values ($1, $2, $3, $4, $5::jsonb)
    `,
    [
      input.tenantId ?? null,
      input.source,
      input.severity ?? "error",
      input.message,
      JSON.stringify({
        ...safeMetadata(input.metadata),
        correlationId,
        category: input.category ?? "application",
        retryable: input.retryable ?? false,
        recordedAt: new Date().toISOString()
      })
    ]
  );
  return correlationId;
}

export async function safeLogAppError(input: Parameters<typeof logAppError>[0]) {
  try {
    return await logAppError(input);
  } catch {
    return input.correlationId ?? randomUUID();
  }
}
