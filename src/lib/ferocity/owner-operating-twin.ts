import { createHash } from "node:crypto";
import { queryPostgres } from "@/lib/db/postgres";

export type OwnerTwinChannel = "internal_command" | "email" | "text" | "phone" | "vendor" | "work_order";

export type OwnerTwinSuggestion = {
  suggestionKey: string;
  command: string;
  label: string;
  confidence: number;
  reason: string;
  executionMode: "routine_candidate" | "draft_only";
  channel: OwnerTwinChannel;
  evidenceHref: string;
};

export type OwnerDailyBrief = {
  headline: string;
  summary: string;
  items: Array<{ label: string; count: number; href: string }>;
  topPriority: { title: string; detail: string; href: string };
};

type OwnerCommandEvidence = {
  tenantId?: string;
  body: string;
  succeeded?: boolean;
  createdAt?: string;
  evidenceHref?: string;
};

type OwnerSuggestionFeedback = {
  command: string;
  feedback: "accepted" | "dismissed";
  evidenceHref?: string;
};

const prohibitedContent = /\b(password|passcode|api[- ]?key|secret|access[- ]?token|refresh[- ]?token|private[- ]?key|social security|ssn|routing number|bank account|credit card|card number|cvv|security code)\b/i;
const consequentialContent = /\b(pay|payment|refund|charge|spend|buy|purchase|sign|contract|agreement|send|text|email|call|post|publish|delete|remove|cancel|invite|hire|fire|approve|accept)\b/i;

function cleanCommand(value: unknown) {
  if (typeof value !== "string") return "";
  const command = value.replace(/\s+/g, " ").trim().slice(0, 500);
  if (command.length < 2 || prohibitedContent.test(command) || /\b\d{12,19}\b/.test(command)) return "";
  return command;
}

