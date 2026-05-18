import type { PublicLeadInput } from "@/lib/leads/schemas";

type SpamGuardResult = {
  ok: boolean;
  status: number;
  reason?: string;
};

const suspiciousTerms = [
  "casino",
  "crypto",
  "forex",
  "porn",
  "viagra",
  "watch online",
  "free money",
  "[url=",
  "<a href",
  "http://",
  "https://"
];

const maxSubmissionsByIp = 8;
const rateWindowMs = 10 * 60 * 1000;

const submissionBuckets = new Map<string, number[]>();

function normalize(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function hasSuspiciousText(input: PublicLeadInput) {
  const haystack = [input.name, input.email, input.phone, input.message, input.source, input.sourceDetail, ...Object.values(input.details)]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return suspiciousTerms.some((term) => haystack.includes(term));
}

export function checkRateLimit(ipAddress?: string): SpamGuardResult {
  if (!ipAddress) {
    return { ok: true, status: 200 };
  }

  const now = Date.now();
  const existing = submissionBuckets.get(ipAddress) ?? [];
  const recent = existing.filter((timestamp) => now - timestamp < rateWindowMs);

  if (recent.length >= maxSubmissionsByIp) {
    submissionBuckets.set(ipAddress, recent);
    return {
      ok: false,
      status: 429,
      reason: "Too many submissions. Please try again later."
    };
  }

  submissionBuckets.set(ipAddress, [...recent, now]);
  return { ok: true, status: 200 };
}

export function evaluateLeadSubmission(input: PublicLeadInput, requestMeta: { ipAddress?: string }): SpamGuardResult {
  if (input.website) {
    return {
      ok: false,
      status: 400,
      reason: "Invalid submission."
    };
  }

  if (!input.consentToContact && input.leadType === "case_intake") {
    return {
      ok: false,
      status: 400,
      reason: "Consent is required for legal intake submissions."
    };
  }

  if (input.leadType === "case_intake" && input.details.legalDisclaimerAcknowledged !== true) {
    return {
      ok: false,
      status: 400,
      reason: "Legal disclaimer acknowledgement is required."
    };
  }

  if (hasSuspiciousText(input)) {
    return {
      ok: false,
      status: 400,
      reason: "Invalid submission."
    };
  }

  const email = normalize(input.email);
  const phone = normalize(input.phone);

  if (!email && !phone) {
    return {
      ok: false,
      status: 400,
      reason: "Either email or phone is required."
    };
  }

  return checkRateLimit(requestMeta.ipAddress);
}
