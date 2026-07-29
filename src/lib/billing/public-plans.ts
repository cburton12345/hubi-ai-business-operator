export type SelfServePlanKey = "job_tracker" | "starter" | "growth" | "operator";

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
    key: "starter",
    name: "Starter",
    price: "$79/mo",
    priceCents: 7900,
    fit: "Your core AI operator.",
    bestFor: "Ferocity watches the everyday business and handles routine work under the authority level the owner chooses.",
    bullets: [
      "Command Engine: ask Ferocity in plain English",
      "AI Office Manager: leads, reminders, and daily queue",
      "Customers, estimates, jobs, schedule, invoices, and payments",
      "Simple field view, job evidence, and customer appointment links",
      "Authority Lite: turn finished jobs into proof and review drafts",
      "AI Estimator and marketing: reviewed bids, SEO, graphics, and ad briefs"
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
    fit: "Your AI growth department.",
    bestFor: "Ferocity connects follow-up, proof, content, search, campaigns, and revenue so the business can create and measure demand.",
    bullets: [
      "Everything in Starter",
      "Office Manager Growth: customer service and marketing follow-up",
      "Shared inbox and lifecycle follow-up that stops when customers respond",
      "Memberships, recurring service, and retention workflows",
      "Authority Plus: proof-to-content bundles and publishing queue",
      "Connected SMS, email, review, and recovery workflows",
      "Qualification funnels, booked-appointment reminders, and show-rate tracking",
      "Content Studio, SEO/GEO, and AI-search visibility",
      "Campaign variants, marketing memory, and revenue attribution",
      "Backlink health, linkable assets, and earned-link opportunities",
      "Estimator Plus: supplier comparisons and margin review"
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
    fit: "Your AI operating team.",
    bestFor: "Ferocity proactively monitors the operating day and coordinates sales, jobs, money, schedule, team, and connected systems.",
    bullets: [
      "Everything in Growth",
      "AI COO: monitoring, escalation, and decision memory",
      "AI Dispatcher: scheduling, eligibility, coordination, and collections",
      "Authority Manager: reputation, backlink, and opportunity monitoring",
      "Owner Command Center and daily operating digest",
      "Inventory, procurement, workforce, recruiting, and job-cost intelligence",
      "Provider-ready payments, accounting, calendar, voice, video, and integrations"
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
