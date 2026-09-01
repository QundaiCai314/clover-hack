// 所有 clover 子命令实现

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { askInput, askYesNo } from "../utils/input.js";
import { PermissionManager } from "../core/permissions.js";
import { createProvider } from "../models/provider.js";
import type { ModelProvider } from "../models/provider.js";
import { Agent } from "../core/agent.js";
import { createSession, latestSession, listSessions, loadSession } from "../core/session.js";
import { loadGlobalConfig, saveGlobalConfig, GLOBAL_CONFIG_PATH, ARCHIVE_PATH, PROJECT_CONFIG_PATH, isProject, readJsonFile, writeJsonFile } from "../utils/config.js";
import { formatUsd } from "../utils/cost.js";
import { banner, info, note, warn, error } from "../utils/logger.js";
import { findPet, renderPet, randomWelcomePet } from "../utils/pet.js";
import { buildStatusBar, buildShortcutsPanel, buildWelcomePanel } from "../utils/panel.js";
import { searchWeb } from "../core/tools.js";
import type { ArchiveEntry, CloverConfig, HackathonMeta, IdeaRecord, ImageBlock, ProviderConfig, ProviderId, ToolCallRequest, ToolResult } from "../types.js";
import { buildAnalyzePrompt, buildIdeatePrompt, buildEvaluatePrompt, buildMvpPrompt, buildPitchPrompt, buildRetrospectivePrompt, runSubmissionChecks } from "../hackathon/workflows.js";

const STATE_PATH = path.join(".clover", "state.json");

// 输入统一走 utils/input.ts（单 readline + 行队列，兼容交互与管道输入）

// ---------- 宠物出场 ----------

function showPet(name?: string): void {
  const pet = (name ? findPet(name) : undefined) ?? randomWelcomePet();
  console.log("\n" + renderPet(pet) + "\n");
  note(pet.caption);
}

function loadState(): Record<string, unknown> {
  return readJsonFile<Record<string, unknown>>(STATE_PATH) ?? {};
}

function saveState(state: Record<string, unknown>): void {
  writeJsonFile(STATE_PATH, state);
}

function getMeta(): HackathonMeta | null {
  const state = loadState();
  return (state.meta as HackathonMeta | undefined) ?? null;
}

function getActiveProvider(config: CloverConfig): ModelProvider {
  const providerConfig = config.providers[config.defaultProvider];
  if (!providerConfig) throw new Error("默认 Provider 未配置，请运行 clover config");
  return createProvider(providerConfig);
}

function requireConfigured(): CloverConfig {
  const config = loadGlobalConfig();
  const provider = config.providers[config.defaultProvider];
  if (!provider || !provider.apiKey) {
    throw new Error("尚未配置模型 API Key，请先运行 clover config");
  }
  return config;
}

function saveReport(fileName: string, content: string): string {
  const dir = path.join(".clover", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, fileName);
  fs.writeFileSync(target, content, "utf8");
  return target;
}

async function runChatWith(provider: ModelProvider, prompt: string): Promise<string> {
  const result = await provider.chat([{ role: "user", content: prompt }]);
  note("本次消耗 " + result.usage.inputTokens + " in / " + result.usage.outputTokens + " out · " + formatUsd(result.estimatedCostUsd));
  return result.content;
}

// ---------- init / new / archive ----------

