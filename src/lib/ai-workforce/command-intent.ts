export type AiCommandIntent = "read_only" | "draft_preparation" | "workspace_changing" | "external";

const mutationTerms = [
  "add",
  "apply",
  "approve",
  "build",
  "change",
  "connect",
  "create",
  "do it",
  "draft",
  "generate",
  "log",
  "make",
  "prepare",
  "publish",
  "remind",
  "run",
  "schedule",
  "send",
  "set up",
  "setup",
  "start",
  "turn on",
  "update"
];

const externalTerms = [
  "auto post",
  "automatically post",
  "charge",
  "collect payment",
  "pay out",
  "publish",
  "send email",
  "send sms",
  "send text",
  "spend",
  "transfer"
];

const readOnlyTerms = [
  "check",
  "dashboard",
  "find",
  "list",
  "look at",
  "open",
  "report",
  "show",
  "status",
  "summarize",
  "tell me",
  "view",
  "what matters",
  "what needs",
  "where"
];

export function classifyAiCommandIntent(command: string): AiCommandIntent {
  const lower = command.toLowerCase();
  const hasExternal = externalTerms.some((term) => lower.includes(term));
  if (hasExternal) return "external";

  const hasMutation = mutationTerms.some((term) => lower.includes(term));
  const hasReadOnly = readOnlyTerms.some((term) => lower.includes(term));
  if (hasReadOnly && !hasMutation) return "read_only";

  if (hasMutation) {
    if (["draft", "prepare", "generate", "make", "build"].some((term) => lower.includes(term))) {
      return "draft_preparation";
    }
    return "workspace_changing";
  }

  return "read_only";
}

export function readOnlyRouteForCommand(command: string) {
  const lower = command.toLowerCase();
  if (lower.includes("call inbox") || lower.includes("show calls") || lower.includes("missed call") || lower.includes("phone history")) return "/app/calls";
  if (lower.includes("office manager") || lower.includes("reception") || lower.includes("phone call") || lower.includes("answer calls") || lower.includes("voice ai")) return "/app/office-manager";
  if (lower.includes("authority") || lower.includes("proof") || lower.includes("case study") || lower.includes("finished work") || lower.includes("completed job")) return "/app/authority";
  if (lower.includes("money") || lower.includes("revenue") || lower.includes("paid") || lower.includes("owed")) return "/app/revenue-growth";
  if (lower.includes("job") || lower.includes("crew") || lower.includes("worker") || lower.includes("schedule")) return "/app/attention-command";
  if (lower.includes("error") || lower.includes("health") || lower.includes("broken")) return "/app/system-health";
  if (lower.includes("alert")) return "/app/alerts";
  return "/app/attention-command";
}
