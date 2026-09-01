// 统一输入：单个 readline 接口 + 行队列 + 等待者模式
// 兼容交互式终端与管道快速输入；全局只建一个 readline，避免多模块抢 stdin 互相吞行。

import readline from "node:readline";

let sharedRl: readline.Interface | null = null;
const lineQueue: string[] = [];
const lineWaiters: Array<(line: string) => void> = [];

function initRl(): void {
  if (sharedRl) return;
  // 信任确认等原始模式场景会暂停 stdin，这里确保行模式输入可用
  if (process.stdin.isTTY && process.stdin.isPaused()) process.stdin.resume();
  sharedRl = readline.createInterface({ input: process.stdin, output: process.stdout });
  sharedRl.on("line", (line) => {
    const waiter = lineWaiters.shift();
    if (waiter) waiter(line);
    else lineQueue.push(line);
  });
}

/** 读取一行输入；空输入时返回 fallback */
export function askInput(question: string, fallback = ""): Promise<string> {
  initRl();
  process.stdout.write(question + (fallback ? " (默认 " + fallback + ") " : " "));
  return new Promise((resolve) => {
    const deliver = (line: string) => resolve(line.trim() || fallback);
    const queued = lineQueue.shift();
    if (queued !== undefined) deliver(queued);
    else lineWaiters.push(deliver);
  });
}

/** 读取 y/n 确认，默认拒绝 */
export async function askYesNo(question: string): Promise<boolean> {
  const answer = (await askInput(question + " (y/n) ", "n")).trim().toLowerCase();
  return answer === "y" || answer === "yes";
}

// ---------- 工作区信任确认（Claude Code 同款） ----------

/** 字符在终端中的列宽（CJK 计 2 列） */
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (
    (code >= 0x1100 && code <= 0x115f) || // 谚文
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首 / 符号 / 标点
    (code >= 0x3040 && code <= 0xa4cf) || // 假名 / 汉字 / 谚文
    (code >= 0xac00 && code <= 0xd7a3) || // 谚文音节
    (code >= 0xf900 && code <= 0xfaff) || // 兼容汉字
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK 兼容形式
    (code >= 0xff00 && code <= 0xff60) || // 全角形式
    (code >= 0xffe0 && code <= 0xffe6)
  ) {
    return 2;
  }
  return 1;
}

/** 按终端列宽硬换行，避免窄屏下布局错乱 */
function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  let width = 0;
  for (const ch of text) {
    const w = charWidth(ch);
    if (width + w > maxWidth && line) {
      lines.push(line);
      line = "";
      width = 0;
    }
    line += ch;
    width += w;
  }
  if (line) lines.push(line);
  return lines;
}

function trustOptionLines(language: "zh" | "en", selected: number): [string, string] {
  const yesText = language === "zh" ? "是的，我信任这个文件夹" : "Yes, I trust this folder";
  const noText = language === "zh" ? "否，退出" : "No, exit";
  return [
    (selected === 0 ? "> 1. " : "  1. ") + yesText,
    (selected === 1 ? "> 2. " : "  2. ") + noText,
  ];
}

/** 信任确认界面的完整文案行（布局固定：末尾四行为 选项1 / 选项2 / 空行 / 提示） */
export function buildTrustLines(folder: string, language: "zh" | "en"): string[] {
  const width = language === "zh" ? 60 : 78;
  const header = (language === "zh" ? "正在访问工作区：" : "Accessing workspace: ") + folder;
  const safety =
    language === "zh"
      ? "快速安全检查：这是你自己创建或信任的项目吗？（比如你自己的代码、知名开源项目、或团队的工作）如果不是，请先花点时间检查这个文件夹里的内容。"
      : "Quick safety check: Is this a project you created or one you trust? (Like your own code, a well-known open source project, or work from your team) If not, take a moment to review what''s in this folder first.";
  const ability =
    language === "zh"
      ? "Clover 将能够读取、编辑并执行这里的文件。"
      : "Clover will be able to read, edit, and execute files here.";
  const [yesLine, noLine] = trustOptionLines(language, 0);
  return [
    ...wrapText(header, width),
    "",
    ...wrapText(safety, width),
    ...wrapText(ability, width),
    "",
    language === "zh" ? "安全指南" : "Security guide",
    yesLine,
    noLine,
    "",
    language === "zh" ? "回车确认 · Esc 取消" : "Enter to confirm · Esc to cancel",
  ];
}