export async function cmdInit(): Promise<void> {
  if (fs.existsSync(PROJECT_CONFIG_PATH)) {
    warn("当前目录已是 Clover 比赛项目");
    return;
  }
  const name = await askInput("比赛名称（如 Hackathon 2026）", "My Hackathon");
  const url = await askInput("比赛链接/官网");
  const durationHours = Number(await askInput("比赛时长（小时，如 48 / 72 / 168）", "48"));
  const endAt = await askInput("提交截止时间（YYYY-MM-DD HH:mm）");
  const meta: HackathonMeta = {
    name,
    url: url || undefined,
    endAt: endAt || undefined,
    durationHours: Number.isFinite(durationHours) && durationHours > 0 ? durationHours : 48,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(".clover", { recursive: true });
  writeJsonFile(PROJECT_CONFIG_PATH, { meta });
  saveState({ meta });
  showPet("happy");
  info("✓ 比赛项目已初始化：" + name);
  note("下一步：clover analyze <赛题文件或URL> 解析赛题");
}

/** 懒初始化：未初始化目录自动创建默认比赛档案，像 Claude Code 一样开箱即用 */
function ensureProject(): void {
  if (isProject()) return;
  const name = path.basename(process.cwd()) || "My Hackathon";
  const meta: HackathonMeta = {
    name,
    durationHours: 48,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(".clover", { recursive: true });
  writeJsonFile(PROJECT_CONFIG_PATH, { meta });
  saveState({ meta });
  note("已自动初始化比赛项目：「" + name + "」如需修改赛题或截止时间，运行 clover init");
}

export async function cmdNew(name: string): Promise<void> {
  const safe = name.replace(/[\\/:*?"<>|]/g, "-");
  const dir = path.join(process.cwd(), safe);
  if (fs.existsSync(dir)) throw new Error("目录已存在: " + safe);
  const meta: HackathonMeta = {
    name,
    durationHours: 48,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.join(dir, ".clover"), { recursive: true });
  writeJsonFile(path.join(dir, PROJECT_CONFIG_PATH), { meta });
  const entry: ArchiveEntry = {
    id: Date.now().toString(36),
    name,
    path: dir,
    createdAt: new Date().toISOString(),
  };
  const archives = readJsonFile<ArchiveEntry[]>(ARCHIVE_PATH) ?? [];
  archives.unshift(entry);
  writeJsonFile(ARCHIVE_PATH, archives);
  info("✓ 已创建比赛档案目录：" + safe);
  note("cd " + safe + " 后运行 clover init 初始化该比赛");
}

export function cmdArchiveList(): void {
  const archives = readJsonFile<ArchiveEntry[]>(ARCHIVE_PATH) ?? [];
  if (archives.length === 0) {
    note("还没有历史比赛档案。用 clover new <比赛名> 创建档案目录。");
    return;
  }
  banner("历史比赛档案（" + archives.length + "）");
  for (const archive of archives) {
    info("🍀 " + archive.name + " · " + archive.path + " · " + archive.createdAt.slice(0, 10));
  }
}

// ---------- status / template / check ----------

export function cmdStatus(): void {
  const meta = getMeta();
  const config = loadGlobalConfig();
  const state = loadState();
  banner("比赛状态");
  if (meta) {
    info("比赛： " + meta.name);
    if (meta.endAt) {
      const remain = new Date(meta.endAt).getTime() - Date.now();
      const hours = Math.max(0, Math.floor(remain / 3_600_000));
      note("剩余： " + hours + " 小时（截止 " + meta.endAt + "）");
    }
  } else {
    warn("当前目录尚未初始化比赛（clover init）");
  }
  const provider = config.providers[config.defaultProvider];
  note("模型： " + config.defaultProvider + " / " + (provider?.model ?? "未配置"));
  note("预算： " + (config.budgetUsd > 0 ? formatUsd(config.budgetUsd) : "不限制") + " · 模式： " + (config.speedMode ? "竞速（自动执行）" : "默认确认"));
  note("赛题摘要： " + (state.challengeSummary ? "已生成" : "无"));
  note("点子： " + ((state.ideas as IdeaRecord[] | undefined)?.length ?? 0) + " 个");
}

const TEMPLATES_DIR = fileURLToPath(new URL("../../src/templates", import.meta.url));

export function cmdTemplate(type: string): void {
  ensureProject();
  const valid = ["readme", "pitch", "submission", "timeline"];
  if (!valid.includes(type)) {
    throw new Error("不支持的模板类型：" + type + "（可用：readme / pitch / submission / timeline）");
  }
  const target = type === "readme" ? "README.md" : type + ".md";
  if (fs.existsSync(target)) {
    warn(target + " 已存在，跳过生成");
    return;
  }
  const source = path.join(TEMPLATES_DIR, type + ".md");
  if (!fs.existsSync(source)) throw new Error("模板文件不存在: " + source);
  fs.writeFileSync(target, fs.readFileSync(source, "utf8"), "utf8");
  info("✓ 已生成 " + target);
  note("下一步：填写内容，或 clover check 检查提交材料");
}

export async function cmdCheck(): Promise<void> {
  ensureProject();
  banner("提交检查中…");
  const items = await runSubmissionChecks(getMeta());
  let allPass = true;
  for (const item of items) {
    if (item.pass) {
      info("✓ " + item.name);
    } else {
      warn("✗ " + item.name + "（" + item.detail + "）");
      allPass = false;
    }
  }
  if (allPass) {
    showPet("happy");
    info("✓ 全部通过，可以提交！");
  } else {
    note("还有未通过项，处理后再运行 clover check");
  }
}

// ---------- 配置 ----------

const PROVIDER_IDS = ["deepseek", "qwen", "moonshot", "zhipu", "siliconflow", "openai", "anthropic", "gemini", "ollama", "custom"] as const;

const DEFAULT_MODELS: Record<string, string> = {
  deepseek: "deepseek-chat",
  qwen: "qwen-plus",
  moonshot: "moonshot-v1-8k",
  zhipu: "glm-4-flash",
  siliconflow: "Qwen/Qwen2.5-7B-Instruct",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5",
  gemini: "gemini-2.5-flash",
  ollama: "qwen2.5:7b",
  custom: "gpt-4o-mini",
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  moonshot: "https://api.moonshot.cn/v1",
  zhipu: "https://open.bigmodel.cn/api/paas/v4",
  siliconflow: "https://api.siliconflow.cn/v1",
};

export async function cmdConfig(): Promise<void> {
  const config = loadGlobalConfig();
  banner("Clover 配置向导（直接回车使用当前值）");
  const lang = await askInput("界面语言（zh / en）", config.language);
  config.language = lang === "en" ? "en" : "zh";
  note("国内推荐：deepseek / qwen / zhipu（glm-4-flash 免费）/ siliconflow（有免费模型）");
  const pick = (await askInput("默认模型 Provider（" + PROVIDER_IDS.join(" / ") + "）", config.defaultProvider)).toLowerCase();
  if ((PROVIDER_IDS as readonly string[]).includes(pick)) {
    config.defaultProvider = pick as ProviderId;
  }
  for (const id of PROVIDER_IDS) {
    const provider = config.providers[id] ?? { id, model: DEFAULT_MODELS[id] ?? "", apiKey: undefined, baseUrl: DEFAULT_BASE_URLS[id] ?? undefined, enabled: false };
    const enabled = await askYesNo("启用 " + id + " ？");
    provider.enabled = enabled;
    if (enabled) {
      const key = await askInput(id + " API Key（可留空，用环境变量 CLOVER_" + id.toUpperCase() + "_KEY）", provider.apiKey ?? "");
      if (key) provider.apiKey = key;
      const model = await askInput(id + " 模型名", provider.model || DEFAULT_MODELS[id] || "");
      if (model) provider.model = model;
      if (id === "ollama" || id === "custom") {
        const base = await askInput(id + " Base URL", provider.baseUrl ?? (id === "ollama" ? "http://localhost:11434" : ""));
        if (base) provider.baseUrl = base;
      }
    }
    config.providers[id] = provider;
  }
  const budget = Number(await askInput("预算上限（美元，0 表示不限制）", String(config.budgetUsd)));
  if (Number.isFinite(budget) && budget >= 0) config.budgetUsd = budget;
  config.speedMode = await askYesNo("竞速模式？已批准的命令类型自动执行");
  config.autoBackup = await askYesNo("自动备份（git 定时提交）？");
  const interval = Number(await askInput("自动备份间隔（分钟）", String(config.backupIntervalMinutes)));
  if (Number.isFinite(interval) && interval > 0) config.backupIntervalMinutes = interval;
  saveGlobalConfig(config);
  info("✓ 配置已保存：" + GLOBAL_CONFIG_PATH);
  showPet("happy");
}

export function cmdModels(): void {
  const config = loadGlobalConfig();
  banner("模型配置");
  for (const id of PROVIDER_IDS) {
    const provider = config.providers[id];
    if (!provider) continue;
    const key = provider.apiKey ? provider.apiKey.slice(0, 7) + "…" : "未配置";
    const extra = provider.baseUrl ? " · " + provider.baseUrl : "";
    note(id + " · " + provider.model + " · key: " + key + extra + (provider.enabled ? " · 启用" : " · 未启用"));
  }
  info("默认：" + config.defaultProvider);
}

// ---------- 会话浏览 ----------

export function cmdSessions(id?: string): void {
  if (!id) {
    const sessions = listSessions();
    if (sessions.length === 0) {
      note("还没有会话记录。进入 clover start 开始对话。");
      return;
    }
    banner("历史会话（" + sessions.length + "）");
    for (const s of sessions) {
      info("🍀 " + s.id.slice(0, 8) + " · " + s.startedAt.slice(0, 16).replace("T", " ") + " · " + s.messages.length + " 条 · " + formatUsd(s.totalCostUsd));
    }
    note("查看详情：clover sessions <会话ID>");
    return;
  }
  const session = loadSession(id) ?? listSessions().find((s) => s.id.startsWith(id)) ?? null;
  if (!session) {
    warn("找不到会话：" + id);
    return;
  }
  banner("会话 " + session.id.slice(0, 8) + " · " + session.messages.length + " 条消息 · " + formatUsd(session.totalCostUsd));
  for (const m of session.messages) {
    const tag = m.role === "system" ? "系统" : m.role === "user" ? "用户" : m.role === "assistant" ? "Clover" : "工具";
    const text = m.content.slice(0, 200) + (m.content.length > 200 ? "…" : "");
    note("[" + tag + "] " + text);
  }
}

// ---------- 赛题工作流 ----------

async function getChallengeSummary(config: CloverConfig): Promise<string> {
  const state = loadState();
  if (typeof state.challengeSummary === "string" && state.challengeSummary) return state.challengeSummary;
  throw new Error("还没有赛题摘要，请先运行 clover analyze <赛题文件或URL>");
}

export async function cmdAnalyze(source?: string): Promise<void> {
  ensureProject();
  const config = requireConfigured();
  let raw = source ?? "";
  if (!raw) raw = await askInput("粘贴赛题文本，或输入文件路径/URL");
  if (fs.existsSync(raw)) {
    raw = fs.readFileSync(raw, "utf8");
  } else if (/^https?:\/\//.test(raw)) {
    const res = await fetch(raw);
    if (!res.ok) throw new Error("无法获取 URL：" + res.status);
    raw = await res.text();
  }
  banner("解析赛题中…");
  const output = await runChatWith(getActiveProvider(config), buildAnalyzePrompt(raw));
  const state = loadState();
  state.challengeSummary = output;
  saveState(state);
  const target = saveReport("challenge.md", output);
  console.log("\n" + output + "\n");
  note("已保存：" + target + " · 下一步：clover ideate");
}

export async function cmdIdeate(): Promise<void> {
  ensureProject();
  const config = requireConfigured();
  const summary = await getChallengeSummary(config);
  const skills = await askInput("你的技能栈（如 TypeScript/React/Node）", "通用 Web 开发");
  banner("生成点子中…");
  const output = await runChatWith(getActiveProvider(config), buildIdeatePrompt(summary, skills));
  const target = saveReport("ideas.md", output);
  console.log("\n" + output + "\n");
  note("已保存：" + target + " · 下一步：clover evaluate 「选中的点子」");
}

export async function cmdEvaluate(idea?: string): Promise<void> {
  ensureProject();
  const config = requireConfigured();
  const text = idea ?? (await askInput("要评估的点子描述"));
  banner("联网市场分析中…");
  const searchResults = await searchWeb(text, 5).catch(() => "");
  const prompt = buildEvaluatePrompt(text) + (searchResults ? "\n\n## 联网搜索参考资料（供市场分析参考）\n" + searchResults : "");
  const output = await runChatWith(getActiveProvider(config), prompt);
  const target = saveReport("evaluation.md", output);
  console.log("\n" + output + "\n");
  note("已保存：" + target + " · 下一步：clover plan");
}

export async function cmdPlan(): Promise<void> {
  ensureProject();
  const config = requireConfigured();
  const summary = await getChallengeSummary(config);
  const idea = await askInput("选定的点子（或输入文件路径）");
  const ideaText = fs.existsSync(idea) ? fs.readFileSync(idea, "utf8") : idea;
  const meta = getMeta();
  banner("规划 MVP 中…");
  const output = await runChatWith(getActiveProvider(config), buildMvpPrompt(summary, ideaText, meta?.durationHours ?? 48));
  const target = saveReport("mvp-plan.md", output);
  console.log("\n" + output + "\n");
  note("已保存：" + target);
}

export async function cmdPitch(): Promise<void> {
  ensureProject();
  const config = requireConfigured();
  const meta = getMeta();
  const infoText = await askInput("项目信息（一句话）或文件路径");
  const text = fs.existsSync(infoText) ? fs.readFileSync(infoText, "utf8") : infoText;
  banner("生成 Pitch 稿中…");
  const output = await runChatWith(getActiveProvider(config), buildPitchPrompt(meta?.name ?? "项目", text));
  const target = saveReport("pitch.md", output);
  console.log("\n" + output + "\n");
  note("已保存：" + target);
}

export async function cmdReview(): Promise<void> {
  ensureProject();
  const config = requireConfigured();
  banner("生成复盘报告中…");
  const output = await runChatWith(getActiveProvider(config), buildRetrospectivePrompt(getMeta(), latestSession()));
  const target = saveReport("retrospective.md", output);
  console.log("\n" + output + "\n");
  note("已保存：" + target);
}

// ---------- 多模态输入 ----------

const IMAGE_EXTENSIONS: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** 从输入里识别图片路径并加载为 base64，其余内容保留为文本 */
function parseInputImages(input: string): { text: string; images: ImageBlock[] } {
  const tokens = input.split(/\s+/);
  const images: ImageBlock[] = [];
  const rest: string[] = [];
  for (const token of tokens) {
    const cleaned = token.replace(/^["']|["']$/g, "");
    const ext = path.extname(cleaned).toLowerCase();
    const mediaType = IMAGE_EXTENSIONS[ext];
    if (mediaType && fs.existsSync(cleaned)) {
      const stat = fs.statSync(cleaned);
      if (stat.size > MAX_IMAGE_BYTES) {
        warn("图片超过 5MB，已跳过：" + cleaned);
        continue;
      }
      images.push({ mediaType, dataBase64: fs.readFileSync(cleaned).toString("base64") });
      note("🖼 已附加图片：" + cleaned);
    } else {
      rest.push(token);
    }
  }
  return { text: rest.join(" ").trim(), images };
}

// ---------- 自动 git 备份 ----------

/** 自动备份：git add -A + commit；非 git 仓库或没有改动时静默跳过 */
export function autoCommit(): string | null {
  if (!fs.existsSync(path.join(process.cwd(), ".git"))) return null;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    execFileSync("git", ["add", "-A"], { stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "clover: auto backup " + stamp], { stdio: "ignore" });
    return "已自动提交备份 " + stamp;
  } catch {
    return null;
  }
}


/** 工具调用卡片：名称 + 关键参数 + 结果 */
function toolCard(call: ToolCallRequest, result: ToolResult): string {
  const args = toolCardArgs(call);
  const first = result.output.split("\n")[0]?.trim() || (result.ok ? "完成" : "失败");
  const short = first.length > 70 ? first.slice(0, 70) + "…" : first;
  return "🔧 " + call.name + " " + args + " → " + (result.ok ? "✓ " : "✗ ") + short;
}

function toolCardArgs(call: ToolCallRequest): string {
  const a = call.args ?? {};
  if (call.name === "write_file") {
    return String(a.path ?? "") + " · " + String(a.content ?? "").length + " 字符";
  }
  if (call.name === "run_command") return "`" + String(a.command ?? "").slice(0, 80) + "`";
  if (call.name === "web_search") return "「" + String(a.query ?? "") + "」";
  const parts = Object.entries(a)
    .map(([k, v]) => k + "=" + String(v).slice(0, 60))
    .slice(0, 3);
  return parts.join(" ");
}

function cliVersion(): string {
  const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
  try {
    return (JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version: string }).version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// ---------- start（对话模式） ----------

export async function cmdStart(): Promise<void> {
  ensureProject();
  const config = requireConfigured();
  const provider = getActiveProvider(config);
  let session = latestSession() ?? createSession();
  const permissions = new PermissionManager(config);
  let agent = new Agent({ provider, session, budgetUsd: config.budgetUsd, permissions });
  /** 流式回答：思考指示 → 逐字输出 → 工具卡片 */

  const streamAnswer = async (text: string, images?: ImageBlock[]): Promise<void> => {
    let started = false;
    let spinnerTimer: NodeJS.Timeout | null = null;
    let spin = 0;
    const startThinking = () => {
      process.stdout.write("🍀 思考中 /");
      spinnerTimer = setInterval(() => {
        spin = (spin + 1) % 4;
        process.stdout.write("\r🍀 思考中 " + ["/", "-", "\\", "|"][spin]);
      }, 120);
    };
    const stopThinking = () => {
      if (spinnerTimer) {
        clearInterval(spinnerTimer);
        spinnerTimer = null;
      }
      process.stdout.write("\r" + " ".repeat(18) + "\r");
    };
    const begin = () => {
      if (!started) {
        started = true;
        stopThinking();
        process.stdout.write("\n");
      }
    };
    // Esc / Ctrl+C 中断当前生成（readline 在 TTY 下本身处于 raw 模式，直接监听字节即可）
    const controller = new AbortController();
    const onEscData = (chunk: Buffer) => {
      const key = chunk.toString();
      if (key === "\u001b" || key === "\u0003") controller.abort();
    };
    process.stdin.on("data", onEscData);
    try {
      startThinking();
      const answer = await agent.turn(text, images, {
        onText: (delta) => {
          begin();
          process.stdout.write(delta);
        },
        onToolResult: (call, result) => {
          begin();
          console.log(toolCard(call, result));
        },
        signal: controller.signal,
      });
      if (!started) {
        stopThinking();
        process.stdout.write("\n" + answer + "\n");
      } else {
        process.stdout.write("\n");
      }
    } catch (err) {
      if (!started) stopThinking();
      process.stdout.write("\n");
      if (controller.signal.aborted) {
        note("已中断生成");
        return;
      }
      throw err;
    } finally {
      process.stdin.removeListener("data", onEscData);
    }
  };



  let backupTimer: NodeJS.Timeout | null = null;
  if (config.autoBackup && config.backupIntervalMinutes > 0) {
    backupTimer = setInterval(() => {
      const message = autoCommit();
      if (message) note("🔄 " + message);
    }, config.backupIntervalMinutes * 60_000);
    note("自动备份已开启：每 " + config.backupIntervalMinutes + " 分钟提交一次");
  }

  const welcomeInfo = {
    version: cliVersion(),
    providerLabel: provider.config.id + " / " + provider.config.model,
    budgetLabel: formatUsd(config.budgetUsd),
    speedMode: config.speedMode,
    folder: process.cwd(),
    sessionLabel: session.messages.length > 0
      ? "上次会话 " + session.id.slice(0, 8) + "（" + session.messages.length + " 条消息）"
      : (config.language === "zh" ? "新会话，等你发令" : "New session, ready to go"),
    sessionIdShort: session.id.slice(0, 8),
    pet: randomWelcomePet(),
    language: config.language ?? "zh",
  };
  console.log("\n" + buildWelcomePanel(welcomeInfo).join("\n") + "\n");
  const makeStatusBar = (): string =>
    buildStatusBar({
      version: cliVersion(),
      providerLabel: provider.config.id + " / " + provider.config.model,
      budgetLabel: formatUsd(config.budgetUsd),
      speedMode: config.speedMode,
      folder: process.cwd(),
      sessionLabel: "会话 " + session.id.slice(0, 8),
      sessionIdShort: session.id.slice(0, 8),
      pet: welcomeInfo.pet,
      language: config.language ?? "zh",
    });
  note(makeStatusBar());

  for (;;) {
    const input = (await askInput("> ")).trim();
    if (!input) continue;
    if (input === "?") {
      console.log("\n" + buildShortcutsPanel(config.language ?? "zh").join("\n") + "\n");
      continue;
    }
    if (input === "/quit" || input === "exit" || input === "quit") break;
    if (input === "/status") {
      cmdStatus();
      note(makeStatusBar());
      continue;
    }
    if (input === "/cost") {
      const u = agent.usage();
      info("预算： " + formatUsd(config.budgetUsd) + " · 累计： " + formatUsd(u.costUsd) + " · tokens： " + u.inputTokens + " in / " + u.outputTokens + " out");
      note(makeStatusBar());
      continue;
    }
    if (input === "/mode") {
      config.speedMode = !config.speedMode;
      saveGlobalConfig(config);
      info(config.speedMode ? "▶ 已切换为竞速模式：命令自动执行" : "⏸ 已切换为默认确认模式：命令需确认");
      note(makeStatusBar());
      continue;
    }
    if (input === "/clear") {
      session = createSession();
      agent = new Agent({ provider, session, budgetUsd: config.budgetUsd, permissions });
      showPet("happy");
      note("已开启新会话");
      note(makeStatusBar());
      continue;
    }
    if (input === "/compact") {
      try {
        const summary = await agent.compact();
        note("已压缩对话历史：摘要 " + summary.length + " 字");
        note(makeStatusBar());
      } catch (err) {
        error("压缩失败：" + (err instanceof Error ? err.message : err));
      }
      continue;
    }
    if (input === "/help") {
      console.log("\n" + buildShortcutsPanel(config.language ?? "zh").join("\n") + "\n");
      continue;
    }
    if (input.startsWith("/img ")) {
      const parsed = parseInputImages(input.slice(5));
      if (parsed.images.length === 0) {
        warn("用法：/img <图片路径> [问题]");
        continue;
      }
      try {
        await streamAnswer(parsed.text || "请描述这张图片", parsed.images);
        note(makeStatusBar());
        } catch (err) {
        error(err instanceof Error ? err.message : String(err));
      }
      continue;
    }
    const parsed = parseInputImages(input);
    if (!parsed.text && parsed.images.length === 0) continue;
    try {
      await streamAnswer(parsed.text || "请描述这张图片", parsed.images);
      note(makeStatusBar());
    } catch (err) {
      error(err instanceof Error ? err.message : String(err));
    }
  }

  if (backupTimer) clearInterval(backupTimer);
}
