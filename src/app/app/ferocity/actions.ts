"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { executeAiWorkforceCommandAction } from "@/app/app/ai-workforce/actions";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { queryPostgres } from "@/lib/db/postgres";
import { processExpenseDocumentBatch } from "@/lib/document-intelligence/workflow";
import { isUploadFile } from "@/lib/operations-workforce/receipt-upload";
import { getCurrentWorkspaceId } from "@/lib/workspace/current-workspace";
import type { CapabilityRecommendation } from "@/lib/ai-workforce/capability-discovery";

export type FerocityChatActionState = {
  ok: boolean;
  message?: string;
  prepared?: string[];
  blocked?: string[];
  runId?: string;
  intent?: string;
  href?: string;
  needsInput?: boolean;
  threadId?: string;
  uploaded?: { name: string; status: string }[];
  recommended?: CapabilityRecommendation[];
};

const uuid = z.string().uuid();

async function resolveThread(
  workspaceId: string,
  userId: string | null,
  requested: FormDataEntryValue | null,
  command: string,
) {
  const parsed =
    typeof requested === "string" ? uuid.safeParse(requested) : null;
  if (parsed?.success) {
    const existing = await queryPostgres<{ id: string }>(
      `select id from public.ferocity_chat_threads where tenant_id = $1 and id = $2 and status = 'active' limit 1`,
      [workspaceId, parsed.data],
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

export async function executeFerocityChatAction(
  _state: FerocityChatActionState,
  formData: FormData,
): Promise<FerocityChatActionState> {
  await requirePermission("ai:queue");
  const workspaceId = await getCurrentWorkspaceId();
  const session = await getCurrentAppSession();
  const command = String(formData.get("command") ?? "").trim();
  const inputMode = z
    .enum(["text", "voice_dictation", "voice_conversation"])
    .catch("text")
    .parse(formData.get("inputMode"));
  const threadId = await resolveThread(
    workspaceId,
    session?.userId ?? null,
    formData.get("threadId"),
    command,
  );
  const files = formData.getAll("documents").filter(isUploadFile);
  const uploaded: { name: string; status: string }[] = [];
  const uploadPrepared: string[] = [];
  const uploadBlocked: string[] = [];

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
      batch.completed.forEach((item, index) =>
        uploaded.push({
          name: files[index]?.name ?? "Document",
          status: item.status,
        }),
      );
      for (const item of batch.failed)
        uploaded.push({ name: item.fileName, status: "failed" });
      if (batch.completed.length)
        uploadPrepared.push(
          `Imported ${batch.completed.length} document${batch.completed.length === 1 ? "" : "s"} into Receipt & Expense Intelligence.`,
        );
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

  const result = await executeAiWorkforceCommandAction({ ok: false }, formData);
  const merged: FerocityChatActionState = {
    ...result,
    ok: result.ok && uploadBlocked.length === 0,
    prepared: [...uploadPrepared, ...(result.prepared ?? [])],
    blocked: [...uploadBlocked, ...(result.blocked ?? [])],
    href: files.length && !result.href ? "/app/expenses" : result.href,
    threadId: threadId ?? undefined,
    uploaded,
  };

  if (threadId && command) {
    await queryPostgres(
      `insert into public.ferocity_chat_messages
        (tenant_id, thread_id, user_id, role, body, command_run_id, status, detail_json)
       values ($1,$2,$3,'owner',$4,null,'completed',$5::jsonb),
              ($1,$2,$3,'ferocity',$6,$7,$8,$9::jsonb)`,
      [
        workspaceId,
        threadId,
        session?.userId ?? null,
        command,
        JSON.stringify({
          inputMode,
          uploaded: files.map((file) => ({
            name: file.name,
            type: file.type,
            size: file.size,
          })),
        }),
        merged.message ?? "Ferocity finished reviewing the request.",
        merged.runId ?? null,
        merged.needsInput
          ? "needs_input"
          : merged.blocked?.length
            ? "needs_attention"
            : merged.ok
              ? "completed"
              : "failed",
        JSON.stringify({
          inputMode,
          voiceRequiresClickForProtectedActions: inputMode !== "text",
          prepared: merged.prepared ?? [],
          blocked: merged.blocked ?? [],
          recommended: merged.recommended ?? [],
          href: merged.href,
          runId: merged.runId,
          uploaded,
        }),
      ],
    );
    await queryPostgres(
      `update public.ferocity_chat_threads set updated_at = now() where tenant_id = $1 and id = $2`,
      [workspaceId, threadId],
    );
  }

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
