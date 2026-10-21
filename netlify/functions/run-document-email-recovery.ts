import type { Config } from "@netlify/functions";
import { listDueResendExpenseEmailJobIds } from "../../src/lib/document-intelligence/email-intake-jobs";

export default async function runDocumentEmailRecovery() {
  const siteUrl = Netlify.env.get("URL");
  const token = Netlify.env.get("AI_WORKFORCE_CRON_TOKEN");
  if (!siteUrl || !token) return new Response("Document email recovery is not configured.", { status: 503 });
  const jobIds = await listDueResendExpenseEmailJobIds(50);
  const outcomes = await Promise.allSettled(jobIds.map(async (jobId) => {
    const response = await fetch(new URL("/.netlify/functions/process-document-email-background", siteUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    if (!response.ok) throw new Error(`Dispatch failed (${response.status}).`);
  }));
  const failed = outcomes.filter((outcome) => outcome.status === "rejected").length;
  console.log("Document email recovery dispatched", { due: jobIds.length, failed });
  return new Response(JSON.stringify({ due: jobIds.length, failed }), {
    status: failed ? 207 : 202,
    headers: { "content-type": "application/json" },
  });
}

export const config: Config = { schedule: "*/5 * * * *" };
