"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { executeAiWorkforceCommandAction } from "@/app/app/ai-workforce/actions";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import {
  continuesDocumentIntelligenceConversation,
  isShortAffirmation,
  requestedFinancialReportYear,
  requestsExistingFinancialReport,
  requestsDocumentUpload,
} from "@/lib/document-intelligence/chat-intent";
import { processExpenseDocumentBatch } from "@/lib/document-intelligence/workflow";
import { isUploadFile } from "@/lib/operations-workforce/receipt-upload";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import type { CapabilityRecommendation } from "@/lib/ai-workforce/capability-discovery";
import { getStatementCoverageForDocument, type StatementYearCoverage } from "@/lib/document-intelligence/statement-year-coverage";
import { getFinancialWorkpaperReadiness } from "@/lib/document-intelligence/financial-workpaper-readiness";
import type { FerocityArtifactLink } from "@/lib/ferocity/conversation-runtime";
import { controlOperatingGoal, type OperatingGoalControl } from "@/lib/operations/goal-engine";
import { listExpenseTaxPacketRows } from "@/lib/reports/expense-tax-packet";
import { syncCustomerOnboardingForTenant } from "@/lib/onboarding/customer-onboarding";
import { completeH4rOwnerPaymentAuthorization, handleH4rOwnerPaymentChat } from "@/lib/integrations/h4r/owner-payments";
import { persistFerocityOwnerRequest, persistFerocityResponse } from "@/lib/ferocity/chat-request-lifecycle";
import { getOwnerChatCapabilities } from "@/lib/ferocity/owner-chat-access";

export type FerocityChatActionState = {
  ok: boolean;
  message?: string;
  prepared?: string[];
  blocked?: string[];
  runId?: string;
  intent?: string;
  href?: string;
  actionLabel?: string;
  needsInput?: boolean;
  threadId?: string;
  uploaded?: { name: string; status: string }[];
  statementCoverage?: StatementYearCoverage;
  recommended?: CapabilityRecommendation[];
  artifacts?: FerocityArtifactLink[];
};

const uuid = z.string().uuid();
const processedDocumentsSchema = z.array(z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), fileName: z.string().max(255), status: z.string().max(100), documentId: z.string().uuid() }),
  z.object({ ok: z.literal(false), fileName: z.string().max(255), error: z.string().max(1000) })
])).max(25);

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

