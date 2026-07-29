import { analyzePublicWebsiteUrl, type PublicWebsiteAnalysis } from "@/lib/marketing-os/website-import-processor";

export type HealthStatus = "good" | "needs_work" | "missing";

export type WebsiteGradeFinding = {
  area: string;
  status: HealthStatus;
  title: string;
  body: string;
  points: number;
};

export type WebsiteGradeStep = {
  title: string;
  body: string;
  ferocityArea: string;
  priority: "low" | "normal" | "high";
  impact: string;
  difficulty: "Low" | "Medium" | "High";
  estimatedRoi: string;
  timeToImplement: string;
};

export type BusinessHealthCategory = {
  key: string;
  label: string;
  score: number;
  status: HealthStatus;
};

export type BusinessHealthOpportunity = {
  label: string;
  value: string;
  detail: string;
};

export type MissedRevenueEstimate = {
  low: number;
  high: number;
  label: string;
  explanation: string;
};

export type EcosystemRecommendation = {
  issue: string;
  product: "Ferocity" | "MarketplacePro" | "BidOps" | "4Bid" | "Homes4Rent" | "Guardian Signal";
  recommendation: string;
};

export type WebsiteGradeReport = {
  score: number;
  gradeLabel: string;
  categories: BusinessHealthCategory[];
  strengths: WebsiteGradeFinding[];
  weaknesses: WebsiteGradeFinding[];
  findings: WebsiteGradeFinding[];
  recommendedSteps: WebsiteGradeStep[];
  opportunities: BusinessHealthOpportunity[];
  missedRevenue: MissedRevenueEstimate;
  ecosystemRecommendations: EcosystemRecommendation[];
};

export type OperationsAssessmentInput = {
  businessName?: string | null;
  googleBusinessProfileUrl?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  serviceArea?: string | null;
  leadResponse?: string | null;
  followUp?: string | null;
  reviews?: string | null;
  payments?: string | null;
  operations?: string | null;
  hiring?: string | null;
  retention?: string | null;
  marketingChannels?: string[];
};

const emptyAnalysis = (websiteUrl: string): PublicWebsiteAnalysis => ({
  finalUrl: websiteUrl || "",
  contentType: "not_scanned",
  htmlCharsRead: 0,
  title: null,
  metaDescription: null,
  headings: [],
  phones: [],
  emails: [],
  serviceHints: [],
  serviceAreaHints: [],
  internalLinks: [],
  formCount: 0,
  ctaHints: [],
  trustHints: [],
  mediaHints: []
});

function finding(input: WebsiteGradeFinding) {
  return input;
}

function step(input: WebsiteGradeStep) {
  return input;
}

function gradeLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 75) return "Strong";
  if (score >= 50) return "Needs Work";
  return "Missing Opportunities";
}

function statusFromAnswer(value: string | null | undefined): HealthStatus {
  if (value === "strong" || value === "yes" || value === "connected") return "good";
  if (value === "some" || value === "manual" || value === "not_sure") return "needs_work";
  return "missing";
}

function scoreFromStatus(status: HealthStatus, good = 90, partial = 58, missing = 25) {
  if (status === "good") return good;
  if (status === "needs_work") return partial;
  return missing;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function category(key: string, label: string, score: number): BusinessHealthCategory {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    key,
    label,
    score: bounded,
    status: bounded >= 75 ? "good" : bounded >= 50 ? "needs_work" : "missing"
  };
}

function scoreClassCount(count: number, strongAt: number, partialAt = 1) {
  if (count >= strongAt) return 90;
  if (count >= partialAt) return 58;
  return 25;
}

function rangeForScore(score: number, lowGood: number, highBad: number) {
  const weakness = Math.max(0, 100 - score) / 100;
  return Math.max(0, Math.round(lowGood + (highBad - lowGood) * weakness));
}

function hasWebsite(websiteUrl: string | null | undefined) {
  return Boolean(websiteUrl?.trim());
}

