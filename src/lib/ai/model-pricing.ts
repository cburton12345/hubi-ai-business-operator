export type TextTokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

type ModelPrice = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

const prices: Record<string, ModelPrice> = {
  "gpt-4.1-mini": { inputUsdPerMillion: 0.4, cachedInputUsdPerMillion: 0.1, outputUsdPerMillion: 1.6 },
  "gpt-5-nano": { inputUsdPerMillion: 0.05, cachedInputUsdPerMillion: 0.005, outputUsdPerMillion: 0.4 },
  "gpt-5-mini": { inputUsdPerMillion: 0.25, cachedInputUsdPerMillion: 0.025, outputUsdPerMillion: 2 },
  "gpt-5.4-nano": { inputUsdPerMillion: 0.2, cachedInputUsdPerMillion: 0.02, outputUsdPerMillion: 1.25 },
  "gpt-5.4-mini": { inputUsdPerMillion: 0.75, cachedInputUsdPerMillion: 0.075, outputUsdPerMillion: 4.5 },
  "gpt-5.6-luna": { inputUsdPerMillion: 1, cachedInputUsdPerMillion: 0.1, outputUsdPerMillion: 6 },
  "gpt-5.6-terra": { inputUsdPerMillion: 2.5, cachedInputUsdPerMillion: 0.25, outputUsdPerMillion: 15 },
  "gpt-5.6-sol": { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 },
  "gpt-5.6": { inputUsdPerMillion: 5, cachedInputUsdPerMillion: 0.5, outputUsdPerMillion: 30 }
};

function normalizedModel(modelName: string) {
  if (prices[modelName]) return modelName;
  return Object.keys(prices).find((key) => modelName.startsWith(`${key}-`)) ?? "gpt-4.1-mini";
}

export function estimateTextCostCents(modelName: string, usage?: TextTokenUsage) {
  const promptTokens = Math.max(0, usage?.prompt_tokens ?? 0);
  const completionTokens = Math.max(0, usage?.completion_tokens ?? 0);
  if (!promptTokens && !completionTokens) return 0;

  const price = prices[normalizedModel(modelName)];
  const inputOverride = Number(process.env.AI_INPUT_USD_PER_MILLION);
  const outputOverride = Number(process.env.AI_OUTPUT_USD_PER_MILLION);
  const cachedOverride = Number(process.env.AI_CACHED_INPUT_USD_PER_MILLION);
  const inputRate = Number.isFinite(inputOverride) && inputOverride >= 0 ? inputOverride : price.inputUsdPerMillion;
  const outputRate = Number.isFinite(outputOverride) && outputOverride >= 0 ? outputOverride : price.outputUsdPerMillion;
  const cachedRate = Number.isFinite(cachedOverride) && cachedOverride >= 0 ? cachedOverride : price.cachedInputUsdPerMillion;
  const cachedTokens = Math.min(promptTokens, Math.max(0, usage?.prompt_tokens_details?.cached_tokens ?? 0));
  const uncachedTokens = promptTokens - cachedTokens;
  const costUsd = (uncachedTokens * inputRate + cachedTokens * cachedRate + completionTokens * outputRate) / 1_000_000;
  return Number((costUsd * 100).toFixed(4));
}