async function existingFinancialReportResult(input: {
  workspaceId: string;
  command: string;
  conversationContext: string;
}): Promise<FerocityChatActionState | null> {
  if (!requestsExistingFinancialReport(input)) return null;
  const requestedYear = requestedFinancialReportYear(input);
  const projects = await queryPostgres<{ id: string; name: string; tax_year: number }>(`
    select id,name,tax_year from public.document_intelligence_projects
    where tenant_id=$1 and status='active' and tax_year is not null
      and ($2::int is null or tax_year=$2::int)
    order by case when $2::int is not null and tax_year=$2::int then 0 else 1 end,
      tax_year desc,updated_at desc limit 1`, [input.workspaceId, requestedYear]);
  const project = projects?.rows[0] ?? null;
  const year = requestedYear ?? Number(project?.tax_year ?? new Date().getFullYear());
  const scope = { projectId: project?.id ?? null, batchId: null };
  const [expenses, deposits, readiness] = await Promise.all([
    listExpenseTaxPacketRows(input.workspaceId, year, scope),
    queryPostgres<{ deposit_count: string; deposit_cents: string }>(`
      select count(*)::text as deposit_count,coalesce(sum(t.amount_cents),0)::text as deposit_cents
      from public.document_intelligence_transactions t
      where t.tenant_id=$1 and t.direction='credit' and t.is_transfer=false
        and t.status in ('approved','needs_review')
        and coalesce(t.transaction_date,t.created_at::date)>=make_date($2::int,1,1)
        and coalesce(t.transaction_date,t.created_at::date)<make_date(($2::int+1),1,1)
        and ($3::uuid is null or exists (
          select 1 from public.document_intelligence_import_batch_items bi
          join public.document_intelligence_import_batches b on b.id=bi.batch_id and b.tenant_id=bi.tenant_id
          where bi.tenant_id=t.tenant_id and bi.document_id=t.document_id and b.project_id=$3::uuid
        ))`, [input.workspaceId, year, scope.projectId]),
    getFinancialWorkpaperReadiness(input.workspaceId, year, scope),
  ]);
  const expenseCents = expenses.reduce((sum, row) => sum + row.amount_cents + row.tax_cents, 0);
  const depositCount = Number(deposits?.rows[0]?.deposit_count ?? 0);
  const depositCents = Number(deposits?.rows[0]?.deposit_cents ?? 0);
  const scopeQuery = project ? `&project=${encodeURIComponent(project.id)}` : "";
  const expenseHref = `/app/reports/expense-tax-print?year=${year}${scopeQuery}`;
  const depositHref = `/app/reports/income-tax-print?year=${year}${scopeQuery}`;
  const csvHref = `/api/reports/expense-tax-export?year=${year}${scopeQuery}`;
  const scopeLabel = project?.name ?? `${year} workspace records`;
  const caveats = [
    ...readiness.blocks.slice(0, 4).map((block) => block.message),
  ].filter((value): value is string => Boolean(value));
  return {
    ok: true,
    intent: "read_only",
    href: expenseHref,
    actionLabel: "Open printable expense report",
    message: `I calculated the current ${scopeLabel} records. There are ${expenses.length} non-transfer expense candidates totaling ${dollars(expenseCents)}, plus ${depositCount} non-transfer deposits totaling ${dollars(depositCents)}. Expenses and deposits are kept on separate printable reports. Nothing is still running in the background. ${readiness.summary}${readiness.nextAction ? ` Next: ${readiness.nextAction}` : ""}`,
    prepared: [
      `${year} expense summary: ${expenses.length} candidates · ${dollars(expenseCents)}.`,
      `${year} deposit summary: ${depositCount} deposits · ${dollars(depositCents)}.`,
      "Prepared separate printable expense and deposit destinations plus a CSV download.",
    ],
    blocked: caveats,
    statementCoverage: readiness.coverage ?? undefined,
    artifacts: [
      { id: `expense-report-${year}`, kind: "result", title: `Print ${year} expenses`, href: expenseHref, status: readiness.canClaimReadyForPreparer ? "completed" : "needs_approval" },
      { id: `deposit-report-${year}`, kind: "result", title: `Print ${year} deposits`, href: depositHref, status: readiness.canClaimReadyForPreparer ? "completed" : "needs_approval" },
      { id: `expense-csv-${year}`, kind: "result", title: `Download ${year} expense CSV`, href: csvHref, status: readiness.canClaimReadyForPreparer ? "completed" : "needs_approval" },
    ],
  };
}

async function resolveThread(
  workspaceId: string,
  userId: string | null,
  canAccessAllOwnerThreads: boolean,
  requested: FormDataEntryValue | null,
  command: string,
) {
  const parsed =
    typeof requested === "string" ? uuid.safeParse(requested) : null;
  if (parsed?.success) {
    const existing = await queryPostgres<{ id: string }>(
      `select id from public.ferocity_chat_threads
       where tenant_id = $1 and id = $2 and audience = 'owner' and status = 'active'
         and ($3::boolean or created_by_user_id = $4)
       limit 1`,
      [workspaceId, parsed.data, canAccessAllOwnerThreads, userId],
    );
    if (existing?.rows[0]) return existing.rows[0].id;
  }
  const title =
    command.replace(/\s+/g, " ").trim().slice(0, 72) || "New conversation";
  const created = await queryPostgres<{ id: string }>(
    `insert into public.ferocity_chat_threads (tenant_id, created_by_user_id, title)
     values ($1, $2, $3) returning id`,
    [workspaceId, userId, title],
  );
  return created?.rows[0]?.id ?? null;
}

