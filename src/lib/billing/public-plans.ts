export type SelfServePlanKey = "calls" | "job_tracker" | "starter" | "growth" | "operator";

export type PublicPlan = {
  key: SelfServePlanKey;
  name: string;
  price: string;
  priceCents: number;
  fit: string;
  bestFor: string;
  bullets: string[];
  moreFeatures: string[];
  featured?: boolean;
};

export const publicPlans: PublicPlan[] = [
  {
    key: "calls",
    name: "Ferocity Calls",
    price: "$49/mo + 25 cents/min",
    priceCents: 4900,
    fit: "Your AI phone and lead-handling department.",
    bestFor: "Businesses that want every call answered, understood, recorded, and moved to the right next step without replacing the systems they already use.",
    bullets: [
      "24/7 AI phone answering with your Business Brain",
      "Recognize customers and qualify new leads",
      "Book allowed appointments and handle urgent transfers",
      "Transcripts, summaries, outcomes, and complete call history",
      "Missed-call recovery and provider-aware follow-up",
      "Upgrade into full Ferocity without migrating data"
    ],
    moreFeatures: [
      "Inbound and approved outbound AI calling",
      "Business hours and after-hours behavior",
      "Service-area, qualification, scheduling, and transfer rules",
      "Customer and lead creation or updating from calls",
      "Configurable recording and transcription",
      "Owner alerts for calls that need judgment",
      "Bring-your-own or Ferocity-managed Retell connection",
      "SMS through a configured provider, email, and manual-device fallback",
      "Usage controls and clear per-minute billing",
      "Shared Ferocity contacts, scheduling, memory, and communications"
    ]
  },
  {
    key: "starter",
    name: "Starter",
    price: "$79/mo",
    priceCents: 7900,
    fit: "Your everyday business control.",
    bestFor: "Ferocity watches the everyday business and handles routine work under the authority level the owner chooses.",
    bullets: [
      "Ask Ferocity what needs attention and what to do next",
      "Keep leads, reminders, estimates, and follow-up from slipping",
      "Manage customers, jobs, schedules, invoices, and payments",
      "Give employees a simple field view for time, receipts, and job proof",
      "Turn finished work into review requests and customer trust",
      "Prepare reviewed estimates, marketing, graphics, and ad briefs"
    ],
    moreFeatures: [
      "Business profile and service-area memory",
      "Remembered business, workflow, and customer preferences with instant one-time changes",
      "Lead forms and source tracking",
      "Customer locations, equipment, service history, and duplicate review",
      "Work orders, visits, worker assignments, and schedule conflict checks",
      "Catalog-backed estimates with optional upgrades and public acceptance",
      "Customer portal for requests, estimates, visits, invoices, and messages",
      "Offline-aware field checklists, photos, signatures, and completion gates",
      "Qualified-lead scoring and source-to-revenue tracking",
      "Stale-lead and estimate recovery queue",
      "Customer proof and before-and-after capture",
      "Review-first graphics",
      "Hosted service and growth-page drafts",
      "30-day SEO content plan",
      "AI Marketing Department recommendations and campaign drafts",
      "Video Ad Studio scripts, hooks, scenes, and briefs",
      "Ad launch kits with manual export",
      "Website publishing setup and manual export",
      "Daily Owner Brief generated on demand",
      "Worker requests and availability intake",
      "AI-assisted labor match suggestions",
      "Managed-ad budget safeguards when that service is chosen"
    ]
  },
  {
    key: "growth",
    name: "Growth",
    price: "$199/mo",
    priceCents: 19900,
    fit: "Your growth and follow-up team.",
    bestFor: "Ferocity connects follow-up, proof, content, search, campaigns, and revenue so the business can create and measure demand.",
    bullets: [
      "Everything in Starter",
      "Respond faster and keep following up until the customer answers",
      "Bring SMS, email, reviews, and recovery work into one customer history",
      "Build repeat business with memberships, reminders, and retention campaigns",
      "Turn job proof into content, reviews, and publish-ready marketing",
      "Qualify leads, improve appointment show-up, and recover old opportunities",
      "Create search, AI-search, content, and campaign work from real business data",
      "See which lead sources and campaigns become booked and paid work",
      "Find legitimate link opportunities and protect valuable backlinks",
      "Compare supplier pricing and protect estimate margins"
    ],
    moreFeatures: [
      "Everything listed in Starter",
      "Content Studio campaigns across channels",
      "Customer proof turned into reusable content packages",
      "Review requests with service-recovery routing",
      "Follow-up templates, recovery workflows, and queue visibility",
      "Callbacks, appointments, and scheduling foundation",
      "Secure appointment confirmation and change requests",
      "Timed appointment reminder queue with a connected provider",
      "Website, Google profile, ad, and review export queue",
      "Local Authority Builder tasks",
      "Backlink loss/risk tracking and legitimate link opportunities",
      "Real referral leads and revenue separated from estimated SEO value",
      "Google and AI-search visibility tracking",
      "Service-area intelligence for cities, ZIP codes, and radius",
      "Creative variant testing and performance memory",
      "Video Ad Studio variants and provider-ready briefs",
      "Bring-your-own provider credential vault",
      "Bulk email workflow access with a connected provider",
      "Owner AI decision memory",
      "AI monitoring and briefing queues",
      "Managed-ad budget controls and reporting"
    ],
    featured: true
  },
  {
    key: "operator",
    name: "Operator",
    price: "$399/mo",
    priceCents: 39900,
    fit: "Your proactive operating team.",
    bestFor: "Ferocity proactively monitors the operating day and coordinates sales, jobs, money, schedule, team, and connected systems.",
    bullets: [
      "Everything in Growth",
      "Have Ferocity monitor the operating day and remember important decisions",
      "Coordinate scheduling, job progress, collections, and customer handoffs",
      "Watch reputation, backlinks, and growth opportunities",
      "Start each day with one owner briefing and a clear attention list",
      "Control inventory, purchasing, workforce, recruiting, and job-cost risks",
      "Connect payments, accounting, calendars, phone, video, and other providers"
    ],
    moreFeatures: [
      "Everything listed in Growth",
      "Invoice payment requests and ledger workflows",
      "Calendar connection and dispatch readiness",
      "AI receptionist and live voice workflow readiness",
      "Intelligent call priorities, owner attention modes, screening, and contextual transfers",
      "AI video generation workflow access",
      "Crew, worker, provider, and partner bench",
      "Audited inventory movements, receiving, vendor bills, and accounting sync records",
      "Recruiting, onboarding, credential, timekeeping, and payroll-export foundations",
      "Connector health, credential alerts, and source checks",
      "Daily Operator Digest",
      "Scheduled guarded automation loop for authorized routine work",
      "Google Business Profile review readiness",
      "Marketplace activity import",
      "Advanced proof-to-content workflows",
      "Multi-platform ad launch kits and variants",
      "AI Marketing Department Plus optimization checks",
      "Owner-only personal operations queue",
      "Cross-platform owner event registry",
      "Advanced labor matching and operations visibility",
      "Multi-platform managed-ad controls when chosen",
      "Managed video production path when chosen"
    ]
  },
  {
    key: "job_tracker",
    name: "Job Tracker",
    price: "$39/mo",
    priceCents: 3900,
    fit: "Only need jobs and money tracking?",
    bestFor: "A focused tool for owners who want job and money control without Ferocity's full sales, growth, and operating departments.",
    bullets: [
      "Bids, estimates, and job notes",
      "Materials, receipts, and expenses",
      "Worker and subcontractor payment records",
      "Invoices, payments, and job profit",
      "Daily job reminders and basic AI guidance"
    ],
    moreFeatures: [
      "Line-item bids and estimates",
      "Deposit and payment-term notes",
      "Material and purchase lists",
      "Receipt and reimbursement tracking",
      "Cash, check, bank-transfer, and outside-payment records",
      "Worker and subcontractor availability intake",
      "Job money board",
      "Evidence-backed Job Health and field-report drafts",
      "Basic invoices and payment reminders"
    ]
  }
];

export const primaryPublicPlans = publicPlans.filter((plan) => plan.key !== "job_tracker");
export const jobTrackerPlan = publicPlans.find((plan) => plan.key === "job_tracker")!;

export function isSelfServePlanKey(value: string): value is SelfServePlanKey {
  return publicPlans.some((plan) => plan.key === value);
}

export function getPublicPlan(value: string) {
  return publicPlans.find((plan) => plan.key === value) ?? null;
}
