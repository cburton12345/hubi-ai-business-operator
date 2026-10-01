import {
  jobTrackerPlan,
  publicConnectPlan,
  publicEarnPlan,
  publicPlans
} from "@/lib/billing/public-plans";

export type PublicPlatformKey =
  | "operating_system"
  | "earn"
  | "calls"
  | "ferocity_connect"
  | "job_tracker"
  | "pro_agency"
  | "managed_operator";

export type PublicPlatform = {
  key: PublicPlatformKey;
  name: string;
  eyebrow: string;
  summary: string;
  bestFor: string;
  pricing: string;
  costNotes: string;
  setup: string;
  capabilities: string[];
  detailsHref: string;
  plansHref: string;
  startHref: string;
};

const callsPlan = publicPlans.find((plan) => plan.key === "calls")!;
const starterPlan = publicPlans.find((plan) => plan.key === "starter")!;
const growthPlan = publicPlans.find((plan) => plan.key === "growth")!;
const operatorPlan = publicPlans.find((plan) => plan.key === "operator")!;

export const publicPlatforms: PublicPlatform[] = [
  {
    key: "operating_system",
    name: "Ferocity Operating System",
    eyebrow: "Run the connected business",
    summary: "One operating and control layer across customers, work, people, money, communications, and growth.",
    bestFor: "Businesses that want more than one isolated tool and need the company to keep moving across departments.",
    pricing: `${starterPlan.name} ${starterPlan.price}; ${growthPlan.name} ${growthPlan.price}; ${operatorPlan.name} ${operatorPlan.price}.`,
    costNotes: "Stated managed-provider allowances are included by plan. Advertising spend, payment processing, premium rendered media, usage beyond stated allowances, carrier charges, and other third-party costs remain separate.",
    setup: "Choose a starting level, create the workspace, describe the first business outcome, and connect only the accounts needed for that outcome.",
    capabilities: [
      "Shared Business Brain and Ask Ferocity",
      "Customers, leads, estimates, jobs, schedules, invoices, and payments",
      "Approval controls and authorized routine execution",
      "Growth, reputation, content, communications, and source-to-revenue learning"
    ],
    detailsHref: "/features",
    plansHref: "/pricing#plans",
    startHref: "/start?source=platforms&plan=starter#start-request"
  },
  {
    key: "earn",
    name: publicEarnPlan.name,
    eyebrow: publicEarnPlan.eyebrow,
    summary: publicEarnPlan.fit,
    bestFor: "Businesses that want Ferocity to prove value without a fixed monthly software subscription.",
    pricing: `${publicEarnPlan.price}. ${publicEarnPlan.rates}`,
    costNotes: publicEarnPlan.costs,
    setup: "Request Earn, confirm eligibility and attribution rules, connect payment visibility, and approve the first outcome Ferocity should pursue.",
    capabilities: [
      "The same connected Ferocity workspace",
      "Outcome and attribution tracking",
      "Revenue-based pricing only when eligible revenue is collected",
      "A clean upgrade path into a monthly operating plan"
    ],
    detailsHref: "/pricing#earn",
    plansHref: "/pricing#earn",
    startHref: "/start?source=platforms_earn&plan=earn#start-request"
  },
  {
    key: "calls",
    name: callsPlan.name,
    eyebrow: "Start with the phone department",
    summary: callsPlan.fit,
    bestFor: callsPlan.bestFor,
    pricing: callsPlan.price,
    costNotes: "Completed-minute charges apply. Phone numbers, carrier services, and optional providers may have separate costs. A managed number is created only after the business chooses that path and the required setup passes.",
    setup: "Choose an existing or managed number, configure business and transfer rules, verify consent and recording choices, then certify inbound, callback, and human-transfer behavior.",
    capabilities: callsPlan.bullets.slice(0, 5),
    detailsHref: "/pricing",
    plansHref: "/pricing",
    startHref: "/subscribe?plan=calls"
  },
  {
    key: "ferocity_connect",
    name: publicConnectPlan.name,
    eyebrow: "Android business texting",
    summary: publicConnectPlan.fit,
    bestFor: "Businesses that want approved two-way Ferocity texting from a compatible Android business phone and SIM.",
    pricing: `${publicConnectPlan.price}; ${publicConnectPlan.additionalDevicePrice}.`,
    costNotes: "The customer keeps responsibility for its carrier plan, message/data charges, consent, carrier policies, and lawful use. Ferocity Connect is SMS-only today; managed hosted messaging is a separate route.",
    setup: "Start the plan, download the Android companion, grant required permissions, pair the device securely, choose the SIM, and complete a real send/reply/delivery test.",
    capabilities: [
      "Scheduled and approved business texts",
      "Inbound replies returned to the Ferocity conversation",
      "STOP/HELP, quiet hours, pacing, and delivery-health controls",
      "No separate hosted SMS provider required for the paired-device route"
    ],
    detailsHref: "/ferocity-connect",
    plansHref: "/pricing",
    startHref: "/subscribe?plan=ferocity_connect"
  },
  {
    key: "job_tracker",
    name: jobTrackerPlan.name,
    eyebrow: "Focused jobs and money",
    summary: jobTrackerPlan.fit,
    bestFor: jobTrackerPlan.bestFor,
    pricing: jobTrackerPlan.price,
    costNotes: "Payment-processing and optional provider costs remain separate. Job Tracker can grow into the complete Ferocity operating system without migrating the records.",
    setup: "Create the workspace, add the first job or estimate, choose how receipts and costs enter, and invite field members only when needed.",
    capabilities: jobTrackerPlan.bullets,
    detailsHref: "/pricing",
    plansHref: "/pricing",
    startHref: "/subscribe?plan=job_tracker"
  },
  {
    key: "pro_agency",
    name: "Pro / Agency",
    eyebrow: "More brands, locations, or volume",
    summary: "Coordinate multiple businesses, brands, locations, or client work through a larger Ferocity implementation.",
    bestFor: "Multi-business owners, agencies, franchises, and organizations needing higher limits or advanced integrations.",
    pricing: "Custom pricing after scope and provider requirements are clear.",
    costNotes: "No custom work, provider usage, media spend, or managed service begins without clear written scope and pricing.",
    setup: "Map brands, teams, authority, data boundaries, providers, and rollout order before enabling live actions.",
    capabilities: [
      "Multi-business command and reporting",
      "Higher usage and provider limits",
      "Advanced integration and implementation path",
      "Separated permissions and business context"
    ],
    detailsHref: "/pricing",
    plansHref: "/pricing",
    startHref: "/start?source=platforms&plan=pro_agency#start-request"
  },
  {
    key: "managed_operator",
    name: "Managed Operator",
    eyebrow: "Ferocity operated with you",
    summary: "A managed path for owners who want help configuring, monitoring, reviewing, and improving how Ferocity runs.",
    bestFor: "Owners who want the operating system but do not want to personally manage every setup and tuning decision.",
    pricing: "Custom pricing after the managed scope is agreed.",
    costNotes: "Managed work, provider usage, advertising budgets, payment processing, premium media, and other third-party costs are disclosed separately before activation.",
    setup: "Define the managed scope, authority boundaries, escalation path, providers, success measures, and review cadence.",
    capabilities: [
      "Managed setup and operating review",
      "Growth, follow-up, and workflow tuning",
      "Owner escalation and approval design",
      "Ongoing provider and execution oversight"
    ],
    detailsHref: "/pricing",
    plansHref: "/pricing",
    startHref: "/start?source=platforms&plan=managed_operator#start-request"
  }
];

