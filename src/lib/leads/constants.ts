export const leadStatuses = ["new", "contacted", "qualified", "won", "lost", "spam"] as const;

export const qualificationStatuses = ["unqualified", "qualified", "disqualified", "needs_review"] as const;

export const leadPriorities = ["low", "normal", "high"] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export type QualificationStatus = (typeof qualificationStatuses)[number];

export type LeadPriority = (typeof leadPriorities)[number];
