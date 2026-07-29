import { queryPostgres } from "@/lib/db/postgres";
import type { PhoneCapability } from "@/lib/phone/contracts";

export type PhoneConnectionPath =
  | "keep_number_forwarding"
  | "keep_number_full"
  | "new_ferocity_number"
  | "bring_own_provider";

export type PhoneConnection = {
  id: string;
  connectionPath: PhoneConnectionPath;
  businessNumber: string | null;
  ferocityNumber: string | null;
  phoneProviderKey: string | null;
  phoneProviderLabel: string | null;
  voiceAgentProviderKey: string | null;
  currentCarrier: string | null;
  fullIntegrationMethod: string | null;
  preferredAreaCode: string | null;
  intendedUse: string | null;
  humanTransferNumber: string | null;
  smsRequested: boolean;
  mmsRequested: boolean;
  status: string;
  capabilities: PhoneCapability[];
};

export type SavePhoneConnectionInput = {
  tenantId: string;
  connectionPath: PhoneConnectionPath;
  businessNumber?: string | null;
  currentCarrier?: string | null;
  fullIntegrationMethod?: "number_port" | "cloud_phone" | "pbx" | "carrier_connection" | null;
  preferredAreaCode?: string | null;
  intendedUse?: string | null;
  humanTransferNumber?: string | null;
  smsRequested?: boolean;
  mmsRequested?: boolean;
  phoneProviderKey?: string | null;
  phoneProviderLabel?: string | null;
};

const fullCapabilities: PhoneCapability[] = [
  "inbound_call",
  "outbound_call",
  "number_provisioning",
  "number_porting",
  "call_forwarding",
  "call_transfer",
  "sms",
  "mms",
  "sip",
  "ring_groups",
  "voicemail",
  "recording",
  "business_hours",
  "multi_user"
];

export function capabilitiesForPhonePath(path: PhoneConnectionPath): PhoneCapability[] {
  if (path === "keep_number_forwarding") {
    return ["inbound_call", "call_forwarding", "call_transfer", "voicemail", "recording", "business_hours"];
  }
  if (path === "new_ferocity_number") {
    return fullCapabilities.filter((capability) => capability !== "number_porting" && capability !== "sip");
  }
  return [...fullCapabilities];
}

function initialStatus(path: PhoneConnectionPath) {
  if (path === "keep_number_forwarding") return "awaiting_forwarding";
  if (path === "keep_number_full") return "assisted_setup";
  if (path === "new_ferocity_number") return "needs_number";
  return "provider_connection";
}

export async function savePhoneConnection(input: SavePhoneConnectionInput) {
  const capabilities = capabilitiesForPhonePath(input.connectionPath);
  const result = await queryPostgres<{ id: string }>(
    `
    insert into public.phone_connections (
      tenant_id, connection_path, business_number, phone_provider_key, phone_provider_label,
      current_carrier, full_integration_method, preferred_area_code, intended_use,
      human_transfer_number, sms_requested, mms_requested, status, capabilities_json,
      setup_json, updated_at
    )
    values (
      $1,$2,nullif($3,''),nullif($4,''),nullif($5,''),nullif($6,''),nullif($7,''),
      nullif($8,''),nullif($9,''),nullif($10,''),$11,$12,$13,$14::jsonb,$15::jsonb,now()
    )
    on conflict (tenant_id) do update
    set connection_path = excluded.connection_path,
        business_number = excluded.business_number,
        phone_provider_key = excluded.phone_provider_key,
        phone_provider_label = excluded.phone_provider_label,
        current_carrier = excluded.current_carrier,
        full_integration_method = excluded.full_integration_method,
        preferred_area_code = excluded.preferred_area_code,
        intended_use = excluded.intended_use,
        human_transfer_number = excluded.human_transfer_number,
        sms_requested = excluded.sms_requested,
        mms_requested = excluded.mms_requested,
        status = excluded.status,
        capabilities_json = excluded.capabilities_json,
        setup_json = public.phone_connections.setup_json || excluded.setup_json,
        updated_at = now()
    returning id
    `,
    [
      input.tenantId,
      input.connectionPath,
      input.businessNumber ?? "",
      input.phoneProviderKey ?? "",
      input.phoneProviderLabel ?? "",
      input.currentCarrier ?? "",
      input.fullIntegrationMethod ?? "",
      input.preferredAreaCode ?? "",
      input.intendedUse ?? "",
      input.humanTransferNumber ?? "",
      input.smsRequested ?? false,
      input.mmsRequested ?? false,
      initialStatus(input.connectionPath),
      JSON.stringify(capabilities),
      JSON.stringify({
        customerSelectedAt: new Date().toISOString(),
        customerSelectedPath: input.connectionPath,
        providerSelectionDeferred: input.connectionPath !== "bring_own_provider"
      })
    ]
  );

  await queryPostgres(
    `
    with updated as (
      update public.receptionist_setup_checklists
      set status = case when status = 'active' then 'active' else 'in_progress' end,
          phone_number_status = 'in_progress',
          updated_at = now()
      where tenant_id = $1 and brand_id is null and setup_key = 'default'
      returning id
    )
    insert into public.receptionist_setup_checklists (
      tenant_id, brand_id, setup_key, status, phone_number_status, updated_at
    )
    select $1, null, 'default', 'in_progress', 'in_progress', now()
    where not exists (select 1 from updated)
    `,
    [input.tenantId]
  );

  return result?.rows[0]?.id ?? null;
}

export async function getPhoneConnection(tenantId: string): Promise<PhoneConnection | null> {
  const result = await queryPostgres<{
    id: string;
    connection_path: PhoneConnectionPath;
    business_number: string | null;
    ferocity_number: string | null;
    phone_provider_key: string | null;
    phone_provider_label: string | null;
    voice_agent_provider_key: string | null;
    current_carrier: string | null;
    full_integration_method: string | null;
    preferred_area_code: string | null;
    intended_use: string | null;
    human_transfer_number: string | null;
    sms_requested: boolean;
    mms_requested: boolean;
    status: string;
    capabilities_json: PhoneCapability[] | null;
  }>(
    `
    select id, connection_path, business_number, ferocity_number, phone_provider_key,
           phone_provider_label, voice_agent_provider_key, current_carrier,
           full_integration_method, preferred_area_code, intended_use,
           human_transfer_number, sms_requested, mms_requested, status, capabilities_json
    from public.phone_connections
    where tenant_id = $1
    limit 1
    `,
    [tenantId]
  );
  const row = result?.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    connectionPath: row.connection_path,
    businessNumber: row.business_number,
    ferocityNumber: row.ferocity_number,
    phoneProviderKey: row.phone_provider_key,
    phoneProviderLabel: row.phone_provider_label,
    voiceAgentProviderKey: row.voice_agent_provider_key,
    currentCarrier: row.current_carrier,
    fullIntegrationMethod: row.full_integration_method,
    preferredAreaCode: row.preferred_area_code,
    intendedUse: row.intended_use,
    humanTransferNumber: row.human_transfer_number,
    smsRequested: row.sms_requested,
    mmsRequested: row.mms_requested,
    status: row.status,
    capabilities: row.capabilities_json ?? []
  };
}
