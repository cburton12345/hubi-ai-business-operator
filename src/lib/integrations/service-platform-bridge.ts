import { z } from "zod";
import { queryPostgres } from "@/lib/db/postgres";

export const servicePlatformProviders = ["jobber", "housecall_pro", "highlevel"] as const;
export type ServicePlatformProvider = typeof servicePlatformProviders[number];

const dataSchema = z.object({
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(60).optional(),
  message: z.string().trim().max(5000).optional(),
  title: z.string().trim().max(300).optional(),
  status: z.string().trim().max(80).optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  address: z.string().trim().max(500).optional(),
  customerExternalId: z.string().trim().max(300).optional()
});

export const servicePlatformEventSchema = z.object({
  eventId: z.string().trim().min(1).max(300),
  externalId: z.string().trim().min(1).max(300),
  objectType: z.enum(["contact", "lead", "job"]),
  operation: z.enum(["upsert", "delete"]).default("upsert"),
  data: dataSchema.default({})
});

export function normalizedServiceJobStatus(value: string | undefined) {
  const status = (value ?? "").toLowerCase().replaceAll(" ", "_");
  if (["scheduled", "dispatched", "en_route"].includes(status)) return "scheduled";
  if (["active", "in_progress", "started", "arrived"].includes(status)) return "in_progress";
  if (["completed", "closed", "done", "won"].includes(status)) return "completed";
  if (["canceled", "cancelled"].includes(status)) return "canceled";
  if (["lost", "declined"].includes(status)) return "lost";
  return "unscheduled";
}

function clean(value: string | undefined) {
  return value?.trim() || null;
}

async function mappedInternalId(connectionId: string, objectType: string, externalId: string) {
  const result = await queryPostgres<{ internal_id: string | null }>(
    "select internal_id from public.integration_object_mappings where connection_id=$1 and object_type=$2 and external_id=$3 and provider_deleted_at is null limit 1",
    [connectionId, objectType, externalId]
  );
  return result?.rows[0]?.internal_id ?? null;
}

async function mapObject(input: { tenantId: string; connectionId: string; providerKey: string; objectType: string; table: string; internalId: string; externalId: string }) {
  await queryPostgres(
    `insert into public.integration_object_mappings
     (tenant_id,connection_id,provider_key,object_type,internal_table,internal_id,external_id,ownership_mode,last_synced_at,metadata_json)
     values ($1,$2,$3,$4,$5,$6,$7,'provider',now(),'{"bridge":"middleware"}'::jsonb)
     on conflict (connection_id,object_type,external_scope,external_id) do update set
       internal_table=excluded.internal_table,internal_id=excluded.internal_id,provider_deleted_at=null,last_synced_at=now(),updated_at=now()`,
    [input.tenantId, input.connectionId, input.providerKey, input.objectType, input.table, input.internalId, input.externalId]
  );
}

async function upsertCustomer(input: { tenantId: string; connectionId: string; providerKey: string; externalId: string; data: z.infer<typeof dataSchema> }) {
  const mapped = await mappedInternalId(input.connectionId, "contact", input.externalId);
  const email = clean(input.data.email);
  const phone = clean(input.data.phone);
  const existing = mapped ? { id: mapped } : (await queryPostgres<{ id: string }>(
    `select id from public.customers where tenant_id=$1 and (($2::text is not null and lower(email)=lower($2)) or
      ($3::text is not null and regexp_replace(phone,'\\D','','g')=regexp_replace($3,'\\D','','g'))) limit 1`,
    [input.tenantId, email, phone]
  ))?.rows[0];
  const result = existing
    ? await queryPostgres<{ id: string }>(
        `update public.customers set name=coalesce(nullif($3,''),name),email=coalesce($4,email),phone=coalesce($5,phone),
         updated_at=now() where tenant_id=$1 and id=$2 returning id`,
        [input.tenantId, existing.id, input.data.name ?? "", email, phone]
      )
    : await queryPostgres<{ id: string }>(
        `insert into public.customers (tenant_id,name,email,phone,customer_type,status,notes)
         values ($1,$2,$3,$4,'other','active',$5) returning id`,
        [input.tenantId, input.data.name || "Imported customer", email, phone, `Synchronized from ${input.providerKey}.`]
      );
  const id = result?.rows[0]?.id;
  if (!id) throw new Error("Customer synchronization failed.");
  await mapObject({ ...input, objectType: "contact", table: "customers", internalId: id });
  return id;
}

