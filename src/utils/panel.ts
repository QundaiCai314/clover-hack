// 终端面板绘制：Claude Code 风格启动欢迎屏（双栏边框 + 状态栏）
import type { PetArt } from "./pet.js";

/** 字符在终端中的显示列宽（CJK / 全角 / Emoji 计 2 列） */
export function cellWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (
    (code >= 0x1100 && code <= 0x115f) || // 谚文
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首 / 符号 / 标点
    (code >= 0x3040 && code <= 0xa4cf) || // 假名 / 汉字 / 谚文
    (code >= 0xac00 && code <= 0xd7a3) || // 谚文音节
    (code >= 0xf900 && code <= 0xfaff) || // 兼容汉字
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 兼容形式
    (code >= 0xff00 && code <= 0xff60) || // 全角形式
    (code >= 0xffe0 && code <= 0xffe6) || // 全角符号
    (code >= 0x2600 && code <= 0x27bf) || // 杂项符号 / 装饰符号
    (code >= 0x1f300 && code <= 0x1faff) || // Emoji
    code === 0xfe0f // 变体选择符（Emoji 修饰）
  ) {
    return 2;
  }
  return 1;
}

/** 字符串的终端显示宽度 */
export function stringWidth(s: string): number {
  let width = 0;
  for (const ch of Array.from(s)) width += cellWidth(ch);
  return width;
}

/** 超长文本中间省略（按显示宽度） */
export function truncateMiddle(s: string, maxWidth: number): string {
  if (stringWidth(s) <= maxWidth) return s;
  if (maxWidth <= 3) return ".".repeat(maxWidth);
  const budget = maxWidth - 1;
  const chars = Array.from(s);
  let head = "";
  let headW = 0;
  let tail = "";
  let tailW = 0;
  let i = 0;
  let j = chars.length - 1;
  while (i <= j) {
    const hw = cellWidth(chars[i]);
    if (headW + tailW + hw <= budget) {
      head += chars[i];
      headW += hw;
      i++;
    } else {
      break;
    }
    if (i > j) break;
    const tw = cellWidth(chars[j]);
    if (headW + tailW + tw <= budget) {
      tail = chars[j] + tail;
      tailW += tw;
      j--;
    } else {
      break;
    }
  }
  return head + "…" + tail;
}

/** 左对齐填充到指定显示宽度（超宽则中间截断并补齐） */
export function padTo(s: string, width: number): string {
  const w = stringWidth(s);
  if (w >= width) {
    const t = truncateMiddle(s, width);
    return t + " ".repeat(width - stringWidth(t));
  }
  return s + " ".repeat(width - w);
}

/** 居中对齐填充到指定显示宽度（超宽则中间截断并补齐） */
export function padCenter(s: string, width: number): string {
  const w = stringWidth(s);
  if (w >= width) {
    const t = truncateMiddle(s, width);
    return t + " ".repeat(width - stringWidth(t));
  }
  const left = Math.floor((width - w) / 2);
  return " ".repeat(left) + s + " ".repeat(width - w - left);
}

export interface WelcomeInfo {
  version: string;
  /** 例：deepseek / deepseek-chat */
  providerLabel: string;
  /** 例：$10.00 */
  budgetLabel: string;
  speedMode: boolean;
  /** 工作区目录 */
  folder: string;
  /** 会话状态文案：新会话 / 上次会话（N 条消息） */
  sessionLabel: string;
  sessionIdShort: string;
  pet: PetArt;
  language: "zh" | "en";
}

const PANEL_WIDTH = 76;
const LEFT_WIDTH = 32;
const RIGHT_WIDTH = PANEL_WIDTH - LEFT_WIDTH - 3; // 41

/** 构建欢迎屏面板（每一行宽度固定为 PANEL_WIDTH） */
export function buildWelcomePanel(info: WelcomeInfo): string[] {
  const zh = info.language === "zh";
  const welcomeTitle = zh ? "欢迎回来！" : "Welcome back!";
  const tipsTitle = zh ? "新手提示" : "Tips for getting started";
  const tips = zh
    ? ["▪ 直接输入问题即可开跑", "▪ /help 查看全部命令", "▪ /img <图片> 发送图片", "▪ /compact 压缩长对话"]
    : ["▪ Just type to get started", "▪ /help for all commands", "▪ /img <image> to send", "▪ /compact to compress"];
  const newsTitle = zh ? "更新内容" : "What''s new";
  const news = zh
    ? ["▪ v0.1.5 启动欢迎屏", "▪ v0.1.4 工作区信任确认", "▪ v0.1.3 流式输出 / 工具卡片"]
    : ["▪ v0.1.5 welcome screen", "▪ v0.1.4 workspace trust", "▪ v0.1.3 streaming output"];
  const modeLabel = zh ? (info.speedMode ? "竞速" : "默认确认") : info.speedMode ? "Speed" : "Manual";

  const left = [
    "",
    padCenter(welcomeTitle, LEFT_WIDTH),
    padCenter(info.sessionLabel, LEFT_WIDTH),
    "",
    ...info.pet.lines.map((line) => padCenter(line, LEFT_WIDTH)),
    padCenter(info.pet.caption, LEFT_WIDTH),
    "",
    padCenter(info.providerLabel, LEFT_WIDTH),
    padCenter((zh ? "预算 " : "Budget ") + info.budgetLabel + " · " + modeLabel, LEFT_WIDTH),
    padCenter(info.folder, LEFT_WIDTH),
  ];
  const right = [
    tipsTitle,
    ...tips,
    "",
    "─".repeat(RIGHT_WIDTH),
    newsTitle,
    ...news,
  ];

  const rows = Math.max(left.length, right.length);
  const titleWidth = stringWidth("🍀 Clover v" + info.version);
  const titleFill = "─".repeat(Math.max(0, LEFT_WIDTH - 5 - titleWidth));
  const lines: string[] = ["╭─── 🍀 Clover v" + info.version + " " + titleFill + "┬" + "─".repeat(RIGHT_WIDTH) + "╮"];
  for (let i = 0; i < rows; i++) {
    const l = padTo(left[i] ?? "", LEFT_WIDTH);
    const r = padTo(right[i] ?? "", RIGHT_WIDTH);
    lines.push("│" + l + "│" + r + "│");
  }
  lines.push("╰" + "─".repeat(LEFT_WIDTH) + "┴" + "─".repeat(RIGHT_WIDTH) + "╯");
  return lines;
}

/** 状态栏：模式 · 预算 · 模型 · 会话 · 目录 · 帮助 */
export function buildStatusBar(info: WelcomeInfo): string {
  const zh = info.language === "zh";
  const mode = info.speedMode ? (zh ? "▶ 竞速模式" : "▶ Speed mode") : zh ? "⏸ 默认确认" : "⏸ Manual mode";
  return [
    mode,
    (zh ? "预算 " : "Budget ") + info.budgetLabel,
    (zh ? "模型 " : "Model ") + info.providerLabel,
    (zh ? "会话 " : "Session ") + info.sessionIdShort,
    (zh ? "目录 " : "Dir ") + truncateMiddle(info.folder, 26),
    zh ? "/help 帮助" : "/help for help",
  ].join(" · ");
}
