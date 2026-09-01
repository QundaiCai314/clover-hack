// 统一输入：单个 readline 接口 + 行队列 + 等待者模式
// 兼容交互式终端与管道快速输入；全局只建一个 readline，避免多模块抢 stdin 互相吞行。

import readline from "node:readline";

let sharedRl: readline.Interface | null = null;
const lineQueue: string[] = [];
const lineWaiters: Array<(line: string) => void> = [];

function initRl(): void {
  if (sharedRl) return;
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