function hasGoogleBusinessProfile(input: OperationsAssessmentInput) {
  return Boolean(input.googleBusinessProfileUrl?.trim()) || Boolean(input.marketingChannels?.includes("google_maps"));
}

function addWebsiteFindings(findings: WebsiteGradeFinding[], analysis: PublicWebsiteAnalysis, scannedWebsite: boolean) {
  if (!scannedWebsite) {
    findings.push(
      finding({
        area: "Website",
        status: "needs_work",
        title: "Website was not included",
        body: "A website is optional for the score, but Ferocity will need a website, hosted page, or lead form to track search traffic and conversion.",
        points: 0
      })
    );
    return;
  }

  findings.push(
    analysis.title && analysis.metaDescription
      ? finding({
          area: "Website",
          status: "good",
          title: "Search basics are present",
          body: "The page has a title and meta description. Ferocity can still improve the message and connect it to service/city pages.",
          points: 0
        })
      : finding({
          area: "Website",
          status: "missing",
          title: "Search basics need cleanup",
          body: "The page is missing a clear title or meta description, which makes it harder for searchers to understand the offer.",
          points: 0
        })
  );

  findings.push(
    analysis.phones.length || analysis.formCount > 0 || analysis.ctaHints.length
      ? finding({
          area: "Lead Capture",
          status: "good",
          title: "Visitors have a way to contact the business",
          body: "There is at least one phone, form, or clear call-to-action. Ferocity can add source tracking and fast follow-up.",
          points: 0
        })
      : finding({
          area: "Lead Capture",
          status: "missing",
          title: "Lead capture looks weak",
          body: "Visitors need an obvious quote button, form, phone path, or booking step that can be tracked.",
          points: 0
        })
  );

  findings.push(
    analysis.serviceHints.length && analysis.serviceAreaHints.length
      ? finding({
          area: "SEO",
          status: "good",
          title: "Service and local signals are visible",
          body: "The page includes service and area clues. Ferocity can turn those into reviewed service/city page targets.",
          points: 0
        })
      : finding({
          area: "SEO",
          status: "needs_work",
          title: "Local SEO needs more proof",
          body: "The site should make services and service areas clearer, then support them with real jobs, photos, and reviews.",
          points: 0
        })
  );

  findings.push(
    analysis.trustHints.length || analysis.mediaHints.length
      ? finding({
          area: "Reviews",
          status: "good",
          title: "Good customer proof is visible",
          body: "The page shows proof signals such as reviews, photos, licensing, warranty, or local ownership.",
          points: 0
        })
      : finding({
          area: "Reviews",
          status: "missing",
          title: "The page needs more real proof",
          body: "Add reviews, before/after photos, customer proof, project examples, and clear trust statements.",
          points: 0
        })
  );
}

function gbpFindings(input: OperationsAssessmentInput): WebsiteGradeFinding[] {
  const hasProfile = hasGoogleBusinessProfile(input);
  return [
    finding({
      area: "Google Business Profile",
      status: hasProfile ? "needs_work" : "missing",
      title: hasProfile ? "Google profile can be reviewed next" : "Google Business Profile was not provided",
      body: hasProfile
        ? "Ferocity can use the profile as a setup input for review flow, posting cadence, service categories, and local authority work."
        : "Google Maps visibility can be one of the highest-value channels for local businesses. Add the profile URL so Ferocity can guide reviews, photos, posts, and category cleanup when it applies.",
      points: 0
    })
  ];
}

