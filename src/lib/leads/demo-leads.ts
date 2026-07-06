import type { LeadDashboardRow } from "@/lib/leads/get-lead-dashboard";
import type { LeadDetail } from "@/lib/leads/get-lead-detail";

const now = new Date().toISOString();

export const demoLeads: LeadDashboardRow[] = [
  {
    id: "demo-ferocity-intake",
    brandName: "Ferocity",
    brandSlug: "ferocity",
    leadType: "case_intake",
    status: "new",
    qualificationStatus: "needs_review",
    priority: "high",
    name: "Sample Legal Intake",
    email: "intake@example.com",
    phone: "",
    createdAt: now,
    score: 0,
    grade: "unscored",
    assignedTo: "Unassigned",
    duplicateKey: "intake@example.com",
    smsHref: "sms:?&body=Hi%2C%20thanks%20for%20reaching%20out.%20I%20wanted%20to%20follow%20up%20and%20see%20what%20you%20need%20help%20with.",
    canText: false
  },
  {
    id: "demo-trailer-quote",
    brandName: "Preferred Trailer Rental",
    brandSlug: "preferred-trailer-rental",
    leadType: "rental_request",
    status: "new",
    qualificationStatus: "unqualified",
    priority: "normal",
    name: "Sample Rental Lead",
    email: "",
    phone: "(555) 010-0000",
    createdAt: now,
    score: 0,
    grade: "unscored",
    assignedTo: "Unassigned",
    duplicateKey: "(555) 010-0000",
    smsHref: "sms:5550100000?&body=Hi%2C%20thanks%20for%20reaching%20out%20to%20Preferred%20Trailer%20Rental.%20I%20wanted%20to%20follow%20up%20and%20see%20what%20you%20need%20help%20with.",
    canText: true
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
    score: null,
    assignment: null,
    intelligence: null,
    routingReview: null,
    legalDetails: {
      caseType: "personal_injury",
      incidentDate: "",
      state: "",
      injuryType: "",
      hasAttorney: false,
      treatmentReceived: null,
      disclaimerAcknowledged: true
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
    score: null,
    assignment: null,
    intelligence: null,
    legalDetails: null,
    routingReview: null,
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
