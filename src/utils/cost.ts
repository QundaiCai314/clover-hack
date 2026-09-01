// Token 成本估算（单价按各厂商公开定价，单位：美元 / 1M tokens）
// 仅用于预算提醒，实际以账单为准；价格可随时在 PRICING 表调整。

import type { ChatUsage } from "../types.js";

export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}

// 常见模型定价（美元 / 百万 token），新模型按需补充
export const PRICING: Record<string, ModelPrice> = {
  // OpenAI
  "gpt-4o": { inputPerM: 2.5, outputPerM: 10 },
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "gpt-4.1": { inputPerM: 2, outputPerM: 8 },
  "gpt-4.1-mini": { inputPerM: 0.4, outputPerM: 1.6 },
  "o3": { inputPerM: 2, outputPerM: 8 },
  "o4-mini": { inputPerM: 1.1, outputPerM: 4.4 },
  // Anthropic
  "claude-sonnet-4-5": { inputPerM: 3, outputPerM: 15 },
  "claude-opus-4-1": { inputPerM: 15, outputPerM: 75 },
  "claude-haiku-4-5": { inputPerM: 1, outputPerM: 5 },
  // Google
  "gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10 },
  "gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
  // 本地/兼容接口默认按 0 计
  "ollama": { inputPerM: 0, outputPerM: 0 },
};

/** 未收录模型时按此价格估算（保守偏高） */
const FALLBACK: ModelPrice = { inputPerM: 3, outputPerM: 15 };

export function estimateCostUsd(usage: ChatUsage, model: string): number {
  const price = PRICING[model] ?? FALLBACK;
  return (usage.inputTokens * price.inputPerM + usage.outputTokens * price.outputPerM) / 1_000_000;
}

export function formatUsd(value: number): string {
  if (value < 0.01) return "$" + value.toFixed(4);
  return "$" + value.toFixed(2);
}

export interface BudgetStatus {
  totalUsd: number;
  limitUsd: number;
  ratio: number;
  nearLimit: boolean;
}

export function checkBudget(totalUsd: number, limitUsd: number): BudgetStatus {
  const ratio = limitUsd > 0 ? totalUsd / limitUsd : 0;
  return {
    totalUsd,
    limitUsd,
    ratio,
    nearLimit: limitUsd > 0 && ratio >= 0.8,
  };
}

export function addUsage(a: ChatUsage, b: ChatUsage): ChatUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}