function operationalFindings(input: OperationsAssessmentInput, sourceCount: number): WebsiteGradeFinding[] {
  const leadResponseStatus = statusFromAnswer(input.leadResponse);
  const followUpStatus = statusFromAnswer(input.followUp);
  const reviewStatus = statusFromAnswer(input.reviews);
  const paymentStatus = statusFromAnswer(input.payments);
  const operationsStatus = statusFromAnswer(input.operations);
  const hiringStatus = statusFromAnswer(input.hiring);
  const retentionStatus = statusFromAnswer(input.retention);

  return [
    finding({
      area: "Automation",
      status: leadResponseStatus,
      title: leadResponseStatus === "good" ? "Fast lead response is in place" : "No missed-call or fast-response system",
      body:
        leadResponseStatus === "good"
          ? "The business already has a lead response process. Ferocity can add source tracking, drafts, alerts, and audit logs."
          : "Most businesses lose money when new leads wait too long. Ferocity should set lead alerts, first-reply drafts, and stale lead recovery.",
      points: 0
    }),
    finding({
      area: "Automation",
      status: followUpStatus,
      title: followUpStatus === "good" ? "Follow-up is already managed" : "No lead nurture sequence",
      body:
        followUpStatus === "good"
          ? "There is already a follow-up process. Ferocity can add visibility, reminders, and approval controls."
          : "Ferocity should create reminders for stale leads, callbacks, viewed estimates, invoices, and review timing.",
      points: 0
    }),
    finding({
      area: "Reviews",
      status: reviewStatus,
      title: reviewStatus === "good" ? "Strong review workflow" : "No review automation",
      body:
        reviewStatus === "good"
          ? "Review collection exists. Ferocity can connect reviews to proof capture, content, and local SEO."
          : "Every completed job should trigger a safe review/proof path with photos, testimonials, permissions, and public content drafts.",
      points: 0
    }),
    finding({
      area: "Operations",
      status: paymentStatus,
      title: paymentStatus === "good" ? "Payment collection has a process" : "Invoice and payment follow-up need visibility",
      body:
        paymentStatus === "good"
          ? "Payment collection exists. Ferocity can connect it to ledgers, invoice reminders, and revenue reporting."
          : "Ferocity should track invoices, payments, ledgers, overdue reminders, and revenue attribution without surprise billing actions.",
      points: 0
    }),
    finding({
      area: "Operations",
      status: operationsStatus,
      title: operationsStatus === "good" ? "Operations are organized" : "No AI assistant or operating loop",
      body:
        operationsStatus === "good"
          ? "Jobs and tasks are already organized. Ferocity can add command-center visibility and customer history."
          : "Ferocity should connect leads, estimates, jobs, appointments, tasks, invoices, reviews, and customer history in one workspace.",
      points: 0
    }),
    finding({
      area: "Hiring",
      status: hiringStatus,
      title: hiringStatus === "good" ? "Hiring and labor pipeline looks handled" : "Employee recruiting or subcontractor bench may be thin",
      body:
        hiringStatus === "good"
          ? "The business has a way to find help. Ferocity can route hiring and subcontractor needs into the broader ecosystem."
          : "If growth is limited by crews, subs, or staffing, MarketplacePro can become a natural next step.",
      points: 0
    }),
    finding({
      area: "Customer Retention",
      status: retentionStatus,
      title: retentionStatus === "good" ? "Customer retention has a process" : "Customer retention is mostly manual",
      body:
        retentionStatus === "good"
          ? "The business has a retention path. Ferocity can keep it tied to reviews, service history, and reminders."
          : "For now this score notes the gap without pushing a reactivation campaign as the main value.",
      points: 0
    }),
    finding({
      area: "Marketing",
      status: sourceCount >= 3 ? "good" : sourceCount > 0 ? "needs_work" : "missing",
      title: sourceCount >= 3 ? "Several lead sources are in play" : "Lead sources need cleaner tracking",
      body:
        sourceCount >= 3
          ? "Ferocity should connect each channel to leads, estimates, jobs, invoices, reviews, and revenue so the business sees what works."
          : "Ferocity should tag website, SEO, Google Maps, reviews, Facebook, ads, referrals, MarketplacePro, forms, calls, jobs, invoices, and revenue from day one.",
      points: 0
    })
  ];
}

