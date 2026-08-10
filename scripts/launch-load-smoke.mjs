import { performance } from "node:perf_hooks";

const baseUrl = (process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const target = new URL(baseUrl);
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(target.hostname);

if (!isLocal && process.env.ALLOW_REMOTE_LOAD_TEST !== "true") {
  throw new Error("Remote load tests are disabled. Set ALLOW_REMOTE_LOAD_TEST=true only for an approved preview environment.");
}

const concurrency = Math.max(1, Math.min(Number(process.env.LOAD_TEST_CONCURRENCY ?? 12), 50));
const requestsPerPath = Math.max(1, Math.min(Number(process.env.LOAD_TEST_REQUESTS_PER_PATH ?? 40), 500));
const timeoutMs = Math.max(1_000, Math.min(Number(process.env.LOAD_TEST_TIMEOUT_MS ?? 8_000), 30_000));
const paths = (process.env.LOAD_TEST_PATHS ?? "/,/pricing,/features,/health")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const method = (process.env.LOAD_TEST_METHOD ?? "GET").toUpperCase();
const requestBody = process.env.LOAD_TEST_BODY_JSON;
const requestHeaders = process.env.LOAD_TEST_HEADERS_JSON
  ? JSON.parse(process.env.LOAD_TEST_HEADERS_JSON)
  : {};
const allowedStatuses = process.env.LOAD_TEST_ALLOWED_STATUSES
  ? new Set(process.env.LOAD_TEST_ALLOWED_STATUSES.split(",").map((value) => Number(value.trim())).filter(Number.isFinite))
  : null;

if (!["GET", "HEAD"].includes(method) && process.env.ALLOW_MUTATING_LOAD_TEST !== "true") {
  throw new Error("Mutating load tests are disabled. Use a seeded preview and set ALLOW_MUTATING_LOAD_TEST=true explicitly.");
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

async function timedRequest(path) {
  const startedAt = performance.now();
  try {
    const response = await fetch(new URL(path, target), {
      method,
      body: ["GET", "HEAD"].includes(method) ? undefined : requestBody,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "FerocityLaunchCapacityCheck/1.0",
        ...(requestBody ? { "content-type": "application/json" } : {}),
        ...requestHeaders
      }
    });
    await response.body?.cancel();
    return {
      path,
      status: response.status,
      durationMs: performance.now() - startedAt,
      ok: allowedStatuses ? allowedStatuses.has(response.status) : response.status < 500
    };
  } catch (error) {
    return { path, status: 0, durationMs: performance.now() - startedAt, ok: false, error: error instanceof Error ? error.name : "request_failed" };
  }
}

const queue = paths.flatMap((path) => Array.from({ length: requestsPerPath }, () => path));
const results = [];
let cursor = 0;

async function worker() {
  while (cursor < queue.length) {
    const index = cursor;
    cursor += 1;
    results.push(await timedRequest(queue[index]));
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsedMs = performance.now() - startedAt;
const failed = results.filter((result) => !result.ok);
const durations = results.map((result) => result.durationMs);
const summary = {
  target: isLocal ? "local" : target.origin,
  requests: results.length,
  concurrency,
  method,
  failures: failed.length,
  errorRate: Number((failed.length / Math.max(results.length, 1)).toFixed(4)),
  requestsPerSecond: Number((results.length / Math.max(elapsedMs / 1000, 0.001)).toFixed(1)),
  p50Ms: Math.round(percentile(durations, 0.5)),
  p95Ms: Math.round(percentile(durations, 0.95)),
  p99Ms: Math.round(percentile(durations, 0.99))
};

console.log(JSON.stringify(summary, null, 2));

if (summary.errorRate > 0.01 || summary.p95Ms > timeoutMs * 0.8) {
  console.error("Launch capacity gate failed.");
  process.exit(1);
}

console.log("Launch capacity gate passed.");
