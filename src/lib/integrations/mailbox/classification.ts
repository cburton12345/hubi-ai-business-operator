export type MailboxClassification = "lead" | "customer" | "finance" | "vendor" | "support" | "urgent" | "other";

const rules: Array<{ classification: MailboxClassification; confidence: number; terms: RegExp }> = [
  { classification: "urgent", confidence: 0.94, terms: /\b(urgent|emergency|immediately|asap|water leak|no heat|safety issue)\b/i },
  { classification: "lead", confidence: 0.9, terms: /\b(estimate|quote|pricing|interested|consultation|new project|request a call)\b/i },
  { classification: "finance", confidence: 0.88, terms: /\b(invoice|payment|past due|receipt|refund|charge|billing)\b/i },
  { classification: "support", confidence: 0.86, terms: /\b(help|problem|issue|not working|support|complaint)\b/i },
  { classification: "vendor", confidence: 0.8, terms: /\b(supplier|purchase order|shipment|wholesale|vendor)\b/i },
  { classification: "customer", confidence: 0.72, terms: /\b(appointment|schedule|job|service|project|follow up)\b/i }
];

export function classifyMailboxMessage(input: { subject?: string; preview?: string; bodyText?: string }) {
  const text = [input.subject, input.preview, input.bodyText].filter(Boolean).join(" ").slice(0, 12_000);
  const match = rules.find((rule) => rule.terms.test(text));
  return match
    ? { classification: match.classification, confidence: match.confidence, needsAttention: ["urgent", "lead", "finance", "support"].includes(match.classification) }
    : { classification: "other" as const, confidence: 0.35, needsAttention: false };
}