function buildOpportunities(score: number, categories: BusinessHealthCategory[]): BusinessHealthOpportunity[] {
  const leadCapture = categories.find((item) => item.key === "lead_capture")?.score ?? score;
  const reviews = categories.find((item) => item.key === "reputation")?.score ?? score;
  const automation = categories.find((item) => item.key === "automation_readiness")?.score ?? score;

  const revenueLow = rangeForScore(score, 25000, 75000);
  const revenueHigh = rangeForScore(score, 75000, 150000);
  const lostLeadsLow = rangeForScore(leadCapture, 10, 20);
  const lostLeadsHigh = rangeForScore(leadCapture, 20, 40);
  const missedFollowUpsLow = rangeForScore(automation, 15, 30);
  const missedFollowUpsHigh = rangeForScore(automation, 30, 60);
  const reviewLow = rangeForScore(reviews, 50, 85);
  const reviewHigh = rangeForScore(reviews, 85, 150);

  return [
    {
      label: "Potential Revenue Increase",
      value: `$${revenueLow.toLocaleString()}-$${revenueHigh.toLocaleString()} annually`,
      detail: "Estimate only, based on improving lead capture, follow-up, reviews, local SEO, and tracking."
    },
    {
      label: "Estimated Lost Leads",
      value: `${lostLeadsLow}-${lostLeadsHigh} per month`,
      detail: "Range depends on website traffic, call volume, service area, and current conversion structure."
    },
    {
      label: "Estimated Missed Follow-Ups",
      value: `${missedFollowUpsLow}-${missedFollowUpsHigh} per month`,
      detail: "Includes stale leads, viewed estimates, callbacks, invoices, and review timing."
    },
    {
      label: "Estimated Review Growth Opportunity",
      value: `+${reviewLow} to +${reviewHigh} reviews annually`,
      detail: "Estimate assumes completed jobs consistently trigger review and proof requests."
    }
  ];
}

function buildMissedRevenueEstimate(score: number, categories: BusinessHealthCategory[]): MissedRevenueEstimate {
  const leadCapture = categories.find((item) => item.key === "lead_capture")?.score ?? score;
  const automation = categories.find((item) => item.key === "automation_readiness")?.score ?? score;
  const seo = categories.find((item) => item.key === "seo")?.score ?? score;
  const reputation = categories.find((item) => item.key === "reputation")?.score ?? score;
  const weakness = Math.max(0.12, (400 - leadCapture - automation - seo - reputation) / 400);
  const low = Math.round((15000 + weakness * 45000) / 5000) * 5000;
  const high = Math.round((50000 + weakness * 125000) / 5000) * 5000;
  return {
    low,
    high,
    label: `$${low.toLocaleString()} - $${high.toLocaleString()} annually`,
    explanation:
      "This is a directional estimate based on gaps in lead capture, follow-up, local SEO, reviews, and conversion tracking. It is not a promise of revenue; it shows where the business may be missing booked income."
  };
}

function actionStep(input: WebsiteGradeStep) {
  return input;
}

