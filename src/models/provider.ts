// 模型 Provider 抽象与实现：OpenAI / Anthropic / Gemini / Ollama / 自定义兼容接口
// M2：统一 chat(messages, options) 协议，把各家 function calling 转换为内部 ToolCallRequest。

import type { ChatMessage, ChatOptions, ChatResult, ChatUsage, ProviderConfig, ToolCallRequest, ToolDefinition } from "../types.js";
import { estimateCostUsd } from "../utils/cost.js";
import { toJsonSchema } from "../core/tools.js";

export class CloverError extends Error {}

export interface ModelProvider {
  readonly config: ProviderConfig;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult>;
}

function requireKey(config: ProviderConfig): string {
  if (!config.apiKey) {
    throw new CloverError(
      config.id + " 未配置 API Key：请运行 clover config 配置，或设置 CLOVER_" + config.id.toUpperCase() + "_KEY 环境变量",
    );
  }
  return config.apiKey;
}

function toUsage(inputTokens: number, outputTokens: number): ChatUsage {
  return { inputTokens, outputTokens };
}

function finish(model: string, content: string, usage: ChatUsage, toolCalls?: ToolCallRequest[]): ChatResult {
  const result: ChatResult = {
    content,
    usage,
    estimatedCostUsd: estimateCostUsd(usage, model),
    model,
  };
  if (toolCalls && toolCalls.length > 0) result.toolCalls = toolCalls;
  return result;
}

function stripSystem(messages: ChatMessage[]): { system?: string; rest: ChatMessage[] } {
  const system = messages.find((m) => m.role === "system")?.content;
  return { system, rest: messages.filter((m) => m.role !== "system") };
}

/** 解析 OpenAI 风格 tool_calls（arguments 可能是 JSON 字符串或对象） */
function parseOpenAIToolCalls(
  raw: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>,
): ToolCallRequest[] {
  return (raw ?? []).map((tc, index) => {
    let args: Record<string, unknown> = {};
    const rawArgs = tc.function?.arguments;
    if (typeof rawArgs === "string") {
      try {
        const parsed = JSON.parse(rawArgs) as unknown;
        if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
      } catch {
        args = {};
      }
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }
    return { id: tc.id ?? "call_" + index, name: tc.function?.name ?? "", args };
  });
}

/** OpenAI 风格消息转换（OpenAI / custom / Ollama 共用；arguments 按各家要求决定字符串化与否） */
export function toOpenAIMessages(messages: ChatMessage[], argsAsString: boolean): Array<Record<string, unknown>> {
  return messages.map((m) => {
    if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: m.content };
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: argsAsString ? JSON.stringify(tc.args) : tc.args },
        }));
      }
      return msg;
    }
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === "user" && m.images && m.images.length > 0) {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ type: "text", text: m.content });
      for (const img of m.images) {
        parts.push({ type: "image_url", image_url: { url: "data:" + img.mediaType + ";base64," + img.dataBase64 } });
      }
      return { role: "user", content: parts };
    }
    return { role: m.role, content: m.content };
  });
}

type AnthropicBlock = Record<string, unknown>;
type AnthropicMessage = { role: string; content: AnthropicBlock[] };

/** Anthropic 消息转换：tool_use/tool_result 与图片块，合并相邻 user 消息 */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  const mapped: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      const content: AnthropicBlock[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      }
      mapped.push({ role: "assistant", content });
    } else if (m.role === "tool") {
      mapped.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content }],
      });
    } else {
      const content: AnthropicBlock[] = [];
      if (m.content) content.push({ type: "text", text: m.content });
      for (const img of m.images ?? []) {
        content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.dataBase64 } });
      }
      mapped.push({ role: "user", content });
    }
  }
  const merged: AnthropicMessage[] = [];
  for (const m of mapped) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.content.push(...m.content);
    else merged.push({ role: m.role, content: [...m.content] });
  }
  return merged;
}

function openAITools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: toJsonSchema(t) },
  }));
}

// ---------- OpenAI 与自定义兼容接口 ----------

class OpenAICompatibleProvider implements ModelProvider {
  constructor(public readonly config: ProviderConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const apiKey = requireKey(this.config);
    const baseUrl = (this.config.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: toOpenAIMessages(messages, true),
    };
    if (options?.tools && options.tools.length > 0) {
      body.tools = openAITools(options.tools);
      body.tool_choice = "auto";
    }
    const res = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new CloverError(this.config.id + " 请求失败：" + res.status + " " + (await res.text()));
    const data = (await res.json()) as {
      choices: Array<{ message: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> } }>;
      usage: { prompt_tokens: number; completion_tokens: number };
    };
    const message = data.choices[0]?.message;
    return finish(
      this.config.model,
      message?.content ?? "",
      toUsage(data.usage.prompt_tokens, data.usage.completion_tokens),
      parseOpenAIToolCalls(message?.tool_calls ?? []),
    );
  }
}

