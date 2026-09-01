// 极简终端日志（无第三方依赖）

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
} as const;

function color(text: string, code: string): string {
  if (process.env.NO_COLOR) return text;
  return code + text + COLORS.reset;
}

export function info(text: string): void {
  console.log(color(text, COLORS.green));
}

export function note(text: string): void {
  console.log(color(text, COLORS.dim));
}

export function warn(text: string): void {
  console.log(color("⚠ " + text, COLORS.yellow));
}

export function error(text: string): void {
  console.error(color("✖ " + text, COLORS.red));
}

export function ask(text: string): void {
  console.log(color("? " + text, COLORS.cyan));
}

export function banner(text: string): void {
  console.log(color("🍀 " + text, COLORS.cyan));
}
