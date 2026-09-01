// 工具注册表：Clover 的通用 Agent 能力（读写文件、执行命令）
// M2：工具带参数 Schema，供各家 function calling 协议转换；运行基于 process.cwd()。

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolDefinition, ToolResult } from "../types.js";

const execFileAsync = promisify(execFile);

function resolvePath(file: string): string {
  return path.resolve(process.cwd(), file);
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "read_file",
    description: "读取文件内容 (read file content)",
    parameters: [
      { name: "path", type: "string", description: "文件路径，相对于项目根目录", required: true },
    ],
    async run(args) {
      const file = args.path ?? "";
      if (!file) return { ok: false, output: "缺少 path 参数" };
      const target = resolvePath(file);
      if (!fs.existsSync(target)) return { ok: false, output: "文件不存在: " + file };
      const stat = fs.statSync(target);
      if (stat.size > 200_000) return { ok: false, output: "文件过大（>200KB），请分段查看: " + file };
      return { ok: true, output: fs.readFileSync(target, "utf8") };
    },
  },
  {
    name: "write_file",
    description: "写入文件内容，覆盖已存在的文件 (write file content)",
    parameters: [
      { name: "path", type: "string", description: "文件路径，相对于项目根目录", required: true },
      { name: "content", type: "string", description: "要写入的完整内容", required: true },
    ],
    async run(args) {
      const file = args.path ?? "";
      const content = args.content ?? "";
      if (!file) return { ok: false, output: "缺少 path 参数" };
      const target = resolvePath(file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
      return { ok: true, output: "已写入 " + file + "（" + Buffer.byteLength(content, "utf8") + " 字节）" };
    },
  },
  {
    name: "list_dir",
    description: "列出目录内容 (list directory)",
    parameters: [
      { name: "path", type: "string", description: "目录路径，默认为项目根目录" },
    ],
    async run(args) {
      const dir = args.path ?? ".";
      const target = resolvePath(dir);
      if (!fs.existsSync(target)) return { ok: false, output: "目录不存在: " + dir };
      const entries = fs.readdirSync(target, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
      return { ok: true, output: lines.join("\n") };
    },
  },
  {
    name: "run_command",
    description: "执行终端命令，执行前会请求用户批准 (run a shell command)",
    parameters: [
      { name: "command", type: "string", description: "要执行的完整命令", required: true },
    ],
    async run(args) {
      const command = args.command ?? "";
      if (!command) return { ok: false, output: "缺少 command 参数" };
      try {
        const { stdout, stderr } = await execFileAsync(command, [], {
          cwd: process.cwd(),
          shell: true,
          timeout: 60_000,
          maxBuffer: 5_000_000,
        });
        return { ok: true, output: (stdout + stderr).slice(0, 50_000) };
      } catch (err) {
        const e = err as Error & { stdout?: string; stderr?: string };
        return { ok: false, output: String(e.stdout ?? "") + String(e.stderr ?? "") + " " + e.message };
      }
    },
  },
  {
    name: "web_search",
    description: "联网搜索网页，返回标题/链接/摘要 (web search)",
    parameters: [
      { name: "query", type: "string", description: "搜索关键词", required: true },
      { name: "max_results", type: "number", description: "返回条数，默认 5，最多 10" },
    ],
    async run(args) {
      const query = args.query ?? "";
      if (!query) return { ok: false, output: "缺少 query 参数" };
      const max = Math.min(Number(args.max_results ?? 5) || 5, 10);
      return { ok: true, output: await searchWeb(query, max) };
    },
  },
];

export function findTool(name: string): ToolDefinition | undefined {
  return TOOLS.find((t) => t.name === name);
}

/** 把工具的 parameters 转成 JSON Schema，供各家 API 使用 */
export function toJsonSchema(tool: ToolDefinition): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of tool.parameters) {
    properties[p.name] = { type: p.type, description: p.description };
    if (p.required) required.push(p.name);
  }
  return { type: "object", properties, required };
}

// ---------- 联网搜索（DuckDuckGo 优先，Bing 兜底；均无需 API Key） ----------

const DDG_HTML = "https://html.duckduckgo.com/html/?q=";
const BING_HTML = "https://www.bing.com/search?q=";

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&ensp;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#39;/g, "'");
}

function stripTags(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanUrl(href: string): string {
  const match = href.match(/uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1] ?? "");
    } catch {
      // 解码失败则用原始链接
    }
  }
  return href.replace(/^\/\//, "https://");
}

async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Clover/0.1; hackathon-agent)" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseDuckDuckGo(html: string, maxResults: number): string | null {
  const blocks = html.split('<div class="result results_links');
  const lines: string[] = [];
  for (let i = 1; i < blocks.length && lines.length < maxResults; i++) {
    const block = blocks[i];
    const title = block.match(new RegExp('class="result__a"[^>]*>(.*?)</a>', "s"))?.[1];
    const snippet = block.match(new RegExp('class="result__snippet"[^>]*>(.*?)</a>', "s"))?.[1];
    const href = block.match(new RegExp('class="result__a" href="([^"]+)"'))?.[1];
    if (!title && !href) continue;
    const cleanTitle = title ? stripTags(title) : "（无标题）";
    const cleanSnippet = snippet ? stripTags(snippet) : "";
    const url = href ? cleanUrl(href) : "";
    lines.push(cleanTitle + (url ? "\n  " + url : "") + (cleanSnippet ? "\n  " + cleanSnippet : ""));
  }
  return lines.length > 0 ? lines.join("\n\n") : null;
}

function parseBing(html: string, maxResults: number): string | null {
  const blocks = html.split('<li class="b_algo"');
  const lines: string[] = [];
  for (let i = 1; i < blocks.length && lines.length < maxResults; i++) {
    const block = blocks[i];
    const href = block.match(/<h2[^>]*><a[^>]*href="([^"]+)"/)?.[1];
    const title = block.match(/<h2[^>]*><a[^>]*>(.*?)<\/a><\/h2>/s)?.[1];
    const snippet = block.match(/<p[^>]*>(.*?)<\/p>/s)?.[1];
    if (!title && !href) continue;
    const cleanTitle = title ? stripTags(title) : "（无标题）";
    const cleanSnippet = snippet ? stripTags(snippet) : "";
    lines.push(cleanTitle + (href ? "\n  " + href : "") + (cleanSnippet ? "\n  " + cleanSnippet : ""));
  }
  return lines.length > 0 ? lines.join("\n\n") : null;
}

/** 联网搜索，返回最多 maxResults 条：标题 / 链接 / 摘要 */
export async function searchWeb(query: string, maxResults = 5): Promise<string> {
  const ddgHtml = await fetchHtml(DDG_HTML + encodeURIComponent(query), 8000);
  if (ddgHtml) {
    const ddg = parseDuckDuckGo(ddgHtml, maxResults);
    if (ddg) return ddg;
  }
  const bingHtml = await fetchHtml(BING_HTML + encodeURIComponent(query), 15_000);
  if (!bingHtml) return "搜索失败：无法访问搜索服务";
  const bing = parseBing(bingHtml, maxResults);
  return bing ?? "没有搜到结果：" + query;
}
