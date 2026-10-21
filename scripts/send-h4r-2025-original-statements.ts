import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const recipient = "burtonchristopher125@gmail.com";
const expectedNames = [
  "January 2025.pdf", "February 2025.pdf", "March 2025.pdf", "April 2025.pdf",
  "May 2025.pdf", "June 2025.pdf", "July 2025.pdf", "August 2025.pdf",
  "September 2025.pdf", "October 2025.pdf", "November 2025.pdf", "December 2025.pdf",
];

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const sourceDirectory = process.argv[2] ? path.resolve(process.argv[2]) : null;
  if (!sourceDirectory) throw new Error("Provide the verified statement directory.");
  if ((process.env.EMAIL_PROVIDER ?? "").toLowerCase() !== "resend") throw new Error("EMAIL_PROVIDER must be resend.");

  const attachments = [];
  const digest = createHash("sha256");
  for (const fileName of expectedNames) {
    const bytes = await readFile(path.join(sourceDirectory, fileName));
    if (bytes.byteLength < 1) throw new Error(`${fileName} is empty.`);
    digest.update(fileName).update(bytes);
    attachments.push({ filename: fileName, content: bytes.toString("base64") });
  }
  const setDigest = digest.digest("hex");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("EMAIL_API_KEY")}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `h4r-2025-original-statements-${setDigest}`.slice(0, 256),
    },
    body: JSON.stringify({
      from: required("EMAIL_FROM_ADDRESS"),
      to: [recipient],
      reply_to: process.env.EMAIL_REPLY_TO_ADDRESS?.trim() || required("EMAIL_FROM_ADDRESS"),
      subject: "H4R 2025 Cash App statements — January through December",
      text: "Attached are the twelve original 2025 Cash App statement PDFs preserved in Ferocity for H4R. The set includes January through December, including the separately uploaded May 2025 statement.\n\nThese are the original source documents, not Ferocity-generated summaries.",
      attachments,
      tags: [
        { name: "source", value: "ferocity" },
        { name: "action", value: "owner_document_delivery" },
      ],
    }),
  });
  const body = await response.json().catch(() => null) as { id?: string; message?: string; error?: string } | null;
  if (!response.ok || !body?.id) throw new Error(`Email delivery request failed with HTTP ${response.status}: ${body?.message ?? body?.error ?? "unknown error"}`);
  console.log(JSON.stringify({ ok: true, provider: "resend", messageId: body.id, recipient, attachmentCount: attachments.length, includesMay: true }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
