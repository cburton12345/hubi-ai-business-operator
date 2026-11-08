import type { ProviderContext, ProviderResult, VoiceAgentProvider } from "@/lib/providers/interfaces";
import type { VoiceAgent, VoiceConversation } from "@/lib/phone/contracts";
import { evaluateVoiceAccess, validVoicePricingSnapshot } from "@/lib/usage/managed-voice";
import { queryPostgres } from "@/lib/db/postgres";

type FerocityVoiceWorkflows = {
  stopConversation?: (input: { tenantId: string; conversationId: string }) => Promise<boolean>;
  transferHuman?: (input: {
    tenantId: string;
    conversationId: string;
    destinationNumber: string;
    reason?: string;
  }) => Promise<boolean>;
  summarizeCall?: (input: {
    tenantId: string;
    conversationId: string;
    transcript?: string | null;
  }) => Promise<{ summary: string; actionItems: string[] }>;
  scheduleAppointment?: (input: {
    tenantId: string;
    conversationId: string;
    requestedStart: string;
    customerId?: string | null;
    leadId?: string | null;
  }) => Promise<{ appointmentId: string; status: string }>;
  executeWorkflow?: (input: {
    tenantId: string;
    conversationId: string;
    workflowKey: string;
    payload: Record<string, unknown>;
  }) => Promise<{ workflowRunId: string; status: string }>;
};

function unavailable<T>(message: string): ProviderResult<T> {
  return {
    ok: false,
    errorCategory: "voice_workflow_not_configured",
    safeMessage: message,
    retryable: false
  };
}

export class ProviderBackedVoiceAgent implements VoiceAgent {
  constructor(
    private readonly engine: VoiceAgentProvider,
    private readonly workflows: FerocityVoiceWorkflows = {}
  ) {}

  async startConversation(
    context: ProviderContext,
    input: { toNumber: string; fromNumber: string; assistantId: string; dynamicVariables?: Record<string, string> }
  ): Promise<ProviderResult<VoiceConversation>> {
    const access = await evaluateVoiceAccess({
      tenantId: context.tenantId,
      providerKey: this.engine.providerKey,
      purpose: context.purpose,
      callDirection: "outbound"
    });
    if (!access.allowed) {
      return {
        ok: false,
        errorCategory: access.errorCategory,
        safeMessage: access.reason,
        retryable: access.errorCategory === "concurrent_call_limit"
      };
    }
    const reservationProviderCallId = `ferocity-pending:${context.tenantId}:${context.idempotencyKey}`;
    const reservation = await queryPostgres<{
      id: string;
      provider_call_id: string;
      status: string;
      admission_pricing_snapshot_json: unknown;
      inserted: boolean;
    }>(
      `with inserted as (
         insert into public.receptionist_calls (
           tenant_id,brand_id,provider_key,provider_call_id,direction,caller_number,
           called_number,status,idempotency_key,admission_pricing_snapshot_json,metadata_json
         ) values ($1,$2,$3,$4,'outbound',$5,$6,'received',$7,$8::jsonb,$9::jsonb)
         on conflict (tenant_id,idempotency_key) do nothing
         returning id,provider_call_id,status,admission_pricing_snapshot_json,true as inserted
       )
       select id,provider_call_id,status,admission_pricing_snapshot_json,inserted from inserted
       union all
       select id,provider_call_id,status,admission_pricing_snapshot_json,false as inserted
       from public.receptionist_calls
       where tenant_id=$1 and idempotency_key=$7 and not exists (select 1 from inserted)
       limit 1`,
      [
        context.tenantId,
        context.brandId ?? null,
        this.engine.providerKey,
        reservationProviderCallId,
        input.fromNumber,
        input.toNumber,
        context.idempotencyKey,
        JSON.stringify(access.pricingSnapshot ?? null),
        JSON.stringify({
          source: "voice_admission",
          admissionState: "reserved",
          pricingEvidenceSource: "ferocity_server"
        })
      ]
    );
    const reserved = reservation?.rows[0];
    if (!reserved) {
      return {
        ok: false,
        errorCategory: "voice_admission_persistence_failed",
        safeMessage: "The call could not be safely reserved before provider dispatch.",
        retryable: false
      };
    }
    if (!reserved.inserted) {
      if (reserved.provider_call_id !== reservationProviderCallId) {
        return {
          ok: true,
          data: {
            conversationId: reserved.provider_call_id,
            providerCallId: reserved.provider_call_id,
            status: reserved.status,
            usagePricingSnapshot: validVoicePricingSnapshot(reserved.admission_pricing_snapshot_json) ?? undefined
          }
        };
      }
      return {
        ok: false,
        errorCategory: "voice_dispatch_pending",
        safeMessage: "This call request is already reserved and needs reconciliation before another provider dispatch.",
        retryable: false
      };
    }

    const result = await this.engine.startOutboundCall({
      ...context,
      voiceReservationId: reserved.id
    }, input);
    if (!result.ok) {
      await queryPostgres(
        `update public.receptionist_calls
         set status='failed',safe_error_message=$3,
             metadata_json=metadata_json || $4::jsonb,updated_at=now()
         where tenant_id=$1 and id=$2 and provider_call_id=$5`,
        [
          context.tenantId,
          reserved.id,
          result.safeMessage,
          JSON.stringify({ admissionState: "provider_rejected" }),
          reservationProviderCallId
        ]
      );
      return result;
    }
    let bound = await queryPostgres<{ id: string }>(
      `update public.receptionist_calls
       set provider_call_id=$3,status=$4,
           metadata_json=metadata_json || $5::jsonb,updated_at=now()
       where tenant_id=$1 and id=$2 and provider_call_id=$6
       returning id`,
      [
        context.tenantId,
        reserved.id,
        result.data.providerCallId,
        result.data.status,
        JSON.stringify({ admissionState: "provider_bound" }),
        reservationProviderCallId
      ]
    );
    if (!bound?.rows[0]) {
      bound = await queryPostgres<{ id: string }>(
        `select id from public.receptionist_calls
         where tenant_id=$1 and id=$2 and provider_key=$3 and provider_call_id=$4
         limit 1`,
        [context.tenantId, reserved.id, this.engine.providerKey, result.data.providerCallId]
      );
    }
    if (!bound?.rows[0]) {
      return {
        ok: false,
        errorCategory: "voice_dispatch_binding_failed",
        safeMessage: "The provider accepted the call, but its reserved billing evidence needs reconciliation.",
        retryable: false
      };
    }
    return {
      ok: true,
      data: {
        conversationId: result.data.providerCallId,
        providerCallId: result.data.providerCallId,
        status: result.data.status,
        usagePricingSnapshot: access.pricingSnapshot
      }
    };
  }