function topActions(scores: {
  leadCaptureScore: number;
  seoScore: number;
  reputationScore: number;
  automationScore: number;
  websiteScore: number;
}): WebsiteGradeStep[] {
  const actions: WebsiteGradeStep[] = [
    actionStep({
      title: "Add automated lead follow-up",
      body: "Create first-reply drafts, missed callback alerts, stale lead recovery, estimate follow-up, and invoice reminder queues.",
      ferocityArea: "AI setup + CRM automation",
      priority: scores.automationScore < 75 ? "high" : "normal",
      impact: "Stops warm leads from going cold and gives the owner visibility into what needs attention today.",
      difficulty: "Medium",
      estimatedRoi: "High",
      timeToImplement: "1-3 days for first workflows"
    }),
    actionStep({
      title: "Improve Google review generation",
      body: "Ask for reviews after completed work, intercept unhappy customers privately, and turn positive proof into marketing drafts.",
      ferocityArea: "Review engine + proof capture",
      priority: scores.reputationScore < 75 ? "high" : "normal",
      impact: "Improves trust, local conversion, and Google Maps strength over time.",
      difficulty: "Low",
      estimatedRoi: "High",
      timeToImplement: "Same day for draft workflow"
    }),
    actionStep({
      title: "Create useful city and service page drafts",
      body: "Prepare draft local pages tied to real services, towns, jobs, photos, reviews, and lead forms.",
      ferocityArea: "SEO + hosted growth pages",
      priority: scores.seoScore < 75 ? "high" : "normal",
      impact: "Builds local search surface area without publishing thin pages automatically.",
      difficulty: "Medium",
      estimatedRoi: "Medium to high",
      timeToImplement: "1-2 weeks for first reviewed batch"
    }),
    actionStep({
      title: "Improve website calls-to-action",
      body: "Make quote buttons, phone number, form, scheduling path, and source tracking obvious on the pages people land on.",
      ferocityArea: "Website connector + forms",
      priority: scores.leadCaptureScore < 75 ? "high" : "normal",
      impact: "Turns more visitors into trackable leads and makes marketing attribution possible.",
      difficulty: "Low",
      estimatedRoi: "High",
      timeToImplement: "Same day to 2 days"
    }),
    actionStep({
      title: "Add AI missed-call handling",
      body: "Prepare missed-call text-back and owner alerts, with live sending gated until consent and provider settings are ready.",
      ferocityArea: "Messaging + provider controls",
      priority: scores.automationScore < 60 ? "high" : "normal",
      impact: "Captures calls that would otherwise disappear and routes them into follow-up.",
      difficulty: "Medium",
      estimatedRoi: "Medium to high",
      timeToImplement: "2-5 days after phone provider setup"
    })
  ];

  return actions
    .sort((a, b) => {
      const priorityRank = { high: 0, normal: 1, low: 2 };
      return priorityRank[a.priority] - priorityRank[b.priority];
    })
    .slice(0, 5);
}

function ecosystem(input: OperationsAssessmentInput, categories: BusinessHealthCategory[]): EcosystemRecommendation[] {
  const industry = input.industry?.toLowerCase() ?? input.businessName?.toLowerCase() ?? "";
  const hiring = statusFromAnswer(input.hiring);
  const operations = statusFromAnswer(input.operations);
  const marketing = categories.find((item) => item.key === "seo")?.score ?? 0;

  const rows: EcosystemRecommendation[] = [
    {
      issue: "Lead automation, reviews, follow-up, marketing, and revenue tracking",
      product: "Ferocity",
      recommendation: "Use Ferocity to run the operating loop and keep the setup simple."
    }
  ];

  if (hiring !== "good") {
    rows.push({
      issue: "Hiring or subcontractor shortages",
      product: "MarketplacePro",
      recommendation: "Use MarketplacePro when the business needs more vendors, workers, crews, or provider discovery."
    });
  }

  if (industry.includes("property") || industry.includes("landlord") || industry.includes("rental")) {
    rows.push({
      issue: "Property management inefficiencies",
      product: "Homes4Rent",
      recommendation: "Use Homes4Rent when rental listings, tenant flow, and property operations become the main need."
    });
  }

  if (industry.includes("contractor") || industry.includes("construction") || industry.includes("roof")) {
    rows.push({
      issue: "Equipment acquisition opportunities",
      product: "4Bid",
      recommendation: "Use 4Bid when vehicles, equipment, tools, or auction sourcing can support growth."
    });
  }

  if (operations !== "good" && marketing < 60) {
    rows.push({
      issue: "Government contract opportunities",
      product: "BidOps",
      recommendation: "Use BidOps if public-sector opportunities become a real strategy. Ferocity does not force that path."
    });
  }

  return rows.slice(0, 5);
}

