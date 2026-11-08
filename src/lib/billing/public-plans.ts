export type SelfServePlanKey = "free" | "ferocity_connect" | "calls" | "job_tracker" | "starter" | "growth" | "operator";

export const publicConnectPlan = {
  key: "ferocity_connect" as const,
  name: "Ferocity Connect",
  price: "$29/mo",
  priceCents: 2900,
  fit: "Turn the Android business phone you already own into a Ferocity-controlled texting line.",
  additionalDevicePrice: "$10/mo per additional Android device"
};

export type PublicPlan = {
  key: SelfServePlanKey;
  name: string;
  price: string;
  priceCents: number;
  annualPrice?: string;
  annualPriceCents?: number;
  fit: string;
  bestFor: string;
  bullets: string[];
  moreFeatures: string[];
  featured?: boolean;
  salesAssisted?: boolean;
};

export const publicEarnPlan = {
  key: "earn" as const,
  name: "Ferocity Earn",
  eyebrow: "Pay when the business gets paid",
  price: "No fixed monthly fee",
  fit: "Put Ferocity to work without committing to a fixed monthly subscription.",
  rates: "0.9% when your business brings an opportunity to Ferocity to manage. 6% when Ferocity creates the opportunity. The two rates never stack.",
  eligibility: "Earn applies to eligible revenue actually collected—not leads, estimates, contracts, completed jobs, or unpaid invoices.",
  costs: "Provider usage, payment processing, advertising spend, and third-party costs remain separate unless Ferocity approves a written pilot exception.",
  cta: "Start with Ferocity Earn"
};

export const publicManagedVoicePricing = {
  calls: { includedMinutes: 0, overageCentsPerCompletedMinute: 25 },
  starter: { includedMinutes: 25, overageCentsPerCompletedMinute: 25 },
  growth: { includedMinutes: 100, overageCentsPerCompletedMinute: 25 },
  operator: { includedMinutes: 300, overageCentsPerCompletedMinute: 25 }
} as const;

export function managedVoicePricingLabel(planKey: keyof typeof publicManagedVoicePricing) {
  const pricing = publicManagedVoicePricing[planKey];
  const overage = `$${(pricing.overageCentsPerCompletedMinute / 100).toFixed(2)} per completed minute`;
  return pricing.includedMinutes > 0
    ? `${pricing.includedMinutes} managed voice minutes each month; then ${overage}.`
    : `Managed calling is ${overage}; no included-minute allowance.`;
}

export const publicManagedSmsPricing = {
  starter: { includedSegments: 100, overageCentsPerSegment: 4 },
  growth: { includedSegments: 300, overageCentsPerSegment: 4 },
  operator: { includedSegments: 1000, overageCentsPerSegment: 4 }
} as const;

export function managedSmsPricingLabel(planKey: keyof typeof publicManagedSmsPricing) {
  const pricing = publicManagedSmsPricing[planKey];
  return `${pricing.includedSegments.toLocaleString("en-US")} hosted SMS segments each month when the managed route is active; then $${(pricing.overageCentsPerSegment / 100).toFixed(2)} per segment. Connect and BYO routes have no Ferocity per-message charge.`;
}