export function isPublicPlatformKey(value: unknown): value is PublicPlatformKey {
  return typeof value === "string" && publicPlatforms.some((platform) => platform.key === value);
}

export function getPublicPlatform(value: unknown) {
  return isPublicPlatformKey(value)
    ? publicPlatforms.find((platform) => platform.key === value) ?? null
    : null;
}

export function publicPlatformKnowledge() {
  return publicPlatforms.map((platform) => ({
    key: platform.key,
    name: platform.name,
    summary: platform.summary,
    bestFor: platform.bestFor,
    pricing: platform.pricing,
    costNotes: platform.costNotes,
    setup: platform.setup,
    capabilities: platform.capabilities
  }));
}

export function publicPlatformFallback(
  message: string,
  contextKey?: PublicPlatformKey | null,
  conversationHistory: string[] = []
) {
  const selected = getPublicPlatform(contextKey);
  const lower = message.toLowerCase();
  const historyText = conversationHistory.join(" ").trim();
  const contextLower = `${historyText} ${message}`.toLowerCase();
  const hasEarlierContext = conversationHistory.length > 1;
  const visitorIsConfusedOrFrustrated = /^(what\??|huh\??|why\??)|\b(wtf|confus|doesn['’]?t make sense|not what i asked|answer me)\b/.test(lower.trim());
  const ambitiousRevenueGoal = /\b(million|revenue|income|make (?:more )?money|earn more|scale|grow(?:th)?|double|triple|sales target|more customers?|more clients?|more patients?|more bookings?|more orders?)\b/.test(contextLower);
  const capacityGoal = /\b(capacity|overwhelm|burnout|without hiring|same staff|less owner|depends? (?:too much )?on me|work fewer hours|serve more)\b/.test(contextLower);
  if (selected && /price|pricing|cost|fee|charge|included/.test(lower)) {
    return `${selected.name}: ${selected.pricing} ${selected.costNotes}`;
  }
  if (selected && /setup|start|connect|install|onboard/.test(lower)) {
    return `${selected.name} setup: ${selected.setup}`;
  }
  if (selected) {
    return `${selected.name} is best suited for ${selected.bestFor.toLowerCase()} ${selected.summary} What outcome are you trying to improve first?`;
  }

  const priorities: Array<{ label: string; action: string; question: string }> = [];
  if (ambitiousRevenueGoal) {
    priorities.push({
      label: "Turn the growth goal into business math",
      action: "work backward from the target using average customer value, qualified opportunities, conversion rate, delivery capacity, collection rate, and the products or services the business actually wants to grow",
      question: "Which product or service produces the best customers, and roughly what is a typical collected sale worth?"
    });
    priorities.push({
      label: "Build a dependable opportunity-to-customer path",
      action: "strengthen the right mix of referrals, visibility, useful content, reputation, intake, booking or sales, and measured follow-up for that specific business",
      question: "Where do the best customers come from today?"
    });
    priorities.push({
      label: "Make sure growth remains deliverable and profitable",
      action: "connect capacity, scheduling, fulfillment, customer communication, billing, and margin so added demand does not simply create chaos or unprofitable work",
      question: "What currently limits how much good work the business can take on?"
    });
  }
  if (capacityGoal && !ambitiousRevenueGoal) {
    priorities.push({
      label: "Increase capacity without increasing owner drag",
      action: "identify repeatable work, missing handoffs, approval delays, and owner-dependent decisions, then automate or assign the safest high-frequency steps first",
      question: "Which recurring work or decision pulls the owner back in most often?"
    });
  }
  if (/inquir|lead|follow.?up|estimate|proposal|sales/.test(contextLower)) {
    priorities.push({
      label: "Stop leads from cooling off",
      action: "capture each inquiry, assign the next step, and keep approved follow-up moving until there is a real outcome",
      question: "Where do new inquiries arrive today, and who is supposed to own the next response?"
    });
  }
  if (/onboard|intake|new client|new customer|kick.?off/.test(contextLower)) {
    priorities.push({
      label: "Make onboarding repeatable",
      action: "collect the right information and documents, create the work, and show both sides exactly what happens next",
      question: "What information or approval is most often missing when a new customer starts?"
    });
  }
  if (/document|paperwork|email|attachment|file|information.*lost/.test(contextLower)) {
    priorities.push({
      label: "End document and communication handoff gaps",
      action: "keep messages, files, decisions, and responsibilities attached to the same customer or work context",
      question: "Where are those messages and documents kept now?"
    });
  }
  if (/invoice|collect|overdue|payment|cash flow|receivable/.test(contextLower)) {
    priorities.push({
      label: "Shorten the path to payment",
      action: "track invoice status, prepare or send permitted reminders, and escalate exceptions before they become old receivables",
      question: "What creates the biggest delay between finishing the work and collecting the money?"
    });
  }
  if (/profit|margin|cost|waste|expense|too expensive|food cost|labor cost/.test(contextLower)) {
    priorities.push({
      label: "Protect profitable work",
      action: "connect pricing, direct costs, labor, overhead, fulfillment, and collected revenue so the business can favor what actually produces healthy margin",
      question: "Which costs or types of work are putting the most pressure on margin?"
    });
  }
  if (/schedule|appointment|calendar|dispatch|booking/.test(contextLower)) {
    priorities.push({
      label: "Remove scheduling friction",
      action: "coordinate availability, confirmations, changes, and the people responsible without losing the customer context",
      question: "Which calendar or scheduling system holds the real availability today?"
    });
  }
  if (/job|project|crew|field|work order|delivery/.test(contextLower)) {
    priorities.push({
      label: "Keep work moving without owner chasing",
      action: "surface blocked work, assign authorized next steps, and bring only meaningful exceptions back to the right person",
      question: "Where is active work tracked now, and what usually forces the owner to step in?"
    });
  }
  if (/employee|worker|crew|hour|time.?track|payroll|availability|credential/.test(contextLower)) {
    priorities.push({
      label: "Give the workforce one simple operating rhythm",
      action: "coordinate schedules, hours, availability, field updates, credentials, and payroll-ready records without burying employees in the owner dashboard",
      question: "How are schedules, hours, and field updates recorded today?"
    });
  }
  if (/receipt|expense|purchase|job cost|tax|warrant|statement|bookkeep/.test(contextLower)) {
    priorities.push({
      label: "Turn paperwork into usable financial control",
      action: "capture receipts, expenses, warranties, and statements, connect them to the right work, and surface uncertain details for quick review",
      question: "Which financial documents are hardest to capture or connect to the right customer, project, or property?"
    });
  }
  if (/phone|call|answer|voicemail|reception/.test(contextLower)) {
    priorities.push({
      label: "Stop valuable calls from reaching a dead end",
      action: "answer and qualify calls in business context, book within approved rules, and transfer urgent or requested conversations to the right person",
      question: "What happens to an unanswered call today, and who should receive a human transfer?"
    });
  }
  if (/text|sms|android|samsung|message/.test(contextLower)) {
    priorities.push({
      label: "Make business texting part of the customer history",
      action: "use a compatible connected Android phone or configured provider for authorized messages, replies, scheduling, and delivery evidence",
      question: "What kinds of messages do you send most often, and which business number should customers recognize?"
    });
  }
  if (/market|advertis|content|seo|ai.?search|local presence|ugc|video|social|review|more (?:customer|client|patient|booking|order|member)|grow/.test(contextLower)) {
    priorities.push({
      label: "Grow from what actually produces business",
      action: "coordinate local presence, SEO and AI-search visibility, useful content, UGC and video, organic distribution, reviews, campaigns, and follow-up, then connect sources to qualified leads, revenue, and profit where data is available",
      question: "Which offer or type of customer is most valuable for you to grow first?"
    });
  }

  if (visitorIsConfusedOrFrustrated && ambitiousRevenueGoal) {
    return "Sorry—I overcomplicated that. You already gave me the important part: you want to grow the business substantially. In plain English, Ferocity would work backward from the goal, determine how many valuable customers or sales it requires, find where opportunities are being lost, and improve the acquisition, follow-up, delivery, collections, and capacity needed to reach it without creating chaos. Which product or service produces your best customers, and roughly what is a typical collected sale worth?";
  }

  if (priorities.length > 0) {
    if (priorities.length >= 2) {
      const improvementMap = priorities
        .slice(0, 5)
        .map((priority, index) => `${index + 1}. ${priority.label} — ${priority.action}.`)
        .join("\n");
      const opening = "You have given me enough to map the first moves.";
      const nextQuestion = ambitiousRevenueGoal
        ? "Which product or service produces your best customers, and roughly what is a typical collected sale worth?"
        : "Which systems currently hold the customer record, active work, and invoices?";
      return `${opening} I would prioritize:\n${improvementMap}\n\nFerocity can do more than connect the tools you already have: it can create the missing workflow, keep the customer, work, communication, and money context together, and handle authorized routine steps while routing exceptions to a person. I would start with #1, then connect the other priorities so fixing one problem does not create another. ${nextQuestion}`;
    }
    if (hasEarlierContext) {
      const priority = priorities[0];
      return `Based on what you have shared, I would make “${priority.label}” the first operating priority and ${priority.action}. Ferocity can create that missing operating path, preserve the surrounding customer and business context, and keep authorized next steps moving instead of merely pointing out the problem. ${priority.question}`;
    }
    return `I would start by helping you ${priorities[0].action}. Ferocity would keep the customer, work, communication, and next authorized action in shared context, while surfacing exceptions that need a person. Before recommending a plan, I would confirm how the process works today. Which tool holds it now, and where does it usually break?`;
  }

  if (/phone|call|answer|voicemail/.test(contextLower)) {
    const calls = getPublicPlatform("calls")!;
    return `I would start with the customer-call bottleneck. ${calls.name} can answer and qualify calls, preserve the conversation context, book within approved rules, and transfer urgent or requested human conversations. ${calls.pricing} ${calls.costNotes} What happens to an unanswered call today, and who should receive a human transfer?`;
  }

  if (/text|sms|android/.test(contextLower)) {
    const connect = getPublicPlatform("ferocity_connect")!;
    return `I would start with the texting workflow. ${connect.name} can prepare and send authorized messages through a paired compatible Android business phone, return replies to Ferocity, and keep delivery health, consent, pacing, and emergency controls visible. ${connect.pricing} ${connect.costNotes} What kinds of messages do you send most often?`;
  }

  if (hasEarlierContext) {
    if (visitorIsConfusedOrFrustrated) {
      return "You’re right—that was unclear. I should have answered what you said instead of repeating an intake question. Tell me the business type and the result you want in one sentence, and I’ll give you a direct, practical first plan—not another questionnaire.";
    }
    return "I’m using what you already told me rather than restarting the intake. The next detail that will change my recommendation is where the process breaks today: before the opportunity arrives, during the response or sale, while the work is being delivered, or when it is time to collect and follow up?";
  }

  return "I can work from that. To avoid forcing your business into a generic product path, tell me where the result breaks down today: attracting the opportunity, responding, selling or quoting, delivering the work, collecting payment, or keeping customers coming back?";
}
