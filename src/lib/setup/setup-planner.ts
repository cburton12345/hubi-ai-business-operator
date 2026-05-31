export type SetupPlanChange = {
  area: string;
  title: string;
  summary: string;
  targetHref: string;
  riskLevel: "low" | "medium" | "high";
  applyMode: "log_only" | "manual_review" | "future_provider";
};

export type SetupPlanVerticalTarget = {
  verticalKey: string;
  status: "active" | "paused" | "not_needed";
  priority: "low" | "normal" | "high";
  stepKeys: string[];
};

export type SetupPlanServiceTarget = {
  featureKey: string;
  mode: "draft_only" | "review_required";
  status: "enabled" | "limited";
  usageLimit: number | null;
  overagePolicy: "block" | "allow_with_review";
};

export type SetupPlanAssetTarget = {
  assetType:
    | "brand_profile"
    | "service"
    | "service_area"
    | "lead_form"
    | "communication_template"
    | "landing_page"
    | "growth_source"
    | "follow_up_workflow"
    | "review_workflow"
    | "marketing_settings";
  title: string;
  summary: string;
  status: "draft" | "active" | "planned" | "review_required";
};

export type SetupPlan = {
  request: string;
  templateKey: string;
  templateName: string;
  businessType: string;
  goal: string;
  summary: string;
  changes: SetupPlanChange[];
  verticalTargets: SetupPlanVerticalTarget[];
  serviceTargets: SetupPlanServiceTarget[];
  assetTargets: SetupPlanAssetTarget[];
  followUpQuestions: string[];
  safeDefaults: string[];
  blockedUntil: string[];
  undoNote: string;
};