function normalizedCommand(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function suggestionKey(command: string, channel: OwnerTwinChannel) {
  return createHash("sha256").update(`${channel}|${normalizedCommand(command)}`, "utf8").digest("hex").slice(0, 32);
}

export function ownerSuggestionChannel(value: string): OwnerTwinChannel {
  const command = value.toLowerCase();
  if (/\b(vendor|supplier|subcontractor|contractor)\b/.test(command)) return "vendor";
  if (/\b(work order|dispatch|job assignment|schedule crew)\b/.test(command)) return "work_order";
  if (/\b(call|phone|voicemail)\b/.test(command)) return "phone";
  if (/\b(text|sms|message)\b/.test(command)) return "text";
  if (/\b(email|inbox|mail)\b/.test(command)) return "email";
  return "internal_command";
}

export function filterOwnerEvidenceForTenant(evidence: OwnerCommandEvidence[], tenantId?: string) {
  if (!tenantId) return evidence;
  return evidence.filter((item) => !item.tenantId || item.tenantId === tenantId);
}

export function buildOwnerDailyBrief(input: {
  attentionCount: number;
  opportunityCount: number;
  approvalCount: number;
  activeGoalCount: number;
  setupRemainingCount: number;
  topPriority: { title: string; detail: string; href: string };
}): OwnerDailyBrief {
  const count = (value: number) => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const items = [
    { label: "needs attention", count: count(input.attentionCount), href: "/app/attention-command" },
    { label: "live opportunities", count: count(input.opportunityCount), href: "/app/opportunities" },
    { label: "awaiting approval", count: count(input.approvalCount), href: "/app/approvals" },
    { label: "active operating goals", count: count(input.activeGoalCount), href: "/app/ferocity#operating-goals" },
    { label: "setup steps remaining", count: count(input.setupRemainingCount), href: "/app/setup" },
  ].filter((item) => item.count > 0);
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return {
    headline: total > 0 ? "Today’s owner brief" : "Today’s workspace is clear",
    summary: total > 0
      ? `${total} current item${total === 1 ? "" : "s"} across the owner queue. Counts are live evidence, not inferred completion.`
      : "No current owner-queue exceptions were found. Ferocity can still run a proactive business scan.",
    items,
    topPriority: {
      title: input.topPriority.title.slice(0, 180),
      detail: input.topPriority.detail.slice(0, 500),
      href: input.topPriority.href.startsWith("/app/") ? input.topPriority.href : "/app/attention-command",
    },
  };
}

export function ownerCommandFamily(value: string) {
  const command = value.toLowerCase();
  if (/\b(next|what.*left|keep going|continue|finish|everything|all platforms?)\b/.test(command)) return "continue";
  if (/\b(lead|customer|follow up|estimate|sales|callback)\b/.test(command)) return "sales";
  if (/\b(job|crew|worker|schedule|dispatch|itinerary)\b/.test(command)) return "operations";
  if (/\b(invoice|payment|paid|money|profit|expense|receipt|tax)\b/.test(command)) return "money";
  if (/\b(marketing|ad|campaign|post|facebook|seo|website|review)\b/.test(command)) return "growth";
  if (/\b(broken|down|error|health|audit|security|hack|bot|quota)\b/.test(command)) return "reliability";
  if (/\b(setup|connect|integration|account|deploy|release)\b/.test(command)) return "setup";
  return "general";
}

function labelFor(command: string) {
  const compact = command.replace(/[.!?]+$/g, "");
  return compact.length <= 52 ? compact : `${compact.slice(0, 49).trimEnd()}…`;
}

export function buildOwnerTwinSuggestions(
  evidence: OwnerCommandEvidence[],
  fallback: { command: string; title: string; evidenceHref?: string },
  options: { tenantId?: string; feedback?: OwnerSuggestionFeedback[] } = {},
): OwnerTwinSuggestion[] {
  const dismissed = new Set((options.feedback ?? [])
    .filter((item) => item.feedback === "dismissed")
    .map((item) => normalizedCommand(item.command)));
  const commands = filterOwnerEvidenceForTenant(evidence, options.tenantId)
    .map((item) => ({ ...item, body: cleanCommand(item.body) }))
    .filter((item) => item.body && !dismissed.has(normalizedCommand(item.body)));
  const latest = commands.at(-1)?.body ?? "";
  const latestFamily = ownerCommandFamily(latest);
  const scores = new Map<string, { command: string; score: number; occurrences: number; successes: number; reason: string; evidenceHref: string }>();

  for (let index = 0; index < commands.length - 1; index += 1) {
    const current = commands[index];
    const next = commands[index + 1];
    if (ownerCommandFamily(current.body) !== latestFamily) continue;
    const key = normalizedCommand(next.body);
    if (!key || key === normalizedCommand(latest)) continue;
    const existing = scores.get(key) ?? { command: next.body, score: 0, occurrences: 0, successes: 0, reason: "", evidenceHref: next.evidenceHref || "/app/ferocity" };
    existing.occurrences += 1;
    existing.successes += next.succeeded ? 1 : 0;
    existing.score += 2 + (next.succeeded ? 1.5 : 0) + index / Math.max(1, commands.length * 10);
    existing.command = next.body;
    existing.evidenceHref = next.evidenceHref || existing.evidenceHref;
    existing.reason = `Usually follows your ${latestFamily === "general" ? "recent" : latestFamily} requests`;
    scores.set(key, existing);
  }

  for (const item of commands.slice(-60)) {
    const key = normalizedCommand(item.body);
    if (!key || key === normalizedCommand(latest)) continue;
    const existing = scores.get(key) ?? { command: item.body, score: 0, occurrences: 0, successes: 0, reason: "", evidenceHref: item.evidenceHref || "/app/ferocity" };
    existing.occurrences += 1;
    existing.successes += item.succeeded ? 1 : 0;
    existing.score += 0.35 + (item.succeeded ? 0.4 : 0);
    if (!existing.reason) existing.reason = "Matches a recurring command in your own words";
    scores.set(key, existing);
  }

  for (const feedback of options.feedback ?? []) {
    if (feedback.feedback !== "accepted") continue;
    const command = cleanCommand(feedback.command);
    const key = normalizedCommand(command);
    if (!key || dismissed.has(key) || key === normalizedCommand(latest)) continue;
    const existing = scores.get(key) ?? { command, score: 0, occurrences: 0, successes: 0, reason: "", evidenceHref: feedback.evidenceHref || "/app/ferocity" };
    existing.score += 3;
    existing.occurrences += 1;
    existing.successes += 1;
    existing.reason = "You previously accepted this tenant-scoped suggestion";
    scores.set(key, existing);
  }

  const suggestions = [...scores.values()]
    .filter((item) => item.occurrences >= 2 || item.successes >= 1)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map<OwnerTwinSuggestion>((item) => {
      const channel = ownerSuggestionChannel(item.command);
      return {
        suggestionKey: suggestionKey(item.command, channel),
        command: item.command,
        label: labelFor(item.command),
        confidence: Math.min(0.94, 0.54 + item.occurrences * 0.08 + item.successes * 0.07),
        reason: item.reason,
        executionMode: consequentialContent.test(item.command) ? "draft_only" : "routine_candidate",
        channel,
        evidenceHref: item.evidenceHref,
      };
    });

  const fallbackCommand = cleanCommand(fallback.command);
  if (fallbackCommand && !dismissed.has(normalizedCommand(fallbackCommand)) && !suggestions.some((item) => normalizedCommand(item.command) === normalizedCommand(fallbackCommand))) {
    const channel = ownerSuggestionChannel(fallbackCommand);
    suggestions.push({
      suggestionKey: suggestionKey(fallbackCommand, channel),
      command: fallbackCommand,
      label: labelFor(fallback.title || fallbackCommand),
      confidence: 0.52,
      reason: "Best next move from current workspace evidence",
      executionMode: consequentialContent.test(fallbackCommand) ? "draft_only" : "routine_candidate",
      channel,
      evidenceHref: fallback.evidenceHref || "/app/attention-command",
    });
  }
  return suggestions.slice(0, 3);
}

export async function getOwnerTwinSuggestions(input: {
  tenantId: string;
  userId: string | null;
  canAccessAllOwnerThreads: boolean;
  fallback: { command: string; title: string; evidenceHref?: string };
}) {
  try {
    const [result, feedbackResult] = await Promise.all([queryPostgres<{
      tenant_id: string;
      body: string;
      succeeded: boolean;
      created_at: string;
      thread_id: string;
    }>(
      `select owner.tenant_id,owner.body,owner.thread_id,
         exists (
           select 1 from public.ferocity_chat_messages answer
           where answer.tenant_id=owner.tenant_id and answer.thread_id=owner.thread_id
             and answer.role='ferocity' and answer.created_at>=owner.created_at
             and answer.status='completed'
         ) as succeeded,
         owner.created_at
       from public.ferocity_chat_messages owner
       join public.ferocity_chat_threads thread
         on thread.id=owner.thread_id and thread.tenant_id=owner.tenant_id
       where owner.tenant_id=$1 and owner.role='owner' and thread.audience='owner'
         and ($2::boolean or thread.created_by_user_id=$3)
       order by owner.created_at asc
       limit 160`,
      [input.tenantId, input.canAccessAllOwnerThreads, input.userId],
    ), input.userId ? queryPostgres<{
      command: string;
      feedback: "accepted" | "dismissed";
      evidence_href: string;
    }>(
      `select command,feedback,evidence_href
       from public.owner_twin_suggestion_feedback
       where tenant_id=$1 and user_id=$2 and expires_at>now()
       order by updated_at desc limit 200`,
      [input.tenantId, input.userId],
    ) : Promise.resolve(null)]);
    return buildOwnerTwinSuggestions(
      (result?.rows ?? []).map((row) => ({
        tenantId: row.tenant_id,
        body: row.body,
        succeeded: row.succeeded,
        createdAt: row.created_at,
        evidenceHref: `/app/ferocity?thread=${encodeURIComponent(row.thread_id)}`,
      })),
      input.fallback,
      {
        tenantId: input.tenantId,
        feedback: (feedbackResult?.rows ?? []).map((row) => ({
          command: row.command,
          feedback: row.feedback,
          evidenceHref: row.evidence_href,
        })),
      },
    );
  } catch {
    return buildOwnerTwinSuggestions([], input.fallback);
  }
}

