import type { HumanTransferDestination } from "@/lib/phone/transfer-routing";

const LEGACY_NO_TRANSFER_GUIDANCE = "This Ferocity support number does not currently have a live-transfer destination. Never say you are transferring the caller. When a caller asks for a person or needs protected human review, capture a complete callback request with create_sales_callback and explain that the right person will receive it. Do not promise an exact callback time.";

const VERIFIED_TRANSFER_GUIDANCE = "Verified human-transfer tools are available. When the caller asks for a person or the escalation rules require one, invoke the matching transfer tool promptly. Never say a transfer is ringing or completed unless the provider tool confirms it. If a destination is unavailable or the transfer fails, capture a complete callback request without promising an exact callback time.";

export function reconcileRetellTransferPrompt(prompt: string, hasVerifiedDestination: boolean) {
  const normalized = prompt.replace(LEGACY_NO_TRANSFER_GUIDANCE, "").replace(VERIFIED_TRANSFER_GUIDANCE, "").trim();
  const guidance = hasVerifiedDestination ? VERIFIED_TRANSFER_GUIDANCE : LEGACY_NO_TRANSFER_GUIDANCE;
  return normalized ? `${normalized}\n${guidance}` : guidance;
}

function toolName(label: string, index: number) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return `transfer_to_${slug || `human_${index + 1}`}`;
}

function transferDescription(destination: HumanTransferDestination) {
  const schedule = destination.availableStart && destination.availableEnd
    ? ` Availability: weekdays ${destination.weekdays.join(",")}, ${destination.availableStart}-${destination.availableEnd} in ${destination.timezone}.`
    : " Available whenever the business has not supplied a narrower schedule.";
  return `Transfer to ${destination.label} for ${destination.role.replaceAll("_", " ")} calls. Use when the caller asks for this person or department, or the escalation rules select it.${schedule} If it is outside the stated availability, take a complete message instead.`;
}

export function retellBusinessTools(
  origin: string,
  transfer?: string | null | HumanTransferDestination[]
) {
  const url = `${origin.replace(/\/+$/, "")}/api/integrations/voice-ai/tools/business`;
  const common = { type: "custom", url, method: "POST", speak_during_execution: true, speak_after_execution: true, timeout_ms: 10000, max_retry: 1 };
  const tools: Array<Record<string, unknown>> = [
    {
      type: "end_call",
      name: "end_call",
      description: "Politely end the call after the caller says goodbye, declines further help, confirms there is nothing else needed, or the agreed next step and concise recap are complete. Never use this while the caller is still asking a question or providing information."
    },
    { ...common, name: "update_contact", description: "Save caller contact details in Ferocity after confirming them with the caller.", parameters: { type: "object", properties: { caller_name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, qualification: { type: "string", enum: ["hot", "warm", "cold", "unknown"] }, consent_to_contact: { type: "boolean" } }, required: ["caller_name"] } },
    { ...common, name: "book_appointment", description: "Check Ferocity's live schedule and book the exact time only when available. If unavailable, record a request rather than inventing confirmation.", parameters: { type: "object", properties: { starts_at: { type: "string", description: "ISO 8601 date and time including timezone offset" }, duration_minutes: { type: "number" }, service: { type: "string" }, caller_name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } }, required: ["starts_at", "caller_name"] } },
    { ...common, name: "create_follow_up", description: "Create a tracked callback or follow-up in Ferocity. Never promise an exact callback time unless separately confirmed.", parameters: { type: "object", properties: { caller_name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, reason: { type: "string" }, urgency: { type: "string", enum: ["normal", "high"] }, preferred_time: { type: "string" } }, required: ["caller_name", "reason"] } },
    { ...common, name: "record_marketplacepro_intake", description: "For the Diamond Homes operations line only, route a confirmed caller request into MarketplacePro as contractor recruiting, a non-binding maintenance opportunity, facility-vendor relations, or a tracked follow-up. Never use this tool to accept a job, approve a vendor or contractor, promise coverage, or authorize payment.", parameters: { type: "object", properties: { intake_type: { type: "string", enum: ["contractor", "opportunity", "vendor", "follow_up"] }, caller_name: { type: "string" }, business_name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, city: { type: "string" }, state: { type: "string", description: "Two-letter US state code" }, zip: { type: "string" }, trades: { type: "array", items: { type: "string" } }, summary: { type: "string" }, urgency: { type: "string", enum: ["normal", "high", "urgent"] }, consent_to_contact: { type: "boolean" }, follow_up_at: { type: "string", description: "ISO 8601 timestamp with timezone, only if the caller requested a follow-up time" } }, required: ["intake_type", "summary"] } },
    { ...common, name: "diagnose_ferocity_support", description: "Get safe Ferocity self-service guidance before escalating a software, account, billing, workflow, integration, privacy, or platform problem. Use this first. Walk through the returned steps and ask whether the problem is solved.", parameters: { type: "object", properties: { issue_type: { type: "string", enum: ["account", "billing", "technical", "workflow", "integration", "privacy", "other"] }, description: { type: "string" } }, required: ["issue_type", "description"] } },
    { ...common, name: "record_ferocity_support_resolution", description: "Record whether the support guidance solved the caller's problem. If it did not solve the problem or escalation is required, create a tracked support case next.", parameters: { type: "object", properties: { self_service_id: { type: "string" }, outcome: { type: "string", enum: ["solved", "not_solved"] }, notes: { type: "string" } }, required: ["self_service_id", "outcome"] } },
    { ...common, name: "report_ferocity_support_issue", description: "Create a trackable Ferocity software, account, billing, integration, privacy, or platform support case after safe troubleshooting did not solve it or the diagnosis requires escalation. Use only for help with Ferocity itself, not for an ordinary customer service request to the tenant business. Collect the caller's problem and at least a name or callback number. Never collect passwords, verification codes, or full payment-card details.", parameters: { type: "object", properties: { caller_name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, issue_type: { type: "string", enum: ["account", "billing", "technical", "workflow", "integration", "privacy", "other"] }, subject: { type: "string" }, message: { type: "string" }, urgency: { type: "string", enum: ["normal", "high"] }, self_service_id: { type: "string" } }, required: ["issue_type", "subject", "message"] } }
  ];
  const destinations: HumanTransferDestination[] = Array.isArray(transfer)
    ? transfer
    : transfer && /^\+[1-9]\d{7,14}$/.test(transfer)
      ? [{ label: "business", role: "general", phoneNumber: transfer, priority: 100, weekdays: [0, 1, 2, 3, 4, 5, 6], availableStart: null, availableEnd: null, timezone: "America/Chicago", isPrimary: true }]
      : [];
  const usedNames = new Set<string>();
  destinations
    .filter((destination) => /^\+[1-9]\d{7,14}$/.test(destination.phoneNumber))
    .slice(0, 12)
    .forEach((destination, index) => {
      let name = destination.isPrimary && destinations.length === 1 ? "transfer_to_business" : toolName(destination.label, index);
      if (usedNames.has(name)) name = `${name}_${index + 1}`;
      usedNames.add(name);
    tools.push({
      type: "transfer_call", name, description: transferDescription(destination),
      transfer_destination: { type: "predefined", number: destination.phoneNumber, ignore_e164_validation: false },
      transfer_option: { type: "cold_transfer", show_transferee_as_caller: false }, speak_during_execution: true
    });
  });
  return tools;
}