async function defaultBrand(tenantId: string) {
  const result = await queryPostgres<{ id: string }>("select id from public.brands where tenant_id=$1 and status='active' order by created_at limit 1", [tenantId]);
  if (!result?.rows[0]?.id) throw new Error("Create a Ferocity business profile before importing leads.");
  return result.rows[0].id;
}

export async function applyServicePlatformEvent(input: {
  tenantId: string; connectionId: string; providerKey: ServicePlatformProvider; event: z.infer<typeof servicePlatformEventSchema>;
}) {
  if (input.event.operation === "delete") {
    await queryPostgres(
      "update public.integration_object_mappings set provider_deleted_at=now(),updated_at=now() where connection_id=$1 and object_type=$2 and external_id=$3",
      [input.connectionId, input.event.objectType, input.event.externalId]
    );
    return { operation: "detached", objectType: input.event.objectType };
  }
  if (input.event.objectType === "contact") {
    const internalId = await upsertCustomer({ ...input, externalId: input.event.externalId, data: input.event.data });
    return { operation: "upserted", objectType: "contact", internalId };
  }
  if (input.event.objectType === "lead") {
    const brandId = await defaultBrand(input.tenantId);
    const mapped = await mappedInternalId(input.connectionId, "lead", input.event.externalId);
    const result = mapped
      ? await queryPostgres<{ id: string }>(
          `update public.leads set name=coalesce($3,name),email=coalesce($4,email),phone=coalesce($5,phone),message=coalesce($6,message),
           source=$7,source_detail='Coexistence bridge',updated_at=now() where tenant_id=$1 and id=$2 returning id`,
          [input.tenantId, mapped, clean(input.event.data.name), clean(input.event.data.email), clean(input.event.data.phone), clean(input.event.data.message), input.providerKey]
        )
      : await queryPostgres<{ id: string }>(
          `insert into public.leads (tenant_id,brand_id,source,source_detail,name,email,phone,message,status,qualification_status,metadata_json)
           values ($1,$2,$3,'Coexistence bridge',$4,$5,$6,$7,'new','unqualified',$8::jsonb) returning id`,
          [input.tenantId, brandId, input.providerKey, clean(input.event.data.name), clean(input.event.data.email), clean(input.event.data.phone), clean(input.event.data.message), JSON.stringify({ externalId: input.event.externalId })]
        );
    const id = result?.rows[0]?.id;
    if (!id) throw new Error("Lead synchronization failed.");
    await mapObject({ tenantId: input.tenantId, connectionId: input.connectionId, providerKey: input.providerKey, objectType: "lead", table: "leads", internalId: id, externalId: input.event.externalId });
    return { operation: "upserted", objectType: "lead", internalId: id };
  }
  const customerExternalId = input.event.data.customerExternalId;
  if (!customerExternalId) throw new Error("Job events require data.customerExternalId.");
  const customerId = await mappedInternalId(input.connectionId, "contact", customerExternalId);
  if (!customerId) throw new Error("Synchronize the customer before their job.");
  const mapped = await mappedInternalId(input.connectionId, "job", input.event.externalId);
  const status = input.event.data.status ? normalizedServiceJobStatus(input.event.data.status) : null;
  const result = mapped
    ? await queryPostgres<{ id: string }>(
        `update public.service_jobs set title=coalesce(nullif($3,''),title),status=coalesce($4,status),
         scheduled_start=coalesce($5::timestamptz,scheduled_start),scheduled_end=coalesce($6::timestamptz,scheduled_end),
         service_address=coalesce($7,service_address),updated_at=now()
         where tenant_id=$1 and id=$2 returning id`,
        [input.tenantId, mapped, input.event.data.title ?? "", status, input.event.data.scheduledStart ?? null, input.event.data.scheduledEnd ?? null, clean(input.event.data.address)]
      )
    : await queryPostgres<{ id: string }>(
        `insert into public.service_jobs (tenant_id,customer_id,title,status,scheduled_start,scheduled_end,service_address,dispatcher_notes)
         values ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,$7,$8) returning id`,
        [input.tenantId, customerId, input.event.data.title || "Imported job", status ?? "unscheduled", input.event.data.scheduledStart ?? null, input.event.data.scheduledEnd ?? null, clean(input.event.data.address), `Provider-owned job synchronized from ${input.providerKey}.`]
      );
  const id = result?.rows[0]?.id;
  if (!id) throw new Error("Job synchronization failed.");
  await mapObject({ tenantId: input.tenantId, connectionId: input.connectionId, providerKey: input.providerKey, objectType: "job", table: "service_jobs", internalId: id, externalId: input.event.externalId });
  return { operation: "upserted", objectType: "job", internalId: id };
}