type GeminiContent = { role: string; parts: Array<Record<string, unknown>> };

/** Gemini 消息转换：functionCall/functionResponse 与内联图片，合并相邻同角色消息 */
export function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const mapped: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "assistant") {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ text: m.content });
      for (const tc of m.toolCalls ?? []) {
        parts.push({ functionCall: { name: tc.name, args: tc.args } });
      }
      mapped.push({ role: "model", parts });
    } else if (m.role === "tool") {
      mapped.push({
        role: "user",
        parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }],
      });
    } else {
      const parts: Array<Record<string, unknown>> = [];
      if (m.content) parts.push({ text: m.content });
      for (const img of m.images ?? []) {
        parts.push({ inline_data: { mime_type: img.mediaType, data: img.dataBase64 } });
      }
      mapped.push({ role: "user", parts });
    }
  }
  const merged: GeminiContent[] = [];
  for (const m of mapped) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) prev.parts.push(...m.parts);
    else merged.push({ role: m.role, parts: [...m.parts] });
  }
  return merged;
}

// ---------- Anthropic ----------

class AnthropicProvider implements ModelProvider {
  constructor(public readonly config: ProviderConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const apiKey = requireKey(this.config);
    const { system, rest } = stripSystem(messages);

    const merged = toAnthropicMessages(rest);

    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 4096,
      system: system ?? undefined,
      messages: merged,
    };
    if (options?.tools && options.tools.length > 0) {
      body.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: toJsonSchema(t),
      }));
      body.tool_choice = { type: "auto" };
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new CloverError("anthropic 请求失败：" + res.status + " " + (await res.text()));
    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
      usage: { input_tokens: number; output_tokens: number };
    };
    const text = data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
    const toolCalls = data.content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({ id: c.id ?? "", name: c.name ?? "", args: (c.input as Record<string, unknown>) ?? {} }));
    return finish(this.config.model, text, toUsage(data.usage.input_tokens, data.usage.output_tokens), toolCalls);
  }
}

// ---------- Gemini ----------

class GeminiProvider implements ModelProvider {
  constructor(public readonly config: ProviderConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const apiKey = requireKey(this.config);
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      this.config.model +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);
    const { system, rest } = stripSystem(messages);

    const merged = toGeminiContents(rest);

    const body: Record<string, unknown> = {
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: merged,
    };
    if (options?.tools && options.tools.length > 0) {
      body.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: toJsonSchema(t),
          })),
        },
      ];
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new CloverError("gemini 请求失败：" + res.status + " " + (await res.text()));
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; functionCall?: { name?: string; args?: unknown } }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p) => p.text ?? "").join("");
    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p, index) => ({
        id: "fc_" + index,
        name: p.functionCall?.name ?? "",
        args: (p.functionCall?.args as Record<string, unknown>) ?? {},
      }));
    return finish(
      this.config.model,
      text,
      toUsage(data.usageMetadata?.promptTokenCount ?? 0, data.usageMetadata?.candidatesTokenCount ?? 0),
      toolCalls,
    );
  }
}

/** Ollama 消息转换：OpenAI 形态，图片走 images 字段 */
export function toOllamaMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
  return toOpenAIMessages(messages, false).map((m) => {
    if (m.role === "user" && Array.isArray(m.content)) {
      const parts = m.content as Array<Record<string, unknown>>;
      const images = parts
        .filter((p) => p.type === "image_url")
        .map((p) => String((p.image_url as Record<string, unknown>)?.url ?? "").split(",").pop() ?? "");
      const text = parts
        .filter((p) => p.type === "text")
        .map((p) => String(p.text ?? ""))
        .join("\n");
      const msg: Record<string, unknown> = { role: "user", content: text };
      if (images.length > 0) msg.images = images;
      return msg;
    }
    return m;
  });
}

// ---------- Ollama ----------

class OllamaProvider implements ModelProvider {
  constructor(public readonly config: ProviderConfig) {}

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResult> {
    const baseUrl = (this.config.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
    const body: Record<string, unknown> = {
      model: this.config.model,
      stream: false,
      messages: toOllamaMessages(messages),
    };
    if (options?.tools && options.tools.length > 0) {
      body.tools = openAITools(options.tools);
    }
    const res = await fetch(baseUrl + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new CloverError("ollama 请求失败：" + res.status + " " + (await res.text()));
    const data = (await res.json()) as {
      message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> };
      prompt_eval_count?: number;
      eval_count?: number;
    };
    return finish(
      this.config.model,
      data.message?.content ?? "",
      toUsage(data.prompt_eval_count ?? 0, data.eval_count ?? 0),
      parseOpenAIToolCalls(data.message?.tool_calls ?? []),
    );
  }
}

export function createProvider(config: ProviderConfig): ModelProvider {
  switch (config.id) {
    case "openai":
      return new OpenAICompatibleProvider(config);
    case "custom":
      return new OpenAICompatibleProvider(config);
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "ollama":
      return new OllamaProvider(config);
  }
}
