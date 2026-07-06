import { NextResponse } from "next/server";
import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";
import { env } from "@/lib/env";

const payloadSchema = z.object({
  tenantId: z.string().uuid(),
  workerId: z.string().uuid().optional(),
  assignmentId: z.string().uuid().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracyMeters: z.number().optional(),
  locationLabel: z.string().max(220).optional(),
  pingSource: z.enum(["manual", "gps", "qr", "vehicle_integration"]).default("gps"),
  alertStatus: z.enum(["normal", "late", "off_route", "missing_ping", "needs_review"]).default("normal"),
  metadata: z.record(z.string(), z.unknown()).optional()
});

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

function validToken(request: Request) {
  const expected = env.WORKFORCE_INTAKE_TOKEN ?? env.OWNER_COMMAND_CENTER_TOKEN;
  return Boolean(expected && bearer(request) === expected);
}

export async function POST(request: Request) {
  if (!validToken(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid location payload" }, { status: 400 });
  }

  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.operations_location_pings (
      tenant_id, worker_id, assignment_id, latitude, longitude, accuracy_meters,
      location_label, ping_source, alert_status, metadata_json
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    returning id
    `,
    [
      parsed.data.tenantId,
      parsed.data.workerId ?? null,
      parsed.data.assignmentId ?? null,
      parsed.data.latitude ?? null,
      parsed.data.longitude ?? null,
      parsed.data.accuracyMeters ?? null,
      parsed.data.locationLabel ?? null,
      parsed.data.pingSource,
      parsed.data.alertStatus,
      JSON.stringify({ ...(parsed.data.metadata ?? {}), source: "operations_workforce_api" })
    ]
  );

  return NextResponse.json({ ok: true, id: result?.rows[0]?.id ?? null });
}
