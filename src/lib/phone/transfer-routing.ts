import { queryPostgres } from "@/lib/db/postgres";

export const transferRoutingRoles = [
  "general", "owner", "office", "sales", "service", "billing", "emergency", "on_call"
] as const;

export type TransferRoutingRole = typeof transferRoutingRoles[number];

export type HumanTransferDestination = {
  id?: string;
  label: string;
  role: TransferRoutingRole;
  phoneNumber: string;
  priority: number;
  weekdays: number[];
  availableStart: string | null;
  availableEnd: string | null;
  timezone: string;
  isPrimary: boolean;
};

export function isE164Phone(value: string | null | undefined) {
  return /^\+[1-9]\d{7,14}$/.test(value ?? "");
}

export async function listHumanTransferDestinations(
  tenantId: string,
  brandId?: string | null
): Promise<HumanTransferDestination[]> {
  const result = await queryPostgres<{
    id: string;
    label: string;
    routing_role: TransferRoutingRole;
    phone_number: string;
    priority: number;
    weekdays_json: number[];
    available_start: string | null;
    available_end: string | null;
    timezone: string;
    is_primary: boolean;
  }>(
    `select id,label,routing_role,phone_number,priority,weekdays_json,
            available_start::text,available_end::text,timezone,is_primary
       from public.call_transfer_destinations
      where tenant_id=$1 and is_active=true
        and ($2::uuid is null or brand_id=$2::uuid or brand_id is null)
      order by case when brand_id=$2::uuid then 0 else 1 end,
               is_primary desc,priority asc,created_at asc`,
    [tenantId, brandId ?? null]
  );
  return (result?.rows ?? []).filter((row) => isE164Phone(row.phone_number)).map((row) => ({
    id: row.id,
    label: row.label,
    role: row.routing_role,
    phoneNumber: row.phone_number,
    priority: Number(row.priority),
    weekdays: Array.isArray(row.weekdays_json) ? row.weekdays_json.map(Number).filter((day) => day >= 0 && day <= 6) : [],
    availableStart: row.available_start?.slice(0, 5) ?? null,
    availableEnd: row.available_end?.slice(0, 5) ?? null,
    timezone: row.timezone,
    isPrimary: row.is_primary
  }));
}
