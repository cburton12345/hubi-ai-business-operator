import { queryPostgres } from "@/lib/db/postgres";
import { getPhoneConnection, type PhoneConnection } from "@/lib/phone/phone-connections";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";

export type ReceptionistSetupStep = {
  key: string;
  title: string;
  body: string;
  status: string;
  href: string;
};

export type ReceptionistSetupDashboard = {
  status: string;
  liveReady: boolean;
  missing: string[];
  steps: ReceptionistSetupStep[];
  phoneConnection: PhoneConnection | null;
  phoneNumbers: Array<{
    id: string;
    phoneNumber: string;
    numberMode: string;
    providerKey: string;
    status: string;
    inboundEnabled: boolean;
    outboundEnabled: boolean;
    complianceStatus: string;
  }>;
  providers: Array<{
    routeFamily: string;
    primaryProviderKey: string;
    fallbackProviderKey: string | null;
    status: string;
    liveActionsEnabled: boolean;
  }>;
};

function label(value: string | null | undefined) {
  return value ?? "not_started";
}

export async function getReceptionistSetupDashboard(): Promise<ReceptionistSetupDashboard> {
  const workspaceId = await getCurrentWorkspaceId();
  const [checklistResult, numberResult, routeResult, phoneConnection] = await Promise.all([
    queryPostgres<{
      status: string;
      business_basics_status: string;
      call_behavior_status: string;
      routing_status: string;
      scheduling_status: string;
      phone_number_status: string;
      test_status: string;
      activation_status: string;
    }>(
      `
      select status, business_basics_status, call_behavior_status, routing_status, scheduling_status,
             phone_number_status, test_status, activation_status
      from public.receptionist_setup_checklists
      where tenant_id = $1
      order by updated_at desc
      limit 1
      `,
      [workspaceId]
    ),
    queryPostgres<{
      id: string;
      phone_number: string;
      number_mode: string;
      provider_key: string;
      status: string;
      inbound_enabled: boolean;
      outbound_enabled: boolean;
      compliance_status: string;
    }>(
      `
      select id, phone_number, number_mode, provider_key, status, inbound_enabled, outbound_enabled, compliance_status
      from public.telephony_numbers
      where tenant_id = $1
      order by created_at desc
      limit 20
      `,
      [workspaceId]
    ),
    queryPostgres<{
      route_family: string;
      primary_provider_key: string;
      fallback_provider_key: string | null;
      status: string;
      live_actions_enabled: boolean;
    }>(
      `
      select route_family, primary_provider_key, fallback_provider_key, status, live_actions_enabled
      from public.voice_provider_routes
      where tenant_id = $1
      order by route_family
      `,
      [workspaceId]
    ),
    getPhoneConnection(workspaceId)
  ]);

  const checklist = checklistResult?.rows[0];
  const numbers = numberResult?.rows ?? [];
  const routes = routeResult?.rows ?? [];
  const hasActiveNumber = numbers.some((number) => number.status === "active" && number.inbound_enabled);
  const hasLiveProvider = routes.some((route) => route.live_actions_enabled);
  const missing = [
    !phoneConnection ? "Choose how you want to connect your business phone." : null,
    phoneConnection && !hasActiveNumber ? "Finish the selected phone connection and test the number." : null,
    !hasLiveProvider ? "Connect and approve a live voice provider." : null,
    label(checklist?.test_status) !== "complete" ? "Complete a test call before activation." : null,
    label(checklist?.activation_status) !== "complete" ? "Confirm activation, billing, and fallback behavior." : null
  ].filter(Boolean) as string[];

  const steps: ReceptionistSetupStep[] = [
    {
      key: "business_basics",
      title: "Business basics",
      body: "Name, industry, services, service area, hours, and time zone.",
      status: label(checklist?.business_basics_status),
      href: "/app/business-brain"
    },
    {
      key: "call_behavior",
      title: "Call behavior",
      body: "Greeting, receptionist name, tone, languages, questions, allowed answers, and escalation topics.",
      status: label(checklist?.call_behavior_status),
      href: "/app/office-manager"
    },
    {
      key: "routing",
      title: "Routing",
      body: "Human fallback, departments, emergency routing, after-hours behavior, and voicemail/message rules.",
      status: label(checklist?.routing_status),
      href: "/app/office-manager"
    },
    {
      key: "scheduling",
      title: "Scheduling",
      body: "Appointment types, duration, availability, calendar connection, notice, and booking rules.",
      status: label(checklist?.scheduling_status),
      href: "/app/calendar"
    },
    {
      key: "phone_number",
      title: "Phone number",
      body: "Keep your current number, connect it fully, or get a new number.",
      status: hasActiveNumber ? "complete" : label(checklist?.phone_number_status),
      href: "/app/receptionist-setup#numbers"
    },
    {
      key: "test",
      title: "Test",
      body: "Test provider webhook, sample call event, transcript, owner handoff, and call inbox.",
      status: label(checklist?.test_status),
      href: "/app/calls"
    },
    {
      key: "activate",
      title: "Activate",
      body: "Enable voice after its provider, call compliance, fallback, usage, and billing rules are ready. Text registration is separate and never blocks a voice-only launch.",
      status: label(checklist?.activation_status),
      href: "/app/feature-readiness"
    }
  ];

  return {
    status: checklist?.status ?? "not_started",
    liveReady: missing.length === 0,
    missing,
    steps,
    phoneConnection,
    phoneNumbers: numbers.map((number) => ({
      id: number.id,
      phoneNumber: number.phone_number,
      numberMode: number.number_mode,
      providerKey: number.provider_key,
      status: number.status,
      inboundEnabled: number.inbound_enabled,
      outboundEnabled: number.outbound_enabled,
      complianceStatus: number.compliance_status
    })),
    providers: routes.map((route) => ({
      routeFamily: route.route_family,
      primaryProviderKey: route.primary_provider_key,
      fallbackProviderKey: route.fallback_provider_key,
      status: route.status,
      liveActionsEnabled: route.live_actions_enabled
    }))
  };
}