async function recentThreadContext(
  workspaceId: string,
  threadId: string | null,
  userId: string | null,
  canAccessAllOwnerThreads: boolean,
) {
  if (!threadId) return "";
  try {
    const result = await queryPostgres<{ role: string; body: string; detail_json: Record<string, unknown> | null }>(
      `select role, body, detail_json
         from public.ferocity_chat_messages
        where tenant_id = $1 and thread_id = $2
          and exists (
            select 1 from public.ferocity_chat_threads thread
            where thread.id=$2 and thread.tenant_id=$1 and thread.audience='owner'
              and ($3::boolean or thread.created_by_user_id=$4)
          )
        order by created_at desc
        limit 24`,
      [workspaceId, threadId, canAccessAllOwnerThreads, userId],
    );
    return (result?.rows ?? [])
      .reverse()
      .map((message) => {
        const refs = Array.isArray(message.detail_json?.documentRefs)
          ? message.detail_json.documentRefs
              .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
              .map((item) => `${String(item.fileName ?? "document")} [document ${String(item.documentId ?? "unknown")}; ${String(item.status ?? "status unknown")}]`)
              .slice(0, 25)
          : [];
        return `${message.role === "owner" ? "Owner" : "Ferocity"}: ${message.body}${refs.length ? `\nDocument references: ${refs.join("; ")}` : ""}`;
      })
      .join("\n\n")
      .slice(-12000);
  } catch {
    // A stale or unavailable transcript must not prevent the current command.
    return "";
  }
}

