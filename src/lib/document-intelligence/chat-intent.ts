const documentIntelligenceSignals = [
  "cash app",
  "cashapp",
  "receipt",
  "expense",
  "bank statement",
  "credit card statement",
  "transaction statement",
  "ocr",
  "tax document",
  "tax paperwork",
  "financial document",
  "deduction",
  "deposit",
  "ofx",
  "qfx",
  "qbo",
  "xlsx",
  "spreadsheet import",
] as const;

const shortAffirmations = new Set([
  "yes",
  "yes please",
  "yeah",
  "yep",
  "correct",
  "ok",
  "okay",
  "sure",
  "continue",
  "proceed",
  "go ahead",
  "do it",
  "please do",
]);

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function hasDocumentIntelligenceIntent(value: string) {
  const text = normalized(value);
  return documentIntelligenceSignals.some((signal) => text.includes(signal));
}

export function isShortAffirmation(value: string) {
  return shortAffirmations.has(normalized(value));
}

export function requestsDocumentUpload(value: string) {
  const text = normalized(value);
  if (isShortAffirmation(text)) return true;
  return [
    "upload",
    "import",
    "process",
    "breakdown",
    "break down",
    "analyze",
    "extract",
    "scan these",
    "scan this",
  ].some((signal) => text.includes(signal));
}

function asksAboutDocumentIntelligenceCapability(value: string) {
  const text = normalized(value);
  return [
    "can ferocity",
    "can you",
    "do we have",
    "does ferocity",
    "is there a way",
    "how do i upload",
    "how can i upload",
  ].some((signal) => text.includes(signal));
}

export function continuesDocumentIntelligenceConversation(input: {
  command: string;
  conversationContext?: string | null;
  hasDocuments?: boolean;
}) {
  if (input.hasDocuments) return true;
  if (isShortAffirmation(input.command)) {
    return hasDocumentIntelligenceIntent(input.conversationContext ?? "");
  }
  if (!hasDocumentIntelligenceIntent(input.command)) return false;
  return requestsDocumentUpload(input.command)
    || asksAboutDocumentIntelligenceCapability(input.command);
}

const financialReportSignals = [
  "add everything up",
  "add the expenses up",
  "total the expenses",
  "expense total",
  "printable expense",
  "printable report",
  "expense summary",
  "deposit summary",
  "tax report",
  "tax packet",
  "download csv",
  "export csv",
  "recalculate them",
  "recalculate the expenses",
  "overwrite the existing breakdown",
] as const;

const financialProgressFollowups = [
  "assist quick",
  "help quick",
  "whats taking so long",
  "what is taking so long",
] as const;

export function requestsExistingFinancialReport(input: {
  command: string;
  conversationContext?: string | null;
}) {
  const command = normalized(input.command);
  const context = normalized(input.conversationContext ?? "");
  if (requestsDocumentUpload(command)) return false;
  const directReportRequest = financialReportSignals.some((signal) => command.includes(signal));
  if (directReportRequest) return true;
  const asksToPrintExisting = command.includes("print")
    && ["expense", "deposit", "statement", "tax", "summary", "report"].some((signal) => `${command} ${context}`.includes(signal));
  if (asksToPrintExisting) return true;
  return financialProgressFollowups.includes(command as (typeof financialProgressFollowups)[number])
    && financialReportSignals.some((signal) => context.includes(signal));
}

export function requestedFinancialReportYear(input: {
  command: string;
  conversationContext?: string | null;
}) {
  const years = `${input.conversationContext ?? ""}\n${input.command}`.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  const year = Number(years.at(-1));
  return Number.isInteger(year) && year >= 2000 && year <= new Date().getFullYear() + 1 ? year : null;
}
