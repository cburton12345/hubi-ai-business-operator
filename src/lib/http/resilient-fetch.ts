export type ResilientFetchOptions = {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  retryUnsafeMethods?: boolean;
};

const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);

function canRetry(init: RequestInit | undefined, options: ResilientFetchOptions) {
  const method = (init?.method ?? "GET").toUpperCase();
  return options.retryUnsafeMethods === true || method === "GET" || method === "HEAD" || method === "OPTIONS";
}

function retryAfterMs(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.min(Math.max(0, at - Date.now()), 10_000) : null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resilientFetch(
  input: string | URL | Request,
  init?: RequestInit,
  options: ResilientFetchOptions = {}
) {
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 12_000, 60_000));
  const retries = Math.max(0, Math.min(options.retries ?? 0, 3));
  const retryAllowed = canRetry(init, options);

  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error(`Provider request timed out after ${timeoutMs}ms.`)), timeoutMs);
    const abortFromCaller = () => controller.abort(init?.signal?.reason);
    init?.signal?.addEventListener("abort", abortFromCaller, { once: true });

    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (!retryAllowed || attempt >= retries || !retryableStatuses.has(response.status)) return response;
      await response.body?.cancel().catch(() => undefined);
      const waitMs = retryAfterMs(response) ?? Math.min((options.retryDelayMs ?? 250) * 2 ** attempt, 2_000);
      await delay(waitMs + Math.floor(Math.random() * 100));
    } catch (error) {
      if (!retryAllowed || attempt >= retries || init?.signal?.aborted) throw error;
      await delay(Math.min((options.retryDelayMs ?? 250) * 2 ** attempt, 2_000) + Math.floor(Math.random() * 100));
    } finally {
      clearTimeout(timeout);
      init?.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}