export async function executeFerocityChatAction(
  _state: FerocityChatActionState,
  formData: FormData,
): Promise<FerocityChatActionState> {
  const actor = await requirePermission("ai:queue");
  const access = getOwnerChatCapabilities(actor);
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const ownerCommand = String(formData.get("command") ?? "").trim();
  const onboardingContext = z.object({
    onboardingMode: z.enum(["true", "false"]).catch("false"),
    onboardingIndustry: z.string().trim().min(2).max(120).optional(),
  }).parse({
    onboardingMode: formData.get("onboardingMode"),
    onboardingIndustry: String(formData.get("onboardingIndustry") ?? "").trim() || undefined,
  });
  const inputMode = z
    .enum(["text", "voice_dictation", "voice_conversation"])
    .catch("text")
    .parse(formData.get("inputMode"));
  const clientRequestId = z.string().uuid().catch(randomUUID()).parse(formData.get("clientRequestId"));
  const files = formData.getAll("documents").filter(isUploadFile);
  let processedDocuments: z.infer<typeof processedDocumentsSchema> = [];
  try {
    processedDocuments = processedDocumentsSchema.parse(JSON.parse(String(formData.get("processedDocuments") ?? "[]")));
  } catch {
    return { ok: false, message: "The uploaded document results could not be verified. Your files remain selected for retry." };
  }
  const documentCount = files.length + processedDocuments.length;
  const ownerFacingCommand = ownerCommand || (documentCount ? "Review the attached document(s), preserve the originals, and tell me what needs attention." : "");
  if (!ownerFacingCommand) return { ok: false, message: "Enter a request or attach at least one document." };
  if (access.canConfigureOnboarding && onboardingContext.onboardingMode === "true" && onboardingContext.onboardingIndustry) {
    await queryPostgres(
      `update public.brands
          set industry=$2,
              primary_goal=$3,
              description=case
                when description is null or description in ('Created after verified Ferocity subscription checkout.','')
                  then $4
                else description
              end,
              updated_at=now()
        where tenant_id=$1 and status='active'
          and id=(select id from public.brands where tenant_id=$1 and status='active' order by created_at limit 1)`,
      [
        workspaceId,
        onboardingContext.onboardingIndustry,
        ownerFacingCommand.slice(0, 500),
        `${onboardingContext.onboardingIndustry} business completing guided Ferocity setup.`,
      ],
    );
  }
  const completedDocuments = processedDocuments.filter((item) => item.ok);
  const failedDocuments = processedDocuments.filter((item) => !item.ok);
  const directUploadContext = processedDocuments.length
    ? [
        "Document ingestion status (authoritative):",
        completedDocuments.length
          ? `Successfully received and imported: ${completedDocuments.map((item) => `${item.fileName} (${item.status}; document ${item.documentId})`).join(", ")}.`
          : "No document completed import.",
        failedDocuments.length
          ? `Failed imports that may need a retry: ${failedDocuments.map((item) => `${item.fileName} (${item.error})`).join(", ")}.`
          : "No document import failed.",
        "Do not ask the owner to upload a successfully imported file again. Use the imported result, explain what Ferocity handled, and point to the specific review or next action that remains."
      ].join("\n")
    : "";
  const threadId = await resolveThread(
    workspaceId,
    session?.userId ?? null,
    access.canConfigureOnboarding,
    formData.get("threadId"),
    ownerFacingCommand,
  );
  if (threadId) formData.set("threadId", threadId);
  if (threadId) {
    const persistedRequestId = await persistFerocityOwnerRequest({
      tenantId: workspaceId,
      threadId,
      userId: session?.userId ?? null,
      clientRequestId,
      body: ownerCommand || `Attached ${documentCount} document${documentCount === 1 ? "" : "s"} for review`,
      detail: {
        inputMode,
        uploaded: [
          ...files.map((file) => ({ name: file.name, type: file.type, size: file.size })),
          ...processedDocuments.map((item) => ({
            name: item.fileName,
            status: item.ok ? item.status : "failed",
            ...(item.ok ? { documentId: item.documentId } : {}),
          })),
        ],
        documentRefs: processedDocuments.filter((item) => item.ok).map((item) => ({
          fileName: item.fileName,
          documentId: item.documentId,
          status: item.status,
        })),
      },
    });
    if (!persistedRequestId) {
      return {
        ok: false,
        threadId,
        message: "Ferocity could not safely save this request, so it did not continue into business actions. Your text and selected files remain available to retry.",
        blocked: ["The request was not durably recorded."],
      };
    }
  }
  if (threadId && session && documentCount === 0) {
    const paymentResult = await handleH4rOwnerPaymentChat({ tenantId: workspaceId, userId: session.userId,
      email: session.email, threadId, command: ownerCommand,
      canManageTenant: actor.platformRole === "super_admin" || ["owner", "admin"].includes(actor.tenantRole) });
    if (paymentResult) {
      await persistFerocityResponse({
        tenantId: workspaceId,
        threadId,
        userId: session.userId,
        clientRequestId,
        body: paymentResult.message ?? "Ferocity finished reviewing the H4R request.",
        commandRunId: null,
        status: paymentResult.ok ? "completed" : "failed",
        detail: paymentResult,
      });
      revalidatePath('/app/ferocity');
      return { ...paymentResult, threadId };
    }
  }
  const clientConversationContext = String(formData.get("conversationContext") ?? "").trim();
  const storedConversationContext = isShortAffirmation(ownerCommand)
    ? await recentThreadContext(workspaceId, threadId, session?.userId ?? null, access.canConfigureOnboarding)
    : "";
  const conversationContext = [storedConversationContext, clientConversationContext]
    .filter(Boolean)
    .join("\n\n")
    .slice(-12000);
  const financialReportResult = documentCount === 0
    ? await existingFinancialReportResult({ workspaceId, command: ownerCommand, conversationContext })
    : null;
  const documentConversation = continuesDocumentIntelligenceConversation({
    command: ownerCommand,
    conversationContext,
    hasDocuments: documentCount > 0,
  });
  const command = directUploadContext ? `${ownerFacingCommand}\n\n${directUploadContext}` : ownerFacingCommand;
  formData.set("command", command);
  if (conversationContext) formData.set("conversationContext", conversationContext.slice(-6000));
  const uploaded: { name: string; status: string }[] = [];
  const uploadBlocked: string[] = [];

  for (const item of processedDocuments) {
    if (item.ok) uploaded.push({ name: item.fileName, status: item.status });
    else {
      uploaded.push({ name: item.fileName, status: "failed" });
      uploadBlocked.push(`${item.fileName}: ${item.error}`);
    }
  }
  if (files.length) {
    try {
      const batch = await processExpenseDocumentBatch({
        workspaceId,
        userId: session?.userId ?? null,
        files,
        sourceChannel: "upload",
        sourceProduct: "ferocity",
        sourceMessageRef: threadId,
        suppliedText: command,
        maxFiles: 25,
      });
      batch.completed.forEach((item) =>
        uploaded.push({
          name: item.fileName,
          status: item.result.reusedExisting ? "already imported" : item.result.status,
        }),
      );
      for (const item of batch.failed)
        uploaded.push({ name: item.fileName, status: "failed" });
      if (batch.failed.length)
        uploadBlocked.push(
          ...batch.failed.map((item) => `${item.fileName}: ${item.error}`),
        );
    } catch (error) {
      uploadBlocked.push(
        error instanceof Error
          ? error.message
          : "The document import could not be completed.",
      );
    }
  }

  const successfulUploads = uploaded.filter((item) => item.status !== "failed");
  const reviewUploads = successfulUploads.filter((item) => ["needs_review", "duplicate"].includes(item.status));
  const alreadyImportedUploads = successfulUploads.filter((item) => item.status === "already imported");
  const newlyImportedUploads = successfulUploads.filter((item) => item.status !== "already imported");
  const coverageCandidates = await Promise.all(completedDocuments.map((item) => getStatementCoverageForDocument(workspaceId, item.documentId)));
  const statementCoverage = coverageCandidates.filter((item): item is StatementYearCoverage => Boolean(item)).at(-1);
  const coverageMessage = statementCoverage ? ` ${statementCoverage.message}` : "";
  const needsDocumentFile = documentCount === 0 && requestsDocumentUpload(ownerCommand);
  const documentResult: FerocityChatActionState | null = documentConversation
    ? {
        ok: uploadBlocked.length === 0,
        intent: "document_intake",
        href: "/app/expenses",
        actionLabel: needsDocumentFile ? "Open Receipts & Expenses" : "Review receipts & statements",
        needsInput: needsDocumentFile,
        recommended: [],
        message: documentCount === 0
          ? needsDocumentFile
            ? "Attach the Cash App statement here. Ferocity will read it, separate deposits from expenses, flag duplicates, and prepare a clean breakdown for tax review and printing."
            : "Yes. Ferocity already has Receipt & Expense Intelligence. It reads receipts and statements, separates deposits from expenses, flags duplicates, and prepares clean tax-review and printable reports. Attach files here or open Receipts & Expenses."
          : successfulUploads.length === 0
            ? "I could not read the attached file. It is still selected so you can fix the problem and try again."
          : alreadyImportedUploads.length === successfulUploads.length
            ? `${successfulUploads.length === 1 ? "This file was" : `These ${successfulUploads.length} files were`} already here, so I did not add ${successfulUploads.length === 1 ? "a duplicate" : "duplicates"}.${coverageMessage} Open Receipts & Expenses to review ${successfulUploads.length === 1 ? "it" : "them"}.`
            : reviewUploads.length
              ? `${newlyImportedUploads.length} new file${newlyImportedUploads.length === 1 ? "" : "s"} added${alreadyImportedUploads.length ? `; ${alreadyImportedUploads.length} ${alreadyImportedUploads.length === 1 ? "was" : "were"} already here` : ""}. ${reviewUploads.length} file${reviewUploads.length === 1 ? " needs" : "s need"} a quick check.${coverageMessage} Open Receipts & Expenses to finish ${reviewUploads.length === 1 ? "it" : "them"}.`
              : `Done. ${newlyImportedUploads.length} new file${newlyImportedUploads.length === 1 ? "" : "s"} added${alreadyImportedUploads.length ? `; ${alreadyImportedUploads.length} ${alreadyImportedUploads.length === 1 ? "was" : "were"} already here` : ""}.${coverageMessage} Open Receipts & Expenses to see the results.`,
        statementCoverage,
        artifacts: completedDocuments.map((item) => ({
          id: item.documentId,
          kind: "result",
          title: `Review ${item.fileName}`,
          href: `/app/expenses?document=${encodeURIComponent(item.documentId)}#document-${encodeURIComponent(item.documentId)}`,
          status: ["needs_review", "duplicate"].includes(item.status) ? "needs_approval" : "completed",
        })),
      }
    : null;
  const result = documentResult ?? financialReportResult ?? await executeAiWorkforceCommandAction({ ok: false }, formData);
  const merged: FerocityChatActionState = {
    ...result,
    ok: result.ok && uploadBlocked.length === 0,
    prepared: result.prepared ?? [],
    blocked: [...uploadBlocked, ...(result.blocked ?? [])],
    href: documentCount && !result.href ? "/app/expenses" : result.href,
    threadId: threadId ?? undefined,
    uploaded,
  };

  if (threadId && command) {
    const responseId = await persistFerocityResponse({
      tenantId: workspaceId,
      threadId,
      userId: session?.userId ?? null,
      clientRequestId,
      body: merged.message ?? "Ferocity finished reviewing the request.",
      commandRunId: merged.runId ?? null,
      status: merged.needsInput
        ? "needs_input"
        : merged.blocked?.length
          ? "needs_attention"
          : merged.ok
            ? "completed"
            : "failed",
      detail: {
        inputMode,
        voiceRequiresClickForProtectedActions: inputMode !== "text",
        prepared: merged.prepared ?? [],
        blocked: merged.blocked ?? [],
        recommended: merged.recommended ?? [],
        artifacts: merged.artifacts ?? [],
        intent: merged.intent,
        href: merged.href,
        actionLabel: merged.actionLabel,
        runId: merged.runId,
        uploaded,
        documentRefs: completedDocuments.map((item) => ({
          fileName: item.fileName,
          documentId: item.documentId,
          status: item.status,
        })),
      },
    });
    if (!responseId) {
      merged.ok = false;
      merged.blocked = [...(merged.blocked ?? []), "The result could not be saved to this conversation. Reload before retrying so completed work is not duplicated."];
    }
  }

  // A conversation alone is never completion evidence. Re-evaluate the durable
  // onboarding goal only after the result and its receipts have been persisted.
  await syncCustomerOnboardingForTenant(workspaceId).catch(() => null);

  revalidatePath("/app/ferocity");
  return merged;
}

