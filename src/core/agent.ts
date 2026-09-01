// Agent 主循环：M2 已接入工具调用（读写文件、执行命令）与权限确认

import type { ModelProvider } from "../models/provider.js";
import { appendMessage, saveSession } from "./session.js";
import type { ChatMessage, ChatResult, ImageBlock, SessionRecord, ToolCallRequest, ToolResult } from "../types.js";
import { checkBudget, formatUsd } from "../utils/cost.js";
import { note, warn } from "../utils/logger.js";
import { findTool, TOOLS } from "./tools.js";

const SYSTEM_PROMPT = [
  "你是 Clover，一个专为黑客松比赛设计的 AI 搭档。",
  "你会帮助用户：解析赛题、生成与评估点子、规划 MVP、管理时间、检查提交材料、准备 Pitch。",
  "你可以在项目目录里读写文件、执行终端命令，真正动手完成开发任务。",
  "默认使用中文交流（除非用户要求其他语言）。回答要简洁、可执行、紧扣黑客松时间有限的特点。",
].join("\n");

const MAX_TOOL_ROUNDS = 10;

/** 命令审批器：执行 run_command 前需要用户确认 */
export interface CommandApprover {
  approve(command: string): Promise<boolean>;
}

export interface AgentOptions {
  provider: ModelProvider;
  session: SessionRecord;
  budgetUsd: number;
  permissions?: CommandApprover;
}

export class Agent {
  private readonly messages: ChatMessage[];

  constructor(private readonly options: AgentOptions) {
    this.messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...options.session.messages,
    ];
  }

  /** 发送一轮对话：模型可多次调用工具，直至给出最终回答 */
  async turn(userInput: string, images?: ImageBlock[]): Promise<string> {
    const { provider, session, budgetUsd, permissions } = this.options;
    const userMessage: ChatMessage = { role: "user", content: userInput };
    if (images && images.length > 0) userMessage.images = images;
    appendMessage(session, userMessage);
    this.messages.push(userMessage);

    let finalText = "";
    let turnCost = 0;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await provider.chat(this.messages, { tools: TOOLS });
      turnCost += result.estimatedCostUsd;
      this.account(session, result);

      const assistantMessage: ChatMessage = { role: "assistant", content: result.content };
      if (result.toolCalls && result.toolCalls.length > 0) {
        assistantMessage.toolCalls = result.toolCalls;
      }
      appendMessage(session, assistantMessage);
      this.messages.push(assistantMessage);

      if (!assistantMessage.toolCalls || assistantMessage.toolCalls.length === 0) {
        finalText = result.content;
        break;
      }

      for (const call of assistantMessage.toolCalls) {
        const toolResult = await this.executeTool(call, permissions);
        note("🔧 " + call.name + " → " + summarize(toolResult));
        const toolMessage: ChatMessage = {
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: toolResult.ok ? toolResult.output : "ERROR: " + toolResult.output,
        };
        appendMessage(session, toolMessage);
        this.messages.push(toolMessage);
      }
    }

    if (!finalText) {
      warn("工具调用超过 " + MAX_TOOL_ROUNDS + " 轮，已停止");
      finalText = "（工具调用过多已停止，请重新描述你的目标）";
    }
    saveSession(session);

    const status = checkBudget(session.totalCostUsd, budgetUsd);
    note("本次: " + formatUsd(turnCost) + " · 累计: " + formatUsd(session.totalCostUsd));
    if (status.nearLimit) {
      warn("已接近预算上限（" + formatUsd(budgetUsd) + "），请留意成本");
    }
    return finalText;
  }

  private account(session: SessionRecord, result: ChatResult): void {
    session.totalInputTokens += result.usage.inputTokens;
    session.totalOutputTokens += result.usage.outputTokens;
    session.totalCostUsd += result.estimatedCostUsd;
  }

  private async executeTool(call: ToolCallRequest, permissions?: CommandApprover): Promise<ToolResult> {
    const tool = findTool(call.name);
    if (!tool) return { ok: false, output: "未知工具: " + call.name };

    // 各家参数可能是对象/数字等，统一字符串化后传给工具
    const args: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(call.args ?? {})) {
      args[key] = value == null ? undefined : typeof value === "string" ? value : JSON.stringify(value);
    }

    if (tool.name === "run_command" && permissions) {
      const approved = await permissions.approve(args.command ?? "");
      if (!approved) {
        return { ok: false, output: "用户拒绝了命令执行" };
      }
    }
    return tool.run(args);
  }

  /** 总用量统计 */
  usage() {
    const u = {
      inputTokens: this.options.session.totalInputTokens,
      outputTokens: this.options.session.totalOutputTokens,
    };
    return { ...u, costUsd: this.options.session.totalCostUsd };
  }
}

function summarize(toolResult: ToolResult): string {
  const first = toolResult.output.split("\n")[0]?.trim() || (toolResult.ok ? "完成" : "失败");
  const short = first.length > 60 ? first.slice(0, 60) + "…" : first;
  return toolResult.ok ? short : "失败: " + short;
}
