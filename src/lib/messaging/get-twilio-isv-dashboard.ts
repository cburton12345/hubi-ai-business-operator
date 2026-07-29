import { env } from "@/lib/env";
import { queryPostgres } from "@/lib/db/postgres";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type TwilioIsvDashboard = {
  primaryProfile: {
    hasAccountKeys: boolean;
    profileSid: string | null;
    approved: boolean;
    businessIdentity: string | null;
    ready: boolean;
    missing: string[];
  };
  recommendedArchitecture: string;
  route: {
    status: string;
    accountMode: string;
    customerSubaccountSid: string | null;
    secondaryCustomerProfileSid: string | null;
    brandSid: string | null;
    campaignSid: string | null;
    messagingServiceSid: string | null;
    phoneNumber: string | null;
    liveSendingEnabled: boolean;
    lastProviderStatus: string | null;
    lastError: string | null;
  } | null;
  latestRegistration: {
    status: string;
    legalBusinessName: string | null;
    websiteUrl: string | null;
    campaignDescription: string | null;
  } | null;
  steps: Array<{
    key: string;
    label: string;
    status: "complete" | "needed" | "blocked";
    detail: string;
  }>;
};

function primaryProfile() {
  const hasAccountKeys = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN);
  const profileSid = env.TWILIO_PRIMARY_CUSTOMER_PROFILE_SID ?? null;
  const approved = env.TWILIO_ISV_PRIMARY_PROFILE_APPROVED === "true";
  const businessIdentity = env.TWILIO_ISV_BUSINESS_IDENTITY ?? null;
  const missing = [
    hasAccountKeys ? null : "Twilio Account SID/Auth Token",
    profileSid ? null : "Primary Customer Profile SID",
    approved ? null : "Approved Twilio Primary Customer Profile",
    businessIdentity === "ISV Reseller or Partner" ? null : "Business Identity: ISV Reseller or Partner"
  ].filter(Boolean) as string[];

  return {
    hasAccountKeys,
    profileSid,
    approved,
    businessIdentity,
    ready: missing.length === 0,
    missing
  };
}

export async function getTwilioIsvDashboard(): Promise<TwilioIsvDashboard> {
  const tenantId = await getCurrentWorkspaceId();
  const [routeResult, registrationResult] = await Promise.all([
    queryPostgres<{
      status: string;
      twilio_account_mode: string;
      customer_subaccount_sid: string | null;
      secondary_customer_profile_sid: string | null;
      brand_sid: string | null;
      campaign_sid: string | null;
      messaging_service_sid: string | null;
      phone_number: string | null;
      live_sending_enabled: boolean;
      last_provider_status: string | null;
      last_error: string | null;
    }>(
      `
      select status, twilio_account_mode, customer_subaccount_sid, secondary_customer_profile_sid,
             brand_sid, campaign_sid, messaging_service_sid, phone_number, live_sending_enabled,
             last_provider_status, last_error
      from public.twilio_isv_customer_routes
      where tenant_id = $1
      order by updated_at desc
      limit 1
      `,
      [tenantId]
    ),
    queryPostgres<{
      status: string;
      legal_business_name: string | null;
      website_url: string | null;
      generated_campaign_description: string | null;
    }>(
      `
      select status, legal_business_name, website_url, generated_campaign_description
      from public.messaging_registrations
      where tenant_id = $1 and provider_key = 'twilio_sms'
      order by updated_at desc
      limit 1
      `,
      [tenantId]
    )
  ]);

  const primary = primaryProfile();
  const route = routeResult?.rows[0] ?? null;
  const latestRegistration = registrationResult?.rows[0] ?? null;

  const steps: TwilioIsvDashboard["steps"] = [
    {
      key: "primary_profile",
      label: "Ferocity Twilio ISV profile",
      status: primary.ready ? "complete" : "blocked",
      detail: primary.ready ? "Primary profile is ready for customer onboarding." : `Needs: ${primary.missing.join(", ")}.`
    },
    {
      key: "customer_packet",
      label: "Customer texting packet",
      status: latestRegistration ? "complete" : "needed",
      detail: latestRegistration ? `Registration draft is ${latestRegistration.status}.` : "Collect legal business info, use case, opt-in method, and samples."
    },
    {
      key: "subaccount",
      label: "Customer-mapped Twilio route",
      status: route?.customer_subaccount_sid ? "complete" : primary.ready ? "needed" : "blocked",
      detail: route?.customer_subaccount_sid ? "Customer subaccount is recorded." : "Create/map a customer Twilio subaccount before live SMS."
    },
    {
      key: "trusthub",
      label: "Secondary profile, Brand, Campaign",
      status: route?.secondary_customer_profile_sid && route.brand_sid && route.campaign_sid ? "complete" : primary.ready && latestRegistration ? "needed" : "blocked",
      detail: "Submit customer profile, brand, and campaign through Twilio Trust Hub/API."
    },
    {
      key: "messaging_service",
      label: "Messaging Service and number",
      status: route?.messaging_service_sid && route.phone_number ? "complete" : "needed",
      detail: "Attach the approved campaign and number to the customer's Messaging Service."
    },
    {
      key: "live_sending",
      label: "Ferocity live-send gate",
      status: route?.live_sending_enabled ? "complete" : "needed",
      detail: "Keep off until approval, test send, STOP/HELP, consent, budget, and owner approval are ready."
    }
  ];

  return {
    primaryProfile: primary,
    recommendedArchitecture: "Subaccount per customer, Messaging Service per approved use case.",
    route: route
      ? {
          status: route.status,
          accountMode: route.twilio_account_mode,
          customerSubaccountSid: route.customer_subaccount_sid,
          secondaryCustomerProfileSid: route.secondary_customer_profile_sid,
          brandSid: route.brand_sid,
          campaignSid: route.campaign_sid,
          messagingServiceSid: route.messaging_service_sid,
          phoneNumber: route.phone_number,
          liveSendingEnabled: route.live_sending_enabled,
          lastProviderStatus: route.last_provider_status,
          lastError: route.last_error
        }
      : null,
    latestRegistration: latestRegistration
      ? {
          status: latestRegistration.status,
          legalBusinessName: latestRegistration.legal_business_name,
          websiteUrl: latestRegistration.website_url,
          campaignDescription: latestRegistration.generated_campaign_description
        }
      : null,
    steps
  };
}
