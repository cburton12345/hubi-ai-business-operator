import type { Config } from "@netlify/functions";
import { processResendExpenseEmailJob } from "../../src/lib/document-intelligence/email-intake-jobs";

export default async function processDocumentEmailBackground(request: Request) {
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  const emailApiKey = Netlify.env.get("EMAIL_API_KEY");
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token || supplied !== token) return new Response("Unauthorized", { status: 401 });
  if (!emailApiKey) return new Response("Email provider is not configured.", { status: 503 });
  const payload = await request.json().catch(() => null) as { jobId?: unknown } | null;
  const jobId = typeof payload?.jobId === "string" ? payload.jobId.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return new Response("Invalid email ingestion job.", { status: 400 });
  try {
    const result = await processResendExpenseEmailJob(jobId, emailApiKey);
    console.log("Document email job completed", { jobId, skipped: result.skipped });
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Document email job failed", {
      jobId,
      message: error instanceof Error ? error.message : "unknown",
    });
    return new Response(null, { status: 500 });
  }
}

export const config: Config = { background: true };
