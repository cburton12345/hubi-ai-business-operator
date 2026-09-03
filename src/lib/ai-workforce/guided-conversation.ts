export type FerocityGoalKey = "money" | "leads" | "cash" | "operations" | "attention" | "setup";

export type FerocityGoal = {
  key: FerocityGoalKey;
  label: string;
  description: string;
  command: string;
};

export const ferocityGoals: FerocityGoal[] = [
  {
    key: "money",
    label: "Make more money",
    description: "Find the best path to new revenue, better conversion, or recovered cash.",
    command: "Find the highest-value ways to make more money and prepare the best next steps."
  },
  {
    key: "leads",
    label: "Bring in more customers",
    description: "Build the right marketing and follow-up plan for this business.",
    command: "Help me bring in more qualified customers. Review what is already connected and prepare the best marketing and follow-up plan."
  },
  {
    key: "cash",
    label: "Get paid faster",
    description: "Find stalled estimates, unpaid invoices, and safe follow-up opportunities.",
    command: "Help me get paid faster. Find stalled estimates and unpaid invoices, then prepare approval-safe follow-up."
  },
  {
    key: "operations",
    label: "Run work more smoothly",
    description: "Improve scheduling, jobs, team coordination, and handoffs.",
    command: "Help me run the business more smoothly. Review scheduling, jobs, team coordination, and operational handoffs, then prepare the best improvements."
  },
  {
    key: "attention",
    label: "Tell me what needs attention",
    description: "See only the decisions, risks, and opportunities that matter now.",
    command: "Show me what needs my attention today and explain what you recommend."
  },
  {
    key: "setup",
    label: "Set Ferocity up for me",
    description: "Turn a business goal into a practical, approval-safe setup plan.",
    command: "Set Ferocity up around my goals. Review what is already complete, identify what is missing, and prepare the safest useful next steps."
  }
];

export const moneyOutcomes = [
  "Find the fastest revenue opportunities",
  "Create a plan to bring in new customers",
  "Recover stalled leads, estimates, and unpaid invoices",
  "Build a complete growth system"
] as const;

export function hasUsefulIndustry(industry?: string | null) {
  const normalized = industry?.trim().toLowerCase() ?? "";
  return Boolean(normalized && !["uncategorized", "general business", "unknown", "not set"].includes(normalized));
}

export function moneyCommand(industry: string, outcome: string) {
  return `I want to make more money in my ${industry.trim()} business. ${outcome}. Review what is already configured, recommend the highest-value next moves, and prepare the work without publishing or spending until approved.`;
}