  async stopConversation(context: ProviderContext, input: { conversationId: string }) {
    if (!this.workflows.stopConversation) {
      return unavailable<{ stopped: boolean }>("Stopping a live conversation is not configured for this voice connection.");
    }
    return {
      ok: true as const,
      data: { stopped: await this.workflows.stopConversation({ tenantId: context.tenantId, ...input }) }
    };
  }

  async transferHuman(
    context: ProviderContext,
    input: { conversationId: string; destinationNumber: string; reason?: string }
  ) {
    if (!this.workflows.transferHuman) {
      return unavailable<{ transferred: boolean }>("Human transfer is not configured for this voice connection.");
    }
    return {
      ok: true as const,
      data: { transferred: await this.workflows.transferHuman({ tenantId: context.tenantId, ...input }) }
    };
  }

  async summarizeCall(
    context: ProviderContext,
    input: { conversationId: string; transcript?: string | null }
  ) {
    if (!this.workflows.summarizeCall) {
      return unavailable<{ summary: string; actionItems: string[] }>("Call summarization is not configured.");
    }
    return {
      ok: true as const,
      data: await this.workflows.summarizeCall({ tenantId: context.tenantId, ...input })
    };
  }

  async scheduleAppointment(
    context: ProviderContext,
    input: { conversationId: string; requestedStart: string; customerId?: string | null; leadId?: string | null }
  ) {
    if (!this.workflows.scheduleAppointment) {
      return unavailable<{ appointmentId: string; status: string }>("Appointment scheduling is not configured.");
    }
    return {
      ok: true as const,
      data: await this.workflows.scheduleAppointment({ tenantId: context.tenantId, ...input })
    };
  }

  async executeWorkflow(
    context: ProviderContext,
    input: { conversationId: string; workflowKey: string; payload: Record<string, unknown> }
  ) {
    if (!this.workflows.executeWorkflow) {
      return unavailable<{ workflowRunId: string; status: string }>("This Ferocity workflow is not configured.");
    }
    return {
      ok: true as const,
      data: await this.workflows.executeWorkflow({ tenantId: context.tenantId, ...input })
    };
  }
}
