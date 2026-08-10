import type { ProviderContext, ProviderResult, VoiceAgentProvider } from "@/lib/providers/interfaces";
import type { VoiceAgent, VoiceConversation } from "@/lib/phone/contracts";
import { evaluateVoiceAccess } from "@/lib/usage/managed-voice";

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
    if (context.purpose !== "authorized_test") {
      const access = await evaluateVoiceAccess({
        tenantId: context.tenantId,
        providerKey: this.engine.providerKey,
        purpose: context.purpose
      });
      if (!access.allowed) {
        return {
          ok: false,
          errorCategory: access.errorCategory,
          safeMessage: access.reason,
          retryable: access.errorCategory === "concurrent_call_limit"
        };
      }
    }
    const result = await this.engine.startOutboundCall(context, input);
    if (!result.ok) return result;
    return {
      ok: true,
      data: {
        conversationId: result.data.providerCallId,
        providerCallId: result.data.providerCallId,
        status: result.data.status
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
