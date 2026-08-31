export type SelfServePlanKey = "ferocity_connect" | "calls" | "job_tracker" | "starter" | "growth" | "operator";

export const publicConnectPlan = {
  key: "ferocity_connect" as const,
  name: "Ferocity Connect",
  price: "$29/mo",
  priceCents: 2900,
  fit: "Let approved Ferocity workflows text through one paired Android phone and its mobile plan.",
  additionalDevicePrice: "$10/mo per additional Android device"
};

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

export const publicEarnPlan = {
  key: "earn" as const,
  name: "Ferocity Earn",
  eyebrow: "Pay when the business gets paid",
  price: "$0/month base",
  fit: "Use Ferocity without a fixed monthly subscription.",
  rates: "0.9% when your business brings an opportunity to Ferocity to manage. 6% when Ferocity creates the opportunity. The two rates never stack.",
  eligibility: "Earn applies to eligible revenue actually collected—not leads, estimates, contracts, completed jobs, or unpaid invoices.",
  costs: "Provider usage, payment processing, advertising spend, and third-party costs remain separate.",
  cta: "Ask about Ferocity Earn"
};

export const publicPlans: PublicPlan[] = [
  {
    key: "calls",
    name: "Ferocity Calls",
    price: "$49/mo + $0.25/completed voice minute",
    priceCents: 4900,
    fit: "A complete AI phone department without replacing your CRM.",
    bestFor: "Businesses that want every call answered, understood, and moved to the right next step while keeping the systems they already use.",
    bullets: [
      "Answer inbound calls around the clock with your Business Brain",
      "Recognize existing customers and qualify new leads",
      "Book approved appointments and transfer urgent calls",
      "Keep transcripts, summaries, outcomes, and call history together",
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
      "Usage controls and $0.25 billing per completed voice minute",
      "Optional CRM and service-platform call handoff as each adapter is connected and certified",
      "Shared Ferocity contacts, scheduling, memory, and communications",
      "One Ferocity Connect Android device included"
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
      "One dashboard for the Business Brain, customers, jobs, schedule, money, and attention items",
      "Ask Ferocity what needs attention and what to do next",
      "Leads, reminders, estimates, and follow-up kept from slipping",
      "Customers, jobs, schedules, invoices, and payments kept coordinated",
      "Employees get a simple field view for time, receipts, and job proof",
      "Finished work turned into review requests and customer trust",
      "Reviewed estimates, marketing, graphics, and ad briefs prepared for action"
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
      "Managed-ad budget safeguards when that service is chosen",
      "25 managed AI phone minutes included; then $0.25 per completed minute",
      "One Ferocity Connect Android device included"
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
      "Faster response and persistent follow-up until the customer answers",
      "SMS, email, reviews, and recovery work unified in one customer history",
      "Repeat business built through memberships, reminders, and retention campaigns",
      "Job proof converted into content, reviews, and publish-ready marketing",
      "Lead qualification, appointment show-up improvement, and old-opportunity recovery",
      "Search, AI-search, content, and campaign work created from real business data",
      "Lead sources and campaigns traced through booked and paid work",
      "Legitimate link opportunities found and valuable backlinks protected",
      "Supplier pricing compared and estimate margins protected"
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
      "Managed-ad budget controls and reporting",
      "100 managed AI phone minutes included; then $0.25 per completed minute",
      "One Ferocity Connect Android device included"
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
      "Continuous operating-day monitoring with important decisions remembered",
      "Scheduling, job progress, collections, and customer handoffs coordinated",
      "Reputation, backlinks, and growth opportunities watched proactively",
      "One daily owner briefing with a clear attention list",
      "Inventory, purchasing, workforce, recruiting, and job-cost risks controlled",
      "Payments, accounting, calendars, phone, video, and other providers connected"
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
      "Managed video production path when chosen",
      "300 managed AI phone minutes included; then $0.25 per completed minute",
      "One Ferocity Connect Android device included"
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
      "Basic invoices and payment reminders",
      "One Ferocity Connect Android device included"
    ]
  }
];

export const primaryPublicPlans = publicPlans.filter((plan) => !["calls", "job_tracker"].includes(plan.key));
export const jobTrackerPlan = publicPlans.find((plan) => plan.key === "job_tracker")!;

export function isSelfServePlanKey(value: string): value is SelfServePlanKey {
  return value === publicConnectPlan.key || publicPlans.some((plan) => plan.key === value);
}

export function getPublicPlan(value: string) {
  if (value === publicConnectPlan.key) {
    return {
      ...publicConnectPlan,
      bestFor: "Businesses that want Ferocity's approved SMS workflows without subscribing to the full operating system.",
      bullets: [
        "One paired Android device included",
        "Approved follow-ups, reminders, review requests, and customer replies",
        "Consent, quiet hours, STOP/HELP, pacing, and delivery-health controls"
      ],
      moreFeatures: [
        "Canonical Ferocity conversation history",
        "Failure isolation and explicit retry",
        "Customer-owned phone number, SIM, and carrier plan",
        "Additional paired devices available for $10/month each"
      ]
    } satisfies PublicPlan;
  }
  return publicPlans.find((plan) => plan.key === value) ?? null;
}
