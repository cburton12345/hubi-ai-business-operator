export function retellBusinessTools(origin: string, transferNumber?: string | null) {
  const url = `${origin.replace(/\/+$/, "")}/api/integrations/voice-ai/tools/business`;
  const common = { type: "custom", url, method: "POST", speak_during_execution: true, speak_after_execution: true, timeout_ms: 10000, max_retry: 1 };
  const tools: Array<Record<string, unknown>> = [
    { ...common, name: "update_contact", description: "Save caller contact details in Ferocity after confirming them with the caller.", parameters: { type: "object", properties: { caller_name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, qualification: { type: "string", enum: ["hot", "warm", "cold", "unknown"] }, consent_to_contact: { type: "boolean" } }, required: ["caller_name"] } },
    { ...common, name: "book_appointment", description: "Check Ferocity's live schedule and book the exact time only when available. If unavailable, record a request rather than inventing confirmation.", parameters: { type: "object", properties: { starts_at: { type: "string", description: "ISO 8601 date and time including timezone offset" }, duration_minutes: { type: "number" }, service: { type: "string" }, caller_name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } }, required: ["starts_at", "caller_name"] } },
    { ...common, name: "create_follow_up", description: "Create a tracked callback or follow-up in Ferocity. Never promise an exact callback time unless separately confirmed.", parameters: { type: "object", properties: { caller_name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, reason: { type: "string" }, urgency: { type: "string", enum: ["normal", "high"] }, preferred_time: { type: "string" } }, required: ["caller_name", "reason"] } }
  ];
  if (transferNumber && /^\+[1-9]\d{7,14}$/.test(transferNumber)) {
    tools.push({
      type: "transfer_call", name: "transfer_to_business", description: "Transfer the caller to the verified business destination only when the caller asks for a person or Ferocity's escalation rules require it.",
      transfer_destination: { type: "predefined", number: transferNumber, ignore_e164_validation: false },
      transfer_option: { type: "cold_transfer", show_transferee_as_caller: false }, speak_during_execution: true
    });
  }
  return tools;
}
