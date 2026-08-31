import { queryPostgres } from "@/lib/db/postgres";

export type ContactCommunicationPreference = {
  preferredLanguage: string;
  preferredMethod: "automatic_sms" | "native_sms" | "google_voice" | "email" | "ai_voice_call" | "human_call";
  callBeforeTexting: boolean;
  noMarketingTexts: boolean;
  noAiCalls: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  bestContactTime: string;
  preferredEmployee: string;
  department: string;
};

export const defaultContactCommunicationPreference: ContactCommunicationPreference = {
  preferredLanguage: "auto",
  preferredMethod: "native_sms",
  callBeforeTexting: false,
  noMarketingTexts: false,
  noAiCalls: false,
  quietHoursStart: "21:00",
  quietHoursEnd: "08:00",
  bestContactTime: "",
  preferredEmployee: "",
  department: ""
};

export async function getContactCommunicationPreference(
  tenantId: string,
  contactKey: string
): Promise<ContactCommunicationPreference> {
  const result = await queryPostgres<{ value_json: Partial<ContactCommunicationPreference> }>(
    `select value_json from public.scoped_saved_preferences
     where tenant_id = $1 and preference_domain = 'communication'
       and preference_key = 'contact_profile' and scope_type = 'contact'
       and scope_key = lower($2) and status = 'active' limit 1`,
    [tenantId, contactKey]
  );
  return { ...defaultContactCommunicationPreference, ...(result?.rows[0]?.value_json ?? {}) };
}
