// Clover 共享类型定义

export type ProviderId = "openai" | "anthropic" | "gemini" | "deepseek" | "moonshot" | "zhipu" | "qwen" | "siliconflow" | "ollama" | "custom";

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ImageBlock {
  mediaType: string;
  dataBase64: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** 附件图片（多模态） */
  images?: ImageBlock[];
  /** 工具结果消息：对应的工具调用 ID */
  toolCallId?: string;
  /** 工具结果消息：工具名 */
  name?: string;
  /** assistant 消息：本轮请求的工具调用列表 */
  toolCalls?: ToolCallRequest[];
}

export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatOptions {
  /** 本轮可用的工具定义（各家会转换为自己的 function calling 协议） */
  tools?: ToolDefinition[];
  /** 流式回调：模型文本增量到达时调用 */
  onText?: (delta: string) => void;
}

export interface ChatResult {
  content: string;
  usage: ChatUsage;
  /** 估算费用（美元） */
  estimatedCostUsd: number;
  model: string;
  /** 模型请求的工具调用（没有则为空） */
  toolCalls?: ToolCallRequest[];
}

export interface ToolParameter {
  name: string;
  /** JSON Schema 类型 */
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
}

export interface ToolResult {
  ok: boolean;
  output: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  run(args: Record<string, string | undefined>): Promise<ToolResult>;
}

export interface ProviderConfig {
  id: ProviderId;
  /** 默认模型名 */
  model: string;
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
}

export interface CloverConfig {
  /** 界面与生成文档的语言：zh | en */
  language: "zh" | "en";
  /** 默认模型 Provider */
  defaultProvider: ProviderId;
  providers: Partial<Record<ProviderId, ProviderConfig>>;
  /** 预算上限（美元），0 表示不限制 */
  budgetUsd: number;
  /** 竞速模式：自动执行已批准类型命令 */
  speedMode: boolean;
  /** 自动 git 备份间隔（分钟） */
  backupIntervalMinutes: number;
  /** 定时备份开关 */
  autoBackup: boolean;
  /** 已信任的工作区目录列表（首次进入时安全确认后记住） */
  trustedFolders: string[];
}

export interface HackathonMeta {
  name: string;
  theme?: string;
  url?: string;
  startAt?: string;
  endAt?: string;
  durationHours: number;
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  startedAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface ProjectState {
  meta: HackathonMeta | null;
  challengeSummary?: string;
  ideas?: IdeaRecord[];
  mvpPlan?: MvpRecord;
  checklist?: Record<string, boolean>;
}

export interface IdeaRecord {
  id: string;
  title: string;
  summary: string;
  score: number;
  marketNote?: string;
  createdAt: string;
}

export interface MvpRecord {
  goal: string;
  features: string[];
  milestones: Array<{ title: string; hours: number; tasks: string[] }>;
  createdAt: string;
}

export interface ArchiveEntry {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  endedAt?: string;
  retrospective?: string;
}