export async function gradeWebsiteUrl(
  websiteUrl: string,
  input: OperationsAssessmentInput = {}
): Promise<{ ok: true; analysis: PublicWebsiteAnalysis; report: WebsiteGradeReport } | { ok: false; message: string }> {
  const scannedWebsite = hasWebsite(websiteUrl);
  let analysis = emptyAnalysis(websiteUrl);

  if (scannedWebsite) {
    const analysisResult = await analyzePublicWebsiteUrl(websiteUrl);
    if (!analysisResult.ok) return analysisResult;
    analysis = analysisResult.analysis;
  }

  const sourceCount = input.marketingChannels?.filter(Boolean).length ?? 0;
  const leadResponseStatus = statusFromAnswer(input.leadResponse);
  const followUpStatus = statusFromAnswer(input.followUp);
  const reviewStatus = statusFromAnswer(input.reviews);
  const paymentStatus = statusFromAnswer(input.payments);
  const operationsStatus = statusFromAnswer(input.operations);
  const hiringStatus = statusFromAnswer(input.hiring);
  const retentionStatus = statusFromAnswer(input.retention);

  const websiteScore = scannedWebsite
    ? average([
        analysis.title && analysis.metaDescription ? 90 : analysis.title || analysis.metaDescription ? 58 : 25,
        analysis.headings.length >= 3 ? 85 : analysis.headings.length ? 55 : 25,
        analysis.internalLinks.length >= 6 ? 85 : analysis.internalLinks.length ? 55 : 25
      ])
    : 40;
  const leadCaptureScore = scannedWebsite ? scoreClassCount(analysis.phones.length + analysis.formCount + analysis.ctaHints.length, 2) : 40;
  const serviceAreaCoverage = input.serviceArea?.trim() ? 82 : scannedWebsite ? scoreClassCount(analysis.serviceAreaHints.length, 1) : 40;
  const seoScore = average([
    scannedWebsite ? scoreClassCount(analysis.serviceHints.length, 2) : 40,
    serviceAreaCoverage,
    scannedWebsite ? (analysis.metaDescription ? 82 : 45) : 40,
    scannedWebsite ? scoreClassCount(analysis.internalLinks.length, 6) : 40
  ]);
  const gbpScore = average([hasGoogleBusinessProfile(input) ? 72 : 35, hasGoogleBusinessProfile(input) && input.marketingChannels?.includes("google_maps") ? 82 : 45]);
  const reputationScore = average([scoreFromStatus(reviewStatus), scannedWebsite ? scoreClassCount(analysis.trustHints.length + analysis.mediaHints.length, 2) : 45]);
  const automationScore = average([scoreFromStatus(leadResponseStatus), scoreFromStatus(followUpStatus)]);
  const operationsScore = average([scoreFromStatus(paymentStatus), scoreFromStatus(operationsStatus)]);
  const marketingScore = average([scoreClassCount(sourceCount, 3), seoScore, reputationScore]);
  const retentionScore = scoreFromStatus(retentionStatus);
  const hiringScore = scoreFromStatus(hiringStatus);
  const growthPotentialScore = average([100 - marketingScore, 100 - automationScore, 100 - leadCaptureScore, 70]);

  const categories = [
    category("website", "Website", websiteScore),
    category("seo", "SEO", seoScore),
    category("google_business_profile", "Google Business Profile", gbpScore),
    category("lead_capture", "Lead Capture", leadCaptureScore),
    category("reputation", "Reputation", reputationScore),
    category("automation_readiness", "Automation Readiness", automationScore),
    category("operations_context", "Operations Context", average([operationsScore, retentionScore, hiringScore, marketingScore, growthPotentialScore]))
  ];

  const score = average(categories.map((item) => item.score));
  const findings: WebsiteGradeFinding[] = [];
  addWebsiteFindings(findings, analysis, scannedWebsite);
  findings.push(...gbpFindings(input));
  findings.push(...operationalFindings(input, sourceCount));

  const strengths = findings.filter((item) => item.status === "good").slice(0, 5);
  const weaknesses = findings.filter((item) => item.status !== "good").slice(0, 8);
  const recommendedSteps = topActions({ leadCaptureScore, seoScore, reputationScore, automationScore, websiteScore });
  const missedRevenue = buildMissedRevenueEstimate(score, categories);

  return {
    ok: true,
    analysis,
    report: {
      score,
      gradeLabel: gradeLabel(score),
      categories,
      strengths,
      weaknesses,
      findings,
      recommendedSteps,
      opportunities: buildOpportunities(score, categories),
      missedRevenue,
      ecosystemRecommendations: ecosystem(input, categories)
    }
  };
}
