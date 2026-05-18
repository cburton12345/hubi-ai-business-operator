import type { LeadDashboardRow } from "@/lib/leads/get-lead-dashboard";
import type { LeadDetail } from "@/lib/leads/get-lead-detail";

const now = new Date().toISOString();

export const demoLeads: LeadDashboardRow[] = [
  {
    id: "demo-ferocity-intake",
    brandName: "Ferocity",
    leadType: "case_intake",
    status: "new",
    qualificationStatus: "needs_review",
    priority: "high",
    name: "Sample Legal Intake",
    email: "intake@example.com",
    phone: "",
    createdAt: now
  },
  {
    id: "demo-trailer-quote",
    brandName: "Preferred Trailer Rental",
    leadType: "rental_request",
    status: "new",
    qualificationStatus: "unqualified",
    priority: "normal",
    name: "Sample Rental Lead",
    email: "",
    phone: "(555) 010-0000",
    createdAt: now
  }
];

export const demoLeadDetails: LeadDetail[] = [
  {
    ...demoLeads[0],
    message: "I was in an accident and want to know what my options are.",
    source: "website",
    sourceDetail: "ferocity-primary-form",
    consentToContact: true,
    metadata: {
      caseType: "personal_injury",
      legalDisclaimerAcknowledged: true
    },
    events: [
      {
        id: "demo-event-ferocity-1",
        type: "form_submission",
        body: "Lead captured from public form.",
        createdAt: now
      }
    ]
  },
  {
    ...demoLeads[1],
    message: "Need a trailer for a weekend project.",
    source: "website",
    sourceDetail: "preferred-trailer-rental-primary-form",
    consentToContact: true,
    metadata: {
      rentalItemType: "utility_trailer",
      deliveryNeeded: false
    },
    events: [
      {
        id: "demo-event-trailer-1",
        type: "form_submission",
        body: "Lead captured from public form.",
        createdAt: now
      }
    ]
  }
];