function hasAny(value: string, terms: string[]) {
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function uniqueChanges(changes: SetupPlanChange[]) {
  const seen = new Set<string>();
  return changes.filter((change) => {
    const key = `${change.area}:${change.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildSetupPlan(request: string): SetupPlan {
  const cleanRequest = request.trim();
  const lower = cleanRequest.toLowerCase();
  const isRoofing = hasAny(lower, ["roof", "storm", "hail", "siding", "gutter"]);
  const isRental = hasAny(lower, ["trailer", "rental", "rentals", "equipment"]);
  const isSoftware = hasAny(lower, ["saas", "software", "app", "platform"]);
  const wantsReviews = hasAny(lower, ["review", "google maps", "gbp", "reputation"]);
  const wantsFollowUp = hasAny(lower, ["follow", "missed call", "text back", "callback", "stale lead", "nurture"]);
  const wantsSeo = hasAny(lower, ["seo", "city", "service page", "location", "blog", "content", "rank"]);
  const wantsAds = hasAny(lower, ["ads", "facebook", "reddit", "google ads", "microsoft", "yahoo", "campaign"]);
  const wantsCompany = hasAny(lower, ["company", "brand", "business", "add my", "profile"]);
  const wantsWorkflow = hasAny(lower, ["workflow", "automation", "invoice", "estimate", "job"]);
  const wantsWebsite = hasAny(lower, ["website", "site", "wordpress", "webflow", "cms", "form", "embed"]);
  const wantsPayments = hasAny(lower, ["payment", "pay", "stripe", "ledger", "bookkeeping", "collect"]);

  const businessType = isRoofing ? "Roofing / storm service" : isRental ? "Rental business" : isSoftware ? "Software / SaaS" : "Local service business";
  const templateKey = isRoofing ? "roofing_storm" : isRental ? "rental_operator" : isSoftware ? "software_growth" : "local_service";
  const templateName = isRoofing ? "Roofing storm growth" : isRental ? "Rental lead recovery" : isSoftware ? "Software growth loop" : "Local service operator";
  const goal = wantsSeo || wantsAds ? "Grow demand and track ROI" : wantsFollowUp || wantsWorkflow ? "Run cleaner operations and recover leads" : "Set up the business foundation";

  const changes: SetupPlanChange[] = [];
  const verticalTargets: SetupPlanVerticalTarget[] = [
    { verticalKey: "get_leads", status: "active", priority: wantsSeo || wantsAds || isRoofing ? "high" : "normal", stepKeys: ["brand_basics", "seo_drafts", "forms"] },
    { verticalKey: "follow_up", status: "active", priority: wantsFollowUp || isRoofing ? "high" : "normal", stepKeys: ["operator_scan", "message_templates"] }
  ];
  const serviceTargets: SetupPlanServiceTarget[] = [
    { featureKey: "ai_generation", mode: "review_required", status: "limited", usageLimit: 250, overagePolicy: "block" },
    { featureKey: "follow_up_recovery", mode: "review_required", status: "limited", usageLimit: 500, overagePolicy: "allow_with_review" }
  ];
  const assetTargets: SetupPlanAssetTarget[] = [
    {
      assetType: "brand_profile",
      title: `${businessType} profile`,
      summary: "Create or update an editable business profile so later assets attach to the right brand.",
      status: "draft"
    },
    {
      assetType: "lead_form",
      title: "Quote request form",
      summary: "Create a public lead form for website/demo traffic with source tracking.",
      status: "active"
    },
    {
      assetType: "communication_template",
      title: "New lead response",
      summary: "Prepare a first-response template that requires approval before sending.",
      status: "review_required"
    },
    {
      assetType: "follow_up_workflow",
      title: "Stale lead recovery",
      summary: "Create an internal follow-up workflow seed so old leads do not disappear.",
      status: "planned"
    },
    {
      assetType: "marketing_settings",
      title: "Manual approval marketing controls",
      summary: "Set marketing, content, reviews, and follow-up to draft/review mode by default.",
      status: "review_required"
    }
  ];

  if (wantsWebsite || wantsSeo || changes.length === 0) {
    assetTargets.push({
      assetType: "growth_source",
      title: "Website connector",
      summary: "Prepare quote links, embedded forms, and tracking helper instructions so the customer website sends source data into Ferocity.",
      status: "planned"
    });
    serviceTargets.push({ featureKey: "growth_attribution", mode: "review_required", status: "enabled", usageLimit: null, overagePolicy: "allow_with_review" });
    changes.push({
      area: "Website",
      title: "Connect the customer website",
      summary: "Set up the quote form, source tracking helper, page/referrer capture, and the SEO publishing path for the customer's site.",
      targetHref: "/app/website",
      riskLevel: "medium",
      applyMode: "manual_review"
    });
  }

  if (wantsCompany || changes.length === 0) {
    changes.push({
      area: "Company",
      title: "Confirm workspace, brand, services, and service areas",
      summary: "Make sure Ferocity knows the company name, main offer, service area, phone/email, and the work it should prioritize.",
      targetHref: "/app/setup",
      riskLevel: "low",
      applyMode: "manual_review"
    });
  }

  if (wantsSeo || isRoofing || isRental) {
    assetTargets.push(
      {
        assetType: "service",
        title: isRoofing ? "Roof repair" : isRental ? "Trailer rental" : "Core service",
        summary: "Add a first editable service record for SEO, forms, and follow-up routing.",
        status: "active"
      },
      {
        assetType: "service_area",
        title: "Primary service area",
        summary: "Add an editable service area placeholder so city pages have a starting point.",
        status: "draft"
      },
      {
        assetType: "landing_page",
        title: isRoofing ? "Storm damage roof repair" : isRental ? "Trailer rental request" : "Service request page",
        summary: "Create a draft hosted growth page target tied to lead capture.",
        status: "draft"
      },
      {
        assetType: "growth_source",
        title: "Organic local SEO",
        summary: "Create attribution defaults for organic/local SEO leads.",
        status: "active"
      }
    );
    serviceTargets.push(
      { featureKey: "seo_autopilot", mode: "draft_only", status: "limited", usageLimit: 150, overagePolicy: "block" },
      { featureKey: "hosted_growth_pages", mode: "draft_only", status: "limited", usageLimit: 150, overagePolicy: "block" },
      { featureKey: "growth_attribution", mode: "review_required", status: "enabled", usageLimit: null, overagePolicy: "allow_with_review" }
    );
    changes.push({
      area: "SEO",
      title: "Prepare useful service and city page drafts",
      summary: "Create draft page targets tied to real services, towns, lead forms, and quality review so pages do not become thin AI SEO.",
      targetHref: "/app/sites",
      riskLevel: "medium",
      applyMode: "manual_review"
    });
    changes.push({
      area: "Growth",
      title: "Set organic-first channel plan",
      summary: "Start with local SEO, review flow, referral/community activity, and follow-up before pushing paid ad spend.",
      targetHref: "/app/growth",
      riskLevel: "low",
      applyMode: "manual_review"
    });
  }

  if (wantsFollowUp || wantsWorkflow || isRoofing) {
    serviceTargets.push(
      { featureKey: "sms_send", mode: "review_required", status: "limited", usageLimit: 100, overagePolicy: "block" },
      { featureKey: "email_send", mode: "review_required", status: "limited", usageLimit: 500, overagePolicy: "allow_with_review" }
    );
    changes.push({
      area: "Follow-up",
      title: "Set lead recovery and missed callback workflow",
      summary: "Queue stale lead checks, callback reminders, estimate follow-ups, and draft replies for review before any email or SMS sends.",
      targetHref: "/app/operator",
      riskLevel: "medium",
      applyMode: "manual_review"
    });
  }

  if (wantsReviews || isRoofing) {
    assetTargets.push(
      {
        assetType: "communication_template",
        title: "Review request",
        summary: "Prepare a review request template that stays approval-required.",
        status: "review_required"
      },
      {
        assetType: "review_workflow",
        title: "Review request after completed job",
        summary: "Create a draft review workflow seed with negative-experience interception.",
        status: "draft"
      }
    );
    verticalTargets.push({ verticalKey: "get_reviews", status: "active", priority: "high", stepKeys: ["review_requests", "gbp_reviews"] });
    serviceTargets.push({ featureKey: "review_requests", mode: "review_required", status: "limited", usageLimit: 500, overagePolicy: "allow_with_review" });
    changes.push({
      area: "Reviews",
      title: "Prepare review request workflow",
      summary: "Add a review request path after completed work, with negative-experience interception and public response drafts requiring approval.",
      targetHref: "/app/review",
      riskLevel: "medium",
      applyMode: "manual_review"
    });
  }

  if (wantsAds) {
    assetTargets.push({
      assetType: "growth_source",
      title: "Paid campaign tracking",
      summary: "Create paused/read-only attribution defaults for paid campaigns before spend is connected.",
      status: "planned"
    });
    verticalTargets.push({ verticalKey: "connect_tools", status: "active", priority: "normal", stepKeys: ["provider_steps", "live_actions"] });
    changes.push({
      area: "Ads",
      title: "Prepare read-only ad and attribution setup",
      summary: "Track campaign sources and prepare provider connections. Budget changes and publishing stay disabled until accounts, limits, and approvals are ready.",
      targetHref: "/app/integrations",
      riskLevel: "high",
      applyMode: "future_provider"
    });
  }

  if (wantsWorkflow || wantsPayments) {
    assetTargets.push(
      {
        assetType: "communication_template",
        title: "Estimate follow-up",
        summary: "Prepare an estimate follow-up template that requires review.",
        status: "review_required"
      },
      {
        assetType: "communication_template",
        title: "Invoice follow-up",
        summary: "Prepare a polite invoice follow-up template that requires review.",
        status: "review_required"
      },
      {
        assetType: "follow_up_workflow",
        title: "Estimate follow-up",
        summary: "Create an internal estimate follow-up workflow seed.",
        status: "planned"
      },
      {
        assetType: "follow_up_workflow",
        title: "Invoice follow-up",
        summary: "Create an internal invoice follow-up workflow seed.",
        status: "planned"
      },
      {
        assetType: "growth_source",
        title: "Payment and ledger readiness",
        summary: "Prepare invoice payment request records, manual payment tracking, Stripe checkout mapping, and ledger visibility.",
        status: "planned"
      }
    );
    verticalTargets.push(
      { verticalKey: "schedule_work", status: "active", priority: "normal", stepKeys: ["callbacks", "calendar_ready"] },
      { verticalKey: "track_money", status: "active", priority: "high", stepKeys: ["attribution", "billing_ready"] }
    );
    serviceTargets.push({ featureKey: "calendar_sync", mode: "review_required", status: "limited", usageLimit: 250, overagePolicy: "block" });
    serviceTargets.push({ featureKey: "payment_collection", mode: "review_required", status: "limited", usageLimit: 250, overagePolicy: "allow_with_review" });
    changes.push({
      area: "Operations",
      title: "Review estimate, invoice, job, and task automations",
      summary: "Prepare reminders for estimates, unpaid invoices, unscheduled jobs, review requests, and open tasks without auto-sending customer messages.",
      targetHref: "/app/service",
      riskLevel: "medium",
      applyMode: "manual_review"
    });
    changes.push({
      area: "Payments",
      title: "Prepare payment collection and ledger workflow",
      summary: "Prepare Stripe invoice payment links when keys are present, manual payment recording, payment history, and ledger entries before customer-facing sends.",
      targetHref: "/app/service",
      riskLevel: "high",
      applyMode: "manual_review"
    });
  }

  changes.push({
    area: "Safety",
    title: "Keep public and paid actions controlled",
    summary: "Use draft-only or review-required modes for AI, email, SMS, publishing, ads, reviews, and provider sync until tier limits are final.",
    targetHref: "/app/controls",
    riskLevel: "high",
    applyMode: "manual_review"
  });

  return {
    request: cleanRequest,
    templateKey,
    templateName,
    businessType,
    goal,
    summary: `Ferocity will start with ${businessType.toLowerCase()} defaults and keep live sends, publishing, syncing, and ad spend behind review.`,
    changes: uniqueChanges(changes),
    verticalTargets: mergeVerticalTargets(verticalTargets),
    serviceTargets: mergeServiceTargets(serviceTargets),
    assetTargets: mergeAssetTargets(assetTargets),
    followUpQuestions: buildFollowUpQuestions({
      wantsSeo,
      wantsAds,
      wantsFollowUp,
      wantsReviews,
      wantsWorkflow,
      wantsCompany,
      isRoofing,
      isRental,
      isSoftware
    }),
    safeDefaults: [
      "Draft first, review before live actions",
      "Track source, service, city, lead, job, invoice, and revenue whenever possible",
      "Record payment requests, payments received, and ledger entries before trusting revenue reports",
      "Use plain setup steps instead of making the owner configure APIs",
      "Protect AI/provider usage with controls and limits"
    ],
    blockedUntil: [
      "Email/SMS provider keys and consent rules are configured",
      "Domain and sender verification are complete",
      "Paid plan limits and overage rules are approved",
      "Public publishing and ad permissions are reviewed"
    ],
    undoNote: "Applied setup runs log each changed record so Ferocity can revert this setup run from the activity log."
  };
}

function mergeAssetTargets(targets: SetupPlanAssetTarget[]) {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.assetType}:${target.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeVerticalTargets(targets: SetupPlanVerticalTarget[]) {
  const byKey = new Map<string, SetupPlanVerticalTarget>();
  const priorityRank = { low: 1, normal: 2, high: 3 };
  for (const target of targets) {
    const existing = byKey.get(target.verticalKey);
    if (!existing) {
      byKey.set(target.verticalKey, { ...target, stepKeys: [...target.stepKeys] });
      continue;
    }
    existing.status = target.status === "active" ? "active" : existing.status;
    existing.priority = priorityRank[target.priority] > priorityRank[existing.priority] ? target.priority : existing.priority;
    existing.stepKeys = Array.from(new Set([...existing.stepKeys, ...target.stepKeys]));
  }
  return Array.from(byKey.values());
}

function mergeServiceTargets(targets: SetupPlanServiceTarget[]) {
  const byKey = new Map<string, SetupPlanServiceTarget>();
  for (const target of targets) {
    const existing = byKey.get(target.featureKey);
    if (!existing) {
      byKey.set(target.featureKey, target);
      continue;
    }
    byKey.set(target.featureKey, {
      ...target,
      usageLimit: existing.usageLimit === null || target.usageLimit === null ? null : Math.max(existing.usageLimit, target.usageLimit),
      overagePolicy: existing.overagePolicy === "allow_with_review" || target.overagePolicy === "allow_with_review" ? "allow_with_review" : "block"
    });
  }
  return Array.from(byKey.values());
}

function buildFollowUpQuestions(input: {
  wantsSeo: boolean;
  wantsAds: boolean;
  wantsFollowUp: boolean;
  wantsReviews: boolean;
  wantsWorkflow: boolean;
  wantsCompany: boolean;
  isRoofing: boolean;
  isRental: boolean;
  isSoftware: boolean;
}) {
  const questions = [
    "What is the exact business name, phone number, main service area, and best contact email?",
    "Which services make the most money and which ones should Ferocity avoid pushing?",
    "Who should approve public content, customer messages, and provider connections?"
  ];

  if (input.wantsSeo || input.isRoofing || input.isRental) {
    questions.push("Which cities or neighborhoods should get service pages first?");
  }
  if (input.wantsFollowUp || input.wantsWorkflow) {
    questions.push("How soon should Ferocity flag a lead, estimate, invoice, or callback as needing follow-up?");
  }
  if (input.wantsReviews) {
    questions.push("When is the right moment to ask for a review after a job or delivery?");
  }
  if (input.wantsAds) {
    questions.push("What monthly ad budget limit should protect the workspace before paid channels go live?");
  }
  if (input.isSoftware) {
    questions.push("What demo, trial, or sales call should a software lead be pushed toward?");
  }

  return questions;
}
