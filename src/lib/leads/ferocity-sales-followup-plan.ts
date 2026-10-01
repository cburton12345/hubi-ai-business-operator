import type { PublicLeadInput } from "@/lib/leads/schemas";

type TranscriptTurn = {
  speaker: "visitor" | "assistant";
  body: string;
};

export type FerocitySalesFollowUpStep = {
  step: number;
  delayHours: number;
  workflowType: "new_lead_response" | "nurture";
  message: string;
};

function transcriptTurns(input: PublicLeadInput): TranscriptTurn[] {
  const value = input.details?.diagnosticTranscript;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const speaker = "speaker" in entry ? entry.speaker : null;
    const body = "body" in entry ? entry.body : null;
    if ((speaker !== "visitor" && speaker !== "assistant") || typeof body !== "string" || !body.trim()) return [];
    return [{ speaker, body: body.trim().slice(0, 800) }];
  });
}

function usefulRecommendation(input: PublicLeadInput) {
  const transcript = transcriptTurns(input);
  const assistantTurn = [...transcript].reverse().find((turn) => turn.speaker === "assistant");
  if (assistantTurn) return assistantTurn.body.replace(/\s+/g, " ").slice(0, 420);
  const visitorTurn = [...transcript].reverse().find((turn) => turn.speaker === "visitor");
  if (visitorTurn) return `You told Ferocity that this is the result you want: ${visitorTurn.body.replace(/\s+/g, " ").slice(0, 280)}`;
  return "Ferocity saved the business goal you shared and can continue from that context.";
}

export function buildFerocitySalesFollowUpPlan(input: PublicLeadInput): FerocitySalesFollowUpStep[] {
  const firstName = input.name?.trim().split(/\s+/)[0] || "there";
  const recommendation = usefulRecommendation(input);
  return [
    {
      step: 1,
      delayHours: 2,
      workflowType: "new_lead_response",
      message: `Hi ${firstName} — Ferocity saved the plan from our conversation. ${recommendation} When you are ready, the simplest next step is here: https://ferocity.live/pricing. Reply with a question or the result you want next and Ferocity will continue from there.`
    },
    {
      step: 2,
      delayHours: 48,
      workflowType: "nurture",
      message: `Hi ${firstName} — one useful next move is to choose the first business outcome Ferocity should own, then let it connect that work to leads, operations, money, and follow-up instead of adding another disconnected tool. You can compare the starting paths at https://ferocity.live/pricing, or reply and Ferocity will narrow it down for you.`
    },
    {
      step: 3,
      delayHours: 120,
      workflowType: "nurture",
      message: `Hi ${firstName} — I’ll close the loop after this note so Ferocity does not keep chasing you. If improving the business is still a priority, reply with the bottleneck or outcome and Ferocity will pick the conversation back up. Start options: https://ferocity.live/pricing`
    }
  ];
}