export async function createFerocityThreadAction() {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const result = await queryPostgres<{ id: string }>(
    `insert into public.ferocity_chat_threads (tenant_id, created_by_user_id, title)
     values ($1,$2,'New conversation') returning id`,
    [workspaceId, session?.userId ?? null],
  );
  redirect(
    result?.rows[0]?.id
      ? `/app/ferocity?thread=${result.rows[0].id}`
      : "/app/ferocity",
  );
}

export async function completeH4rOwnerPaymentAuthorizationAction(proofToken: string) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  if (!session?.userId || !session.email) {
    return { ok: false as const, message: "Sign in to Ferocity again before connecting H4R." };
  }
  const result = await completeH4rOwnerPaymentAuthorization({
    tenantId: workspaceId,
    userId: session.userId,
    email: session.email,
    proofToken,
  });
  revalidatePath("/app/ferocity");
  revalidatePath("/app/integrations");
  return result;
}

export async function controlOperatingGoalAction(formData: FormData) {
  await requirePermission("tenant:manage");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const parsed = z.object({
    goalId: z.string().uuid(),
    control: z.enum(["pause", "resume", "retry", "cancel"]),
  }).safeParse({
    goalId: formData.get("goalId"),
    control: formData.get("control"),
  });
  if (!parsed.success) return;
  await controlOperatingGoal({
    tenantId: workspaceId,
    goalId: parsed.data.goalId,
    control: parsed.data.control as OperatingGoalControl,
    actorUserId: session?.userId ?? null,
  });
  revalidatePath("/app/ferocity");
  revalidatePath("/app/automation-timeline");
}
