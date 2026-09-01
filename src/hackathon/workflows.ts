// 黑客松领域工作流：赛题解析 / 点子 / 评估 / MVP / Pitch / 检查 / 复盘
// M1 提供 prompt 构建与规则型检查；LLM 执行在 M2/M3 接入。

import fs from "node:fs";
import path from "node:path";
import type { HackathonMeta, SessionRecord } from "../types.js";

// ---------- 赛题解析 ----------

export function buildAnalyzePrompt(raw: string): string {
  return [
    "你是黑客松赛题分析师。请把以下赛题材料结构化整理，输出 Markdown：",
    "",
    "## 主题",
    "## 硬性要求（必须满足）",
    "## 评分标准（评委怎么打分）",
    "## 加分项",
    "## 限制与注意（技术栈限制、素材限制、提交格式）",
    "## 关键时间节点",
    "",
    "赛题材料：",
    raw.slice(0, 30_000),
  ].join("\n");
}

// ---------- 点子生成与评估 ----------

export function buildIdeatePrompt(summary: string, skills: string): string {
  return [
    "你是黑客松创意顾问。基于赛题，给出 5 个候选项目点子。",
    "要求：",
    "- 每个点子 1-2 句话说明核心，标注创新点",
    "- 考虑参赛者技能：" + skills,
    "- 优先选择 48 小时~一周内能做出 Demo 的规模",
    "- 避免过于常见或纯套壳的点子",
    "",
    "赛题摘要：",
    summary,
  ].join("\n");
}

export function buildEvaluatePrompt(idea: string): string {
  return [
    "你是创业与市场分析师。请对以下黑客松项目点子做评估，输出 Markdown：",
    "",
    "## 一句话总结",
    "## 合理性分析（技术可行性 / 需求真实性 / 团队匹配度，各 1-2 句）",
    "## 市场分析（目标用户、市场规模、竞品情况）",
    "## 蓝海还是红海（判断依据）",
    "## 差异化机会",
    "## 风险与翻车点",
    "## 综合评分（0-10）与建议",
    "",
    "点子：",
    idea,
  ].join("\n");
}

// ---------- MVP 规划 ----------

export function buildMvpPrompt(summary: string, idea: string, durationHours: number): string {
  return [
    "你是黑客松项目规划师。把以下点子拆成可在 " + durationHours + " 小时内完成并提交的 MVP 计划，输出 Markdown：",
    "",
    "## MVP 目标（一句）",
    "## 核心功能（P0 / P1 / P2 分级，P0 必须有 Demo）",
    "## 里程碑（按时间切分，标注每个阶段做什么）",
    "## 演示策略（Demo 里要演示什么）",
    "## 放弃清单（明确不做什么）",
    "",
    "赛题摘要：" + summary,
    "",
    "点子：" + idea,
  ].join("\n");
}

// ---------- Pitch 辅助 ----------

export function buildPitchPrompt(projectName: string, info: string): string {
  return [
    "你是黑客松路演教练。基于以下项目信息，生成 3 分钟 Pitch 稿，输出 Markdown：",
    "",
    "## 开场钩子（15 秒，抓评委注意力）",
    "## 问题与痛点（30 秒）",
    "## 解决方案与 Demo 亮点（90 秒，突出演示顺序）",
    "## 市场与独特价值（30 秒）",
    "## 收尾 Call to Action（15 秒）",
    "## 评委可能问的 5 个问题与建议回答",
    "",
    "项目名：" + projectName,
    "",
    "项目信息：" + info.slice(0, 10_000),
  ].join("\n");
}

// ---------- 提交检查（规则型，M1 可用） ----------

export interface CheckItem {
  name: string;
  detail: string;
  pass: boolean;
}

export async function runSubmissionChecks(meta: HackathonMeta | null): Promise<CheckItem[]> {
  const cwd = process.cwd();
  const has = (p: string) => fs.existsSync(path.join(cwd, p));
  const items: CheckItem[] = [
    {
      name: "README.md 存在",
      pass: has("README.md"),
      detail: has("README.md") ? "已存在" : "缺少 README.md",
    },
    {
      name: "Git 仓库已初始化",
      pass: has(".git"),
      detail: has(".git") ? "已初始化" : "未初始化 git",
    },
    {
      name: "代码可构建（package.json / pyproject.toml / Cargo.toml / go.mod）",
      pass: has("package.json") || has("pyproject.toml") || has("Cargo.toml") || has("go.mod"),
      detail: "未检测到常见构建配置",
    },
    {
      name: "比赛档案已填写（名称/链接/截止时间）",
      pass: meta !== null && Boolean(meta.name && meta.url && meta.endAt),
      detail: meta === null ? "未初始化比赛档案" : "档案字段不完整（name/url/endAt）",
    },
    {
      name: "演示文件存在（demo.mp4 / demo.gif / demo.webm）",
      pass: has("demo.mp4") || has("demo.gif") || has("demo.webm"),
      detail: "未找到 demo 视频文件",
    },
  ];
  return items;
}

// ---------- 赛后复盘 ----------

export function buildRetrospectivePrompt(meta: HackathonMeta | null, session: SessionRecord | null): string {
  return [
    "你是黑客松复盘教练。基于比赛档案与会话记录，生成复盘报告，输出 Markdown：",
    "",
    "## 结果回顾（做了什么、完成度）",
    "## 时间花销分析（哪些环节超时）",
    "## 翻车点（技术/规划/演示/提交）",
    "## 亮点（做对了什么）",
    "## 下次改进（3-5 条具体建议）",
    "",
    "比赛：" + JSON.stringify(meta ?? {}),
    "",
    "会话摘要：" + JSON.stringify((session?.messages ?? []).slice(-20).map((m) => m.role + ": " + m.content.slice(0, 200))),
  ].join("\n");
}
