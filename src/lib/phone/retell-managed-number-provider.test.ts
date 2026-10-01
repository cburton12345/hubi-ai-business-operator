import { afterEach, describe, expect, it } from "vitest";
import {
  buildRetellManagedNumberPayload,
  buildRetellNumberBindingPayload
} from "./retell-managed-number-provider";

describe("Retell managed number payload", () => {
  afterEach(() => delete process.env.RETELL_NUMBER_PROVIDER);

  it("uses current weighted agent lists and a local US number", () => {
    process.env.RETELL_NUMBER_PROVIDER = "telnyx";
    expect(buildRetellManagedNumberPayload({
      inboundAssistantId: "agent-in",
      outboundAssistantId: "agent-out",
      inboundWebhookUrl: "https://ferocity.live/api/integrations/voice-ai/inbound",
      nickname: "Acme Roofing",
      areaCode: "715"
    })).toMatchObject({
      inbound_agents: [{ agent_id: "agent-in", weight: 1 }],
      outbound_agents: [{ agent_id: "agent-out", weight: 1 }],
      area_code: 715,
      number_provider: "telnyx",
      toll_free: false
    });
  });

  it("omits invalid area codes", () => {
    expect(buildRetellManagedNumberPayload({
      inboundAssistantId: "agent-in", outboundAssistantId: "agent-out",
      inboundWebhookUrl: "https://ferocity.live/inbound", nickname: "Acme", areaCode: "12"
    })).not.toHaveProperty("area_code");
  });

  it("omits purchase-only fields when updating an existing number", () => {
    const payload = buildRetellNumberBindingPayload({
      inboundAssistantId: "agent-in",
      outboundAssistantId: "agent-out",
      inboundWebhookUrl: "https://ferocity.live/api/integrations/voice-ai/inbound",
      nickname: "Acme managed",
      areaCode: "715"
    });
    expect(payload).not.toHaveProperty("number_provider");
    expect(payload).not.toHaveProperty("country_code");
    expect(payload).not.toHaveProperty("toll_free");
    expect(payload).not.toHaveProperty("area_code");
    expect(payload.inbound_agents).toEqual([{ agent_id: "agent-in", weight: 1 }]);
    expect(payload.outbound_agents).toEqual([{ agent_id: "agent-out", weight: 1 }]);
  });
});