export type TrustAction = "select-yes" | "select-no" | "confirm" | "cancel" | "none";

/** 解析完整按键序列为信任界面动作（纯函数，便于测试） */
export function decodeTrustKey(buf: string): TrustAction {
  if (buf === "\u001b" || buf === "\u0003") return "cancel";
  if (buf === "\r" || buf === "\n") return "confirm";
  if (buf === "\u001b[A" || buf === "1") return "select-yes";
  if (buf === "\u001b[B" || buf === "2") return "select-no";
  return "none";
}

/** Claude Code 同款工作区信任确认：回车确认选项 1，↑/↓ 或 1/2 切换，Esc 取消退出 */
export function confirmWorkspaceTrust(folder: string, language: "zh" | "en" = "zh"): Promise<boolean> {
  return new Promise((resolve) => {
    // 非交互环境（管道 / CI）跳过确认，直接放行
    if (!process.stdin.isTTY) {
      resolve(true);
      return;
    }

    const lines = buildTrustLines(folder, language);
    let selected = 0;
    let buf = "";
    let escTimer: NodeJS.Timeout | null = null;
    let finished = false;

    const finish = (ok: boolean): void => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(ok);
    };

    const cleanup = (): void => {
      if (escTimer) clearTimeout(escTimer);
      process.stdin.removeListener("data", onData);
      process.removeListener("SIGINT", onSigint);
      try {
        process.stdin.setRawMode(false);
      } catch {
        // 非 TTY 时忽略
      }
      process.stdin.pause();
      process.stdout.write("\n");
    };

    const renderOptions = (): void => {
      const [yesLine, noLine] = trustOptionLines(language, selected);
      process.stdout.write("\u001b[3A");
      process.stdout.write("\r\u001b[2K" + yesLine + "\n");
      process.stdout.write("\r\u001b[2K" + noLine + "\n");
      process.stdout.write("\n");
    };

    const onSigint = (): void => finish(false);

    const onData = (chunk: Buffer): void => {
      buf += chunk.toString("utf8");
      if (escTimer) {
        clearTimeout(escTimer);
        escTimer = null;
      }
      while (buf.length > 0) {
        if (buf === "\u001b") {
          // 可能是方向键序列的开头，也可能是单独的 Esc：留 100ms 窗口
          escTimer = setTimeout(() => {
            escTimer = null;
            buf = "";
            finish(false);
          }, 100);
          return;
        }
        if (buf.startsWith("\u001b")) {
          if (buf.length < 3) {
            escTimer = setTimeout(() => {
              escTimer = null;
              buf = "";
              finish(false);
            }, 100);
            return;
          }
          const seq = buf.slice(0, 3);
          buf = buf.slice(3);
          const action = decodeTrustKey(seq);
          if (action === "select-yes" || action === "select-no") {
            selected = action === "select-yes" ? 0 : 1;
            renderOptions();
          } else if (action === "cancel") {
            finish(false);
            return;
          }
          continue;
        }
        const key = buf[0];
        buf = buf.slice(1);
        const action = decodeTrustKey(key);
        if (action === "select-yes" || action === "select-no") {
          selected = action === "select-yes" ? 0 : 1;
          renderOptions();
        } else if (action === "confirm") {
          finish(selected === 0);
          return;
        } else if (action === "cancel") {
          finish(false);
          return;
        }
      }
    };

    process.stdout.write("\n" + lines.join("\n"));
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
    process.once("SIGINT", onSigint);
  });
}
