import { queryPostgres } from "@/lib/db/postgres";
import { getServiceGate } from "@/lib/controls/service-gates";

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
};

function providerConfig() {
  return {
    provider: process.env.AI_PROVIDER || "openai",
    model: process.env.AI_MODEL || "gpt-4.1-mini",
    apiKey: process.env.OPENAI_API_KEY
  };
}

export async function recordAiGenerationRun(input: AiGenerationRunInput) {
  const config = providerConfig();
  await queryPostgres(
    `
    insert into public.ai_generation_runs (
      tenant_id,
      brand_id,
      provider,
      model,
      run_type,
      status,
      prompt_json,
      response_json,
      fallback_used,
      error_message
    )
    values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
    `,
    [
      input.tenantId,
      input.brandId ?? null,
      config.provider,
      config.model,
      input.runType,
      input.status,
      JSON.stringify(input.prompt),
      JSON.stringify(input.response),
      input.fallbackUsed,
      input.errorMessage ?? null
    ]
  );
}

function parseJsonObject<T>(value: string): T | null {
  const trimmed = value.trim();
  const jsonText = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim() : trimmed;

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
}

export async function generateJsonWithProvider<T extends Record<string, unknown>>(input: JsonGenerationInput<T>): Promise<T> {
  const config = providerConfig();
  const gate = await getServiceGate(input.tenantId, "ai_generation");

  if (!gate.enabled) {
    await recordAiGenerationRun({
      tenantId: input.tenantId,
      brandId: input.brandId,
      runType: input.runType,
      prompt: { system: input.system, user: input.user },
      response: input.fallback,
      status: "fallback",
      fallbackUsed: true,
      errorMessage: `AI generation skipped: ${gate.reason}`
    });
    return input.fallback;
  }

  if (config.provider !== "openai" || !config.apiKey) {
    await recordAiGenerationRun({
      tenantId: input.tenantId,
      brandId: input.brandId,
      runType: input.runType,
      prompt: { system: input.system, user: input.user },
      response: input.fallback,
      status: "fallback",
      fallbackUsed: true,
      errorMessage: config.provider !== "openai" ? `Provider ${config.provider} is not enabled yet.` : "OPENAI_API_KEY is not configured."
    });
    return input.fallback;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText.slice(0, 500));
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    const parsed = parseJsonObject<T>(content);

    if (!parsed) {
      throw new Error("Provider returned non-JSON content.");
    }

    await recordAiGenerationRun({
      tenantId: input.tenantId,
      brandId: input.brandId,
      runType: input.runType,
      prompt: { system: input.system, user: input.user },
      response: parsed,
      status: "completed",
      fallbackUsed: false
    });

    return parsed;
  } catch (error) {
    await recordAiGenerationRun({
      tenantId: input.tenantId,
      brandId: input.brandId,
      runType: input.runType,
      prompt: { system: input.system, user: input.user },
      response: input.fallback,
      status: "failed",
      fallbackUsed: true,
      errorMessage: error instanceof Error ? error.message : "AI provider call failed."
    });
    return input.fallback;
  }
}
