export type FollowUpChannel = "manual" | "sms" | "email" | "phone";

export type FollowUpCandidate = {
  leadId: string;
  status: "new" | "contacted" | "qualified" | "lost";
  priority: "low" | "normal" | "high";
  leadScore?: number | null;
  source?: string | null;
  originalRequest?: string | null;
  serviceInterest?: string | null;
  urgency?: string | null;
  lostReason?: string | null;
  daysInactive: number;
  previousTouches: number;
  hasPhone: boolean;
  hasEmail: boolean;
  consentToContact: boolean;
  responseStopActive: boolean;
  openConversation: boolean;
};

export type FollowUpPlan = {
  eligible: boolean;
  reason: string;
  segment: "new_unreached" | "active_interest" | "qualified_opportunity" | "long_term_reactivation" | "manual_review";
  channel: FollowUpChannel;
  strategyKey: string;
  sequenceStep: number;
  dueInHours: number;
  confidenceScore: number;
  experimentVariant: "helpful_question" | "specific_next_step";
  suggestedMessage: string;
  requiresApproval: true;
  safeguards: string[];
};

function clean(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function stableVariant(id: string): FollowUpPlan["experimentVariant"] {
  let value = 0;
  for (const character of id) value = (value * 31 + character.charCodeAt(0)) >>> 0;
  return value % 2 === 0 ? "helpful_question" : "specific_next_step";
}

function bestChannel(candidate: FollowUpCandidate): FollowUpChannel {
  if (!candidate.consentToContact) return "manual";
  if (candidate.hasPhone && candidate.urgency && /urgent|emergency|today|asap/i.test(candidate.urgency)) return "phone";
  if (candidate.hasPhone) return "sms";
  if (candidate.hasEmail) return "email";
  return "manual";
}

function segmentFor(candidate: FollowUpCandidate): FollowUpPlan["segment"] {
  if (candidate.status === "lost" || candidate.daysInactive >= 90) return "long_term_reactivation";
  if (candidate.status === "qualified") return "qualified_opportunity";
  if (candidate.status === "contacted") return "active_interest";
  if (candidate.status === "new") return "new_unreached";
  return "manual_review";
}

function dueInHours(candidate: FollowUpCandidate, segment: FollowUpPlan["segment"]) {
  if (candidate.priority === "high" || (candidate.leadScore ?? 0) >= 80) return 0;
  if (segment === "new_unreached") return 0;
  if (segment === "qualified_opportunity") return 2;
  if (segment === "active_interest") return 8;
  return 24;
}

function buildMessage(candidate: FollowUpCandidate, variant: FollowUpPlan["experimentVariant"], segment: FollowUpPlan["segment"]) {
  const service = clean(candidate.serviceInterest);
  const request = clean(candidate.originalRequest);
  const subject = service ? `your ${service} request` : request ? "your earlier request" : "your request";
  if (segment === "long_term_reactivation") {
    return variant === "helpful_question"
      ? `You reached out previously about ${subject}. Is that still something you want help with, or has the situation changed?`
      : `You reached out previously about ${subject}. If it is still relevant, we can help identify the simplest useful next step.`;
  }
  if (segment === "qualified_opportunity") {
    return variant === "helpful_question"
      ? `I wanted to follow up on ${subject}. Is there a question, timing issue, or option we can clarify for you?`
      : `I wanted to follow up on ${subject}. We can help with the next concrete step when you are ready.`;
  }
  return variant === "helpful_question"
    ? `I wanted to make sure ${subject} did not get lost. What would be most useful for us to answer next?`
    : `I wanted to make sure ${subject} did not get lost. We can help with the next step when it is useful to you.`;
}

/**
 * Chooses a useful next touch without pretending that silence is consent or
 * using manufactured urgency. Provider policy is deliberately enforced again
 * when a message is sent; this function only prepares reviewable work.
 */
export function planLeadFollowUp(candidate: FollowUpCandidate): FollowUpPlan {
  const segment = segmentFor(candidate);
  const channel = bestChannel(candidate);
  const variant = stableVariant(candidate.leadId);
  const safeguards = [
    "human_or_policy_approval_required",
    "stop_on_reply_booking_sale_or_opt_out",
    "send_time_consent_and_quiet_hours_recheck",
    "no_fake_urgency_or_unverified_claims"
  ];
  if (candidate.responseStopActive || candidate.openConversation) {
    return {
      eligible: false,
      reason: candidate.responseStopActive ? "A verified customer response already stopped outreach." : "An active conversation needs a response, not another nurture touch.",
      segment,
      channel: "manual",
      strategyKey: "do_not_nurture_active_conversation",
      sequenceStep: candidate.previousTouches + 1,
      dueInHours: 0,
      confidenceScore: 100,
      experimentVariant: variant,
      suggestedMessage: "Review and respond inside the active conversation.",
      requiresApproval: true,
      safeguards
    };
  }
  if (candidate.previousTouches >= 4) {
    return {
      eligible: false,
      reason: "The lead reached the default outreach frequency cap and needs manual review.",
      segment: "manual_review",
      channel: "manual",
      strategyKey: "frequency_cap_review",
      sequenceStep: candidate.previousTouches + 1,
      dueInHours: 0,
      confidenceScore: 95,
      experimentVariant: variant,
      suggestedMessage: "Review prior attempts and the original request before authorizing any additional outreach.",
      requiresApproval: true,
      safeguards
    };
  }
  if (!candidate.consentToContact || (!candidate.hasPhone && !candidate.hasEmail)) {
    return {
      eligible: true,
      reason: "No verified direct-send path is available; prepare an internal review task only.",
      segment,
      channel: "manual",
      strategyKey: `${segment}_manual_review`,
      sequenceStep: candidate.previousTouches + 1,
      dueInHours: dueInHours(candidate, segment),
      confidenceScore: 90,
      experimentVariant: variant,
      suggestedMessage: "Review the original request and available lawful contact path. Do not send without verified authorization.",
      requiresApproval: true,
      safeguards
    };
  }
  const contextStrength = Number(Boolean(clean(candidate.serviceInterest))) + Number(Boolean(clean(candidate.originalRequest))) + Number(Boolean(clean(candidate.urgency)));
  return {
    eligible: true,
    reason: `Prepared from lifecycle stage, ${candidate.daysInactive} inactive day(s), ${candidate.previousTouches} prior touch(es), channel availability, and known request context.`,
    segment,
    channel,
    strategyKey: `${segment}_${variant}`,
    sequenceStep: candidate.previousTouches + 1,
    dueInHours: dueInHours(candidate, segment),
    confidenceScore: Math.min(94, 70 + contextStrength * 6 + (candidate.leadScore ? 4 : 0)),
    experimentVariant: variant,
    suggestedMessage: buildMessage(candidate, variant, segment),
    requiresApproval: true,
    safeguards
  };
}
