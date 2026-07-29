"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { getCurrentAppSession } from "@/lib/auth/session";
import { safeLogAppError } from "@/lib/observability/log-error";
import { runOperationalQa } from "@/lib/qa/run-operational-qa";

export async function runOperationalQaAction() {
  await requirePermission("tenant:manage");
  const session = await getCurrentAppSession();
  const result = await runOperationalQa(session?.userId ?? null);
  revalidatePath("/app/qa");
  revalidatePath("/app/beta");
  return {
    ok: true,
    message: result.passed ? "Operational QA passed and the run history was updated." : "Operational QA completed with failures. Review the checks below.",
    checks: result.checks.length,
    failed: result.checks.filter((check) => !check.passed).length
  };
}

export async function runOperationalQaWithStateAction(
  _state: { ok: boolean; message?: string; checks?: number; failed?: number },
  _formData: FormData
) {
  try {
    return await runOperationalQaAction();
  } catch (error) {
    const correlationId = await safeLogAppError({
      source: "server_action.qa.run_operational_qa",
      severity: "error",
      message: "Operational QA action failed.",
      category: "server_action",
      retryable: true,
      metadata: { errorName: error instanceof Error ? error.name : "UnknownError" }
    });
    return {
      ok: false,
      message: `Operational QA failed before it could save a run. Reference ${correlationId}.`,
      checks: 0,
      failed: 0
    };
  }
}