export const publicPlans: PublicPlan[] = [
  {
    key: "free",
    name: "Free",
    price: "$0 forever",
    priceCents: 0,
    fit: "Put the business foundation in one place before paying for automation.",
    bestFor: "Owners who want to organize real business information, capture a limited number of leads, and experience Ferocity's guidance without a card or subscription commitment.",
    bullets: [
      "One business workspace and owner account",
      "Shared Business Brain foundation",
      "Basic customer, lead, job, and task organization",
      "One active lead form and up to 25 new leads each month",
      "Limited Ask Ferocity guidance and safe drafts",
      "Manual follow-up and exports with Ferocity branding"
    ],
    moreFeatures: [
      "No credit card required",
      "One business profile and primary service area",
      "Basic source tracking",
      "Manual tasks and approval-first workflows",
      "Limited proof capture and content drafts",
      "Core setup guidance",
      "No managed voice or hosted SMS allowance",
      "No automatic publishing, ad spend, provider writes, or customer messaging",
      "Upgrade without migrating business records"
    ]
  },
  {
    key: "calls",
    name: "Ferocity Calls",
    price: "$49/mo + $0.25/completed voice minute",
    priceCents: 4900,
    fit: "Never let another valuable call reach a dead end.",
    bestFor: "Give customers and leads a capable phone experience that answers, understands, and advances the conversation while preserving the systems you already use.",
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
    price: "$149/mo",
    priceCents: 14900,
    annualPrice: "$1,490/year",
    annualPriceCents: 149000,
    fit: "Stop running the everyday business from memory.",
    bestFor: "Give the business one memory, one attention list, and an AI operator that handles routine work under the authority level the owner chooses.",
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
      "Receipt, bill, warranty, and statement intelligence with the original source preserved",
      "A business objective and bottleneck plan with assumptions shown instead of hidden",
      "Review-first graphics",
      "Hosted service and growth-page drafts",
      "30-day SEO content plan",
      "AI Marketing Department recommendations and campaign drafts",
      "Video Ad Studio scripts, hooks, scenes, and briefs",
      "Ad launch kits with manual export",
      "2 original organic publishing moments each week, adapted for connected business profiles after opt-in and review",
      "Website publishing setup and manual export",
      "Daily Owner Brief generated on demand",
      "Worker requests and availability intake",
      "AI-assisted labor match suggestions",
      "Managed-ad budget safeguards when that service is chosen",
      "One Ferocity Connect Android device included"
    ]
  },
  {
    key: "growth",
    name: "Growth",
    price: "$349/mo",
    priceCents: 34900,
    annualPrice: "$3,490/year",
    annualPriceCents: 349000,
    fit: "Turn today’s work into tomorrow’s growth.",
    bestFor: "Connect follow-up, proof, reviews, content, search, campaigns, and revenue so every lead and completed job can create the next opportunity.",
    bullets: [
      "Everything in Starter",
      "Faster response and persistent follow-up until the customer answers",
      "SMS, email, reviews, and recovery work unified in one customer history",
      "Repeat business built through memberships, reminders, and retention campaigns",
      "Job proof converted into content, reviews, and publish-ready marketing",
      "Lead qualification, appointment show-up improvement, and old-opportunity recovery",
      "Search, AI-search, content, and campaign work created from real business data",
      "4 original organic publishing moments each week, adapted across connected profiles",
      "Lead sources and campaigns traced through booked and paid work",
      "Growth planned backward from collected cash through leads, appointments, estimates, capacity, and margin",
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
      "Ideal-customer, ideal-job, offer, and customer-language memory that improves from real outcomes",
      "Video Ad Studio variants and provider-ready briefs",
      "Bring-your-own provider credential vault",
      "Bulk email workflow access with a connected provider",
      "Owner AI decision memory",
      "AI monitoring and briefing queues",
      "Managed-ad budget controls and reporting",
      "One Ferocity Connect Android device included"
    ],
    featured: true
  },
  {
    key: "operator",
    name: "Operator",
    price: "Custom · typically from $699/mo",
    priceCents: 69900,
    annualPrice: "$6,990/year",
    annualPriceCents: 699000,
    fit: "Put an AI operating team behind the entire day.",
    bestFor: "Have Ferocity proactively watch and coordinate sales, jobs, money, schedules, the team, customers, and connected systems—then bring people the decisions that truly need them.",
    bullets: [
      "Everything in Growth",
      "Up to 7 original organic publishing moments each week, continually informed by real business activity",
      "Continuous operating-day monitoring with important decisions remembered",
      "Scheduling, job progress, collections, and customer handoffs coordinated",
      "Reputation, backlinks, and growth opportunities watched proactively",
      "Demand automatically held or redirected when capacity, margin, acquisition cost, or data quality becomes unsafe",
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
      "Closed-loop growth controller with experiment guardrails and creative lifecycle monitoring",
      "Owner-only personal operations queue",
      "Cross-platform owner event registry",
      "Advanced labor matching and operations visibility",
      "Multi-platform managed-ad controls when chosen",
      "Managed video production path when chosen",
      "One Ferocity Connect Android device included"
    ],
    salesAssisted: true
  },
  {
    key: "job_tracker",
    name: "Job Tracker",
    price: "$39/mo",
    priceCents: 3900,
    fit: "Know what every job costs, owes, and earns.",
    bestFor: "Get focused job and money control without subscribing to Ferocity's complete sales, growth, and operating departments.",
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

export type BillingInterval = "month" | "year";

export function publicPlanPrice(plan: PublicPlan, interval: BillingInterval = "month") {
  if (plan.salesAssisted) {
    return { label: plan.price, cents: plan.priceCents };
  }
  if (interval === "year" && plan.annualPrice && plan.annualPriceCents) {
    return { label: plan.annualPrice, cents: plan.annualPriceCents };
  }
  return { label: plan.price, cents: plan.priceCents };
}

export function isSelfServePlanKey(value: string): value is SelfServePlanKey {
  return value === publicConnectPlan.key || publicPlans.some((plan) => plan.key === value);
}

export function isStripeSelfServePlanKey(value: string): value is Exclude<SelfServePlanKey, "free"> {
  return isSelfServePlanKey(value) && value !== "free";
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
