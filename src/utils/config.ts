// 配置系统：全局配置（~/.clover/config.json）+ 项目状态（.clover/）
// 支持 .env 注入 API Key（CLOVER_OPENAI_KEY 等），向导生成 + 手动编辑双通道。

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import type { CloverConfig, ProviderId } from "../types.js";

dotenv.config();

export const GLOBAL_DIR = path.join(os.homedir(), ".clover");
export const GLOBAL_CONFIG_PATH = path.join(GLOBAL_DIR, "config.json");
export const PROJECT_DIR_NAME = ".clover";
export const PROJECT_CONFIG_PATH = path.join(PROJECT_DIR_NAME, "clover.json");
export const ARCHIVE_PATH = path.join(GLOBAL_DIR, "archive.json");

const providerSchema = z.object({
  id: z.enum(["openai", "anthropic", "gemini", "deepseek", "moonshot", "zhipu", "qwen", "siliconflow", "ollama", "custom"]),
  model: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  enabled: z.boolean(),
});

const configSchema = z.object({
  language: z.enum(["zh", "en"]),
  defaultProvider: z.enum(["openai", "anthropic", "gemini", "deepseek", "moonshot", "zhipu", "qwen", "siliconflow", "ollama", "custom"]),
  providers: z.record(z.string(), providerSchema).optional(),
  budgetUsd: z.number().min(0),
  speedMode: z.boolean(),
  backupIntervalMinutes: z.number().min(1),
  autoBackup: z.boolean(),
  trustedFolders: z.array(z.string()).optional(),
});

export const DEFAULT_CONFIG: CloverConfig = {
  language: "zh",
  defaultProvider: "deepseek",
  providers: {
    openai: { id: "openai", model: "gpt-4o-mini", apiKey: undefined, enabled: false },
    anthropic: { id: "anthropic", model: "claude-sonnet-4-5", apiKey: undefined, enabled: false },
    gemini: { id: "gemini", model: "gemini-2.5-flash", apiKey: undefined, enabled: false },
    deepseek: { id: "deepseek", model: "deepseek-chat", apiKey: undefined, baseUrl: "https://api.deepseek.com/v1", enabled: true },
    moonshot: { id: "moonshot", model: "moonshot-v1-8k", apiKey: undefined, baseUrl: "https://api.moonshot.cn/v1", enabled: false },
    zhipu: { id: "zhipu", model: "glm-4-flash", apiKey: undefined, baseUrl: "https://open.bigmodel.cn/api/paas/v4", enabled: false },
    qwen: { id: "qwen", model: "qwen-plus", apiKey: undefined, baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", enabled: false },
    siliconflow: { id: "siliconflow", model: "Qwen/Qwen2.5-7B-Instruct", apiKey: undefined, baseUrl: "https://api.siliconflow.cn/v1", enabled: false },
    ollama: { id: "ollama", model: "qwen2.5:7b", baseUrl: "http://localhost:11434", enabled: false },
    custom: { id: "custom", model: "gpt-4o-mini", apiKey: undefined, baseUrl: undefined, enabled: false },
  },
  budgetUsd: 10,
  speedMode: false,
  backupIntervalMinutes: 30,
  autoBackup: true,
  trustedFolders: [],
};

/** 读取 JSON，兼容 UTF-8 BOM；文件不存在返回 null */
export function readJsonFile<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

/** 从环境变量补全 API Key：CLOVER_<PROVIDER>_KEY */
function applyEnvKeys(config: CloverConfig): CloverConfig {
  for (const id of Object.keys(config.providers) as ProviderId[]) {
    const envKey = "CLOVER_" + id.toUpperCase() + "_KEY";
    const value = process.env[envKey];
    const provider = config.providers[id];
    if (provider && value && !provider.apiKey) {
      provider.apiKey = value;
    }
  }
  return config;
}

export function loadGlobalConfig(): CloverConfig {
  const raw = readJsonFile<CloverConfig>(GLOBAL_CONFIG_PATH);
  if (!raw) return DEFAULT_CONFIG;
  const parsed = configSchema.safeParse(raw);
  return applyEnvKeys(parsed.success ? (parsed.data as CloverConfig) : DEFAULT_CONFIG);
}

export function saveGlobalConfig(config: CloverConfig): void {
  writeJsonFile(GLOBAL_CONFIG_PATH, config);
}

/** 判断当前目录是否已初始化比赛项目 */
export function isProject(): boolean {
  return fs.existsSync(PROJECT_CONFIG_PATH);
}

export function requireProject(): CloverConfig {
  if (!isProject()) {
    throw new Error("当前目录不是 Clover 比赛项目，请先运行 clover init");
  }
  return loadGlobalConfig();
}

// ---------- 工作区信任 ----------

/** 规范化目录路径用于信任比对（Windows 忽略大小写，去掉结尾分隔符） */
export function normalizeFolder(folder: string): string {
  const resolved = path.resolve(folder);
  const trimmed = resolved.replace(/[\\/]+$/, "");
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

/** 目录是否已被用户信任（避免每次进入都弹确认） */
export function isTrustedFolder(folder: string): boolean {
  const config = loadGlobalConfig();
  const target = normalizeFolder(folder);
  return (config.trustedFolders ?? []).some((f) => normalizeFolder(f) === target);
}

/** 记住信任的目录（幂等，重复信任不会产生重复项） */
export function trustFolder(folder: string): void {
  const loaded = loadGlobalConfig();
  const target = normalizeFolder(folder);
  const list = (loaded.trustedFolders ?? []).filter((f) => normalizeFolder(f) !== target);
  list.push(target);
  saveGlobalConfig({ ...loaded, trustedFolders: list });
}
