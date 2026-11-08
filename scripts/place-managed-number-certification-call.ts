import { randomUUID } from "node:crypto";
import { queryPostgres } from "../src/lib/db/postgres";
import { getVoiceAgentProvider } from "../src/lib/providers/voice-adapters";
import { ProviderBackedVoiceAgent } from "../src/lib/phone/voice-agent";

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

async function main() {
  const slug = argument("tenant");
  const destination = argument("to");
  if (!slug || !/(qa|smoke|certif)/i.test(slug) || !destination || !/^\+[1-9]\d{7,14}$/.test(destination)) {
    throw new Error("Use --tenant <qa-or-smoke-slug> --to <consenting E.164 number>.");
  }
  const result = await queryPostgres<{
    tenant_id: string;
    brand_id: string | null;
    phone_number: string;
    assistant_id: string;
    number_id: string;
  }>(
    `select t.id tenant_id,p.brand_id,n.phone_number,n.id number_id,
            nullif(a.metadata_json->>'assistantId','') assistant_id
       from public.tenants t
       join public.provider_accounts a on a.tenant_id=t.id and a.provider_key='retell_voice'
       join public.telephony_numbers n on n.tenant_id=t.id and n.provider_key='retell_voice'
       left join public.office_manager_profiles p on p.tenant_id=t.id and p.status in ('ready','active','needs_attention')
      where t.slug=$1 and n.status='active'
      order by n.updated_at desc,p.updated_at desc nulls last limit 1`,
    [slug]
  );
  const row = result?.rows[0];
  if (!row?.assistant_id) throw new Error("The QA workspace does not have an active number and synchronized agent.");
  const adapter = getVoiceAgentProvider("retell_voice");
  if (!adapter || adapter.adapterStatus !== "live") throw new Error("The Retell adapter is not live.");
  const idempotencyKey = `managed-number-certification-call:${row.tenant_id}:${randomUUID()}`;
  const call = await new ProviderBackedVoiceAgent(adapter).startConversation(
    {
      tenantId: row.tenant_id,
      brandId: row.brand_id,
      correlationId: idempotencyKey,
      idempotencyKey,
      liveActionsEnabled: false,
      purpose: "authorized_test"
    },
    { toNumber: destination, fromNumber: row.phone_number, assistantId: row.assistant_id }
  );
  if (!call.ok) throw new Error(call.safeMessage);
  const providerCallId = call.data.providerCallId ?? call.data.conversationId;
  await queryPostgres(
    `insert into public.receptionist_calls (
       tenant_id,brand_id,telephony_number_id,provider_key,provider_call_id,direction,
       caller_number,called_number,status,sentiment,lead_qualification,summary,
       follow_up_status,usage_units,idempotency_key,metadata_json
     ) values ($1,$2,$3,'retell_voice',$4,'outbound',$5,$6,'ringing','unknown','unknown',
       'Authorized managed-number certification call started.','none',0,$7,$8::jsonb)
     on conflict (provider_key,provider_call_id) do update
     set brand_id=coalesce(public.receptionist_calls.brand_id,excluded.brand_id),
         telephony_number_id=coalesce(public.receptionist_calls.telephony_number_id,excluded.telephony_number_id),
         caller_number=coalesce(public.receptionist_calls.caller_number,excluded.caller_number),
         called_number=coalesce(public.receptionist_calls.called_number,excluded.called_number),
         summary=coalesce(public.receptionist_calls.summary,excluded.summary),
         metadata_json=public.receptionist_calls.metadata_json || excluded.metadata_json,
         updated_at=now()`,
    [row.tenant_id,row.brand_id,row.number_id,providerCallId,row.phone_number,destination,
      idempotencyKey,JSON.stringify({
        source: "managed_number_certification",
        consentConfirmed: true
      })]
  );
  await queryPostgres(
    `update public.receptionist_setup_checklists set test_status='in_progress',
       activation_status='not_started',updated_at=now() where tenant_id=$1`,
    [row.tenant_id]
  );
  console.log(JSON.stringify({ ok: true, callPlaced: true, tenant: slug, providerCallId }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
