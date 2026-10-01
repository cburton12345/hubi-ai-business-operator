import { generateJsonWithAiService, recordAiGenerationRun } from "@/lib/ai/ai-service";

export type AiGenerationRunInput = {
  tenantId: string;
  brandId?: string | null;
  runType: string;
  prompt: Record<string, unknown>;
  response: Record<string, unknown>;
  status: "completed" | "fallback" | "failed";
  fallbackUsed: boolean;
  errorMessage?: string | null;
};

export type JsonGenerationInput<T> = {
  tenantId: string;
  brandId?: string | null;
  runType: string;
  system: string;
  user: string;
  fallback: T;
  timeoutMs?: number;
  recoveryRunType?: string;
  recoveryTimeoutMs?: number;
};

export async function generateJsonWithProvider<T extends Record<string, unknown>>(input: JsonGenerationInput<T>): Promise<T> {
  const primary = await generateJsonWithAiService(input);
  if (!input.recoveryRunType || primary !== input.fallback) return primary;

  return generateJsonWithAiService({
    ...input,
    runType: input.recoveryRunType,
    timeoutMs: input.recoveryTimeoutMs ?? input.timeoutMs
  });
}

export { recordAiGenerationRun };
