import { queryPostgres } from "@/lib/db/postgres";

export async function logAppError(input: {
  source: string;
  message: string;
  severity?: "info" | "warning" | "error" | "critical";
  tenantId?: string | null;
  metadata?: Record<string, unknown>;
}) {
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
      JSON.stringify(input.metadata ?? {})
    ]
  );
}
