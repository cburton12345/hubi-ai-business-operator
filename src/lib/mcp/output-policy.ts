const MAX_EXTERNAL_ARRAY_ITEMS = 25;
const MAX_EXTERNAL_STRING_LENGTH = 6_000;
const MAX_EXTERNAL_DEPTH = 8;

const forbiddenKeys = new Set([
  "password",
  "passwordhash",
  "secret",
  "clientsecret",
  "signingsecret",
  "token",
  "tokenhash",
  "tokenprefix",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authorization",
  "cookie",
  "sessioncookie",
  "credential",
  "credentials",
  "apikey",
  "privatekey",
  "servicekey",
  "servicerole",
  "databaseurl",
  "connectionstring",
  "systemprompt",
  "developerprompt",
  "prompttemplate",
  "chainofthought",
  "reasoningtrace",
  "sourcecode",
  "rawsql",
  "sqlquery",
  "querytext",
  "proprietarylogic",
  "workflowdefinition",
]);

const sensitiveValuePatterns = [
  /\bfer_mcp_[A-Za-z0-9_-]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/gi,
  /\b(?:sk|rk|pk)-(?:live|test|proj)?-?[A-Za-z0-9_-]{16,}\b/g,
  /\bpostgres(?:ql)?:\/\/[^\s]+/gi,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
];

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

type SanitizeContext = { redacted: boolean; truncatedPaths: string[] };

export function sanitizeExternalText(value: string) {
  let sanitized = value;
  for (const pattern of sensitiveValuePatterns) sanitized = sanitized.replace(pattern, "[REDACTED]");
  return sanitized.length > MAX_EXTERNAL_STRING_LENGTH
    ? `${sanitized.slice(0, MAX_EXTERNAL_STRING_LENGTH)}…[TRUNCATED]`
    : sanitized;
}

function recordTruncation(context: SanitizeContext, path: string) {
  if (context.truncatedPaths.length < 25 && !context.truncatedPaths.includes(path)) context.truncatedPaths.push(path);
}

function sanitizeValue(value: unknown, depth: number, path: string, context: SanitizeContext): unknown {
  if (depth > MAX_EXTERNAL_DEPTH) {
    recordTruncation(context, path);
    return "[OMITTED: DEPTH LIMIT]";
  }
  if (typeof value === "string") {
    const sanitized = sanitizeExternalText(value);
    if (sanitized.includes("[REDACTED]")) context.redacted = true;
    if (sanitized.endsWith("[TRUNCATED]")) recordTruncation(context, path);
    return sanitized;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    if (value.length > MAX_EXTERNAL_ARRAY_ITEMS) recordTruncation(context, path);
    return value.slice(0, MAX_EXTERNAL_ARRAY_ITEMS).map((item, index) => sanitizeValue(item, depth + 1, `${path}[${index}]`, context));
  }
  if (!value || typeof value !== "object") return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKeys.has(normalizedKey(key))) {
      context.redacted = true;
      continue;
    }
    const nestedPath = path ? `${path}.${key}` : key;
    const sanitized = sanitizeValue(nested, depth + 1, nestedPath, context);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

export function sanitizeExternalToolOutput(value: Record<string, unknown>) {
  const context: SanitizeContext = { redacted: false, truncatedPaths: [] };
  const output = sanitizeValue(value, 0, "data", context) as Record<string, unknown>;
  if (context.redacted || context.truncatedPaths.length) {
    output._ferocityOutputPolicy = {
      redacted: context.redacted,
      truncated: context.truncatedPaths.length > 0,
      truncatedPaths: context.truncatedPaths,
    };
  }
  return output;
}

export const externalOutputPolicyLimits = {
  maxArrayItems: MAX_EXTERNAL_ARRAY_ITEMS,
  maxStringLength: MAX_EXTERNAL_STRING_LENGTH,
  maxDepth: MAX_EXTERNAL_DEPTH,
} as const;
