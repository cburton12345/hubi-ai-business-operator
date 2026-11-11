import { queryPostgres } from "@/lib/db/postgres";

export type OwnerTwinSuggestion = {
  command: string;
  label: string;
  confidence: number;
  reason: string;
  executionMode: "routine_candidate" | "draft_only";
};

type OwnerCommandEvidence = {
  body: string;
  succeeded?: boolean;
  createdAt?: string;
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
  fallback: { command: string; title: string },
): OwnerTwinSuggestion[] {
  const commands = evidence
    .map((item) => ({ ...item, body: cleanCommand(item.body) }))
    .filter((item) => item.body);
  const latest = commands.at(-1)?.body ?? "";
  const latestFamily = ownerCommandFamily(latest);
  const scores = new Map<string, { command: string; score: number; occurrences: number; successes: number; reason: string }>();

  for (let index = 0; index < commands.length - 1; index += 1) {
    const current = commands[index];
    const next = commands[index + 1];
    if (ownerCommandFamily(current.body) !== latestFamily) continue;
    const key = normalizedCommand(next.body);
    if (!key || key === normalizedCommand(latest)) continue;
    const existing = scores.get(key) ?? { command: next.body, score: 0, occurrences: 0, successes: 0, reason: "" };
    existing.occurrences += 1;
    existing.successes += next.succeeded ? 1 : 0;
    existing.score += 2 + (next.succeeded ? 1.5 : 0) + index / Math.max(1, commands.length * 10);
    existing.command = next.body;
    existing.reason = `Usually follows your ${latestFamily === "general" ? "recent" : latestFamily} requests`;
    scores.set(key, existing);
  }

  for (const item of commands.slice(-60)) {
    const key = normalizedCommand(item.body);
    if (!key || key === normalizedCommand(latest)) continue;
    const existing = scores.get(key) ?? { command: item.body, score: 0, occurrences: 0, successes: 0, reason: "" };
    existing.occurrences += 1;
    existing.successes += item.succeeded ? 1 : 0;
    existing.score += 0.35 + (item.succeeded ? 0.4 : 0);
    if (!existing.reason) existing.reason = "Matches a recurring command in your own words";
    scores.set(key, existing);
  }

  const suggestions = [...scores.values()]
    .filter((item) => item.occurrences >= 2 || item.successes >= 1)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map<OwnerTwinSuggestion>((item) => ({
      command: item.command,
      label: labelFor(item.command),
      confidence: Math.min(0.94, 0.54 + item.occurrences * 0.08 + item.successes * 0.07),
      reason: item.reason,
      executionMode: consequentialContent.test(item.command) ? "draft_only" : "routine_candidate",
    }));

  const fallbackCommand = cleanCommand(fallback.command);
  if (fallbackCommand && !suggestions.some((item) => normalizedCommand(item.command) === normalizedCommand(fallbackCommand))) {
    suggestions.push({
      command: fallbackCommand,
      label: labelFor(fallback.title || fallbackCommand),
      confidence: 0.52,
      reason: "Best next move from current workspace evidence",
      executionMode: consequentialContent.test(fallbackCommand) ? "draft_only" : "routine_candidate",
    });
  }
  return suggestions.slice(0, 3);
}

export async function getOwnerTwinSuggestions(input: {
  tenantId: string;
  userId: string | null;
  canAccessAllOwnerThreads: boolean;
  fallback: { command: string; title: string };
}) {
  try {
    const result = await queryPostgres<{
      body: string;
      succeeded: boolean;
      created_at: string;
    }>(
      `select owner.body,
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
    );
    return buildOwnerTwinSuggestions(
      (result?.rows ?? []).map((row) => ({
        body: row.body,
        succeeded: row.succeeded,
        createdAt: row.created_at,
      })),
      input.fallback,
    );
  } catch {
    return buildOwnerTwinSuggestions([], input.fallback);
  }
}

