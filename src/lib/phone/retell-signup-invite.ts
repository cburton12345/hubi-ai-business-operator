import { env } from "@/lib/env";
import { resolveRetellConfiguration, resolveRetellWebhookTenant } from "@/lib/providers/retell-config";
import { verifyRetellSignature } from "@/lib/providers/voice-adapters";

type JsonRecord = Record<string, unknown>;

type SignupInviteDependencies = {
  resolveTenant: (agentId: string | null, phoneNumber: string | null) => Promise<string | null>;
  resolveApiKey: (tenantId: string) => Promise<string | null>;
  verifySignature: (rawBody: string, apiKey: string, signature: string | null) => boolean;
  submit: (input: { name: string; email: string; phone: string | null; companyName: string; businessType: string | null }) => Promise<boolean>;
};
function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, max);
  return cleaned || null;
}

function email(value: unknown) {
  const candidate = text(value, 254)?.toLowerCase() ?? null;
  return candidate && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

export async function processRetellSignupInviteTool(
  rawBody: string,
  signature: string | null,
  dependencies: SignupInviteDependencies
) {
  let payload: JsonRecord;
  try {
    payload = JSON.parse(rawBody || "{}") as JsonRecord;
  } catch {
    return { ok: false, status: "not_created", message: "The signup request was invalid." };
  }
  if (text(payload.name, 80) !== "create_ferocity_signup") {
    return { ok: false, status: "not_created", message: "The requested signup action is not supported." };
  }
  const call = record(payload.call);
  const args = record(payload.args);
  const tenantId = await dependencies.resolveTenant(text(call.agent_id, 200), text(call.to_number ?? call.from_number, 40));
  const apiKey = tenantId ? await dependencies.resolveApiKey(tenantId) : null;
  if (!tenantId || !apiKey || !dependencies.verifySignature(rawBody, apiKey, signature)) {
    return { ok: false, status: "not_created", message: "Ferocity could not authenticate the signup request." };
  }
  if (args.consent_to_create_account !== true) {
    return { ok: false, status: "not_created", message: "Ask for explicit permission to create the account before trying again." };
  }
  const confirmedEmail = email(args.email);
  const name = text(args.full_name, 160);
  const companyName = text(args.company_name, 180);
  if (!confirmedEmail || !name || !companyName) {
    return { ok: false, status: "not_created", message: "Confirm the person's full name, company name, and complete email address before trying again." };
  }
  const submitted = await dependencies.submit({
    name,
    email: confirmedEmail,
    phone: text(args.phone_number, 40) ?? text(call.to_number, 40),
    companyName,
    businessType: text(args.business_type, 120)
  });
  return submitted
    ? { ok: true, status: "invite_sent", message: `The secure Ferocity Earn invitation was sent to ${confirmedEmail}. They will choose their password privately from that email.` }
    : { ok: false, status: "not_created", message: "Ferocity could not create the secure invitation. Do not claim it was sent." };
}

async function submitVoiceEarnSignup(input: { name: string; email: string; phone: string | null; companyName: string; businessType: string | null }) {
  const baseUrl = env.FEROCITY_APP_URL?.replace(/\/$/, "");
  if (!baseUrl || !baseUrl.startsWith("https://")) return false;
  const form = new URLSearchParams({
    name: input.name,
    email: input.email,
    phone: input.phone ?? "",
    companyName: input.companyName,
    businessType: input.businessType ?? "",
    requestedPlan: "earn",
    mainGoal: "make_more_money",
    autonomyMode: "approval_first",
    message: "Secure Ferocity Earn signup requested and explicitly authorized during a recorded Ferocity voice conversation.",
    sourceDetail: "retell_voice_signup",
    consentToContact: "on",
    createWorkspace: "on",
    website: ""
  });
  const response = await fetch(`${baseUrl}/api/access-requests`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Ferocity-Retell-Signup/1.0" },
    body: form,
    redirect: "manual",
    cache: "no-store"
  });
  return response.status >= 300 && response.status < 400 && Boolean(response.headers.get("location"));
}

export const retellSignupInviteDependencies: SignupInviteDependencies = {
  resolveTenant: resolveRetellWebhookTenant,
  resolveApiKey: async (tenantId) => (await resolveRetellConfiguration(tenantId, false))?.apiKey ?? null,
  verifySignature: verifyRetellSignature,
  submit: submitVoiceEarnSignup
};
