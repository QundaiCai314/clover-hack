// 命令权限：默认需确认；竞速模式自动放行；已批准前缀不再询问
// 批准规则持久化在项目 .clover/allowed-commands.json

import fs from "node:fs";
import path from "node:path";
import type { CloverConfig } from "../types.js";
import { askYesNo } from "../utils/input.js";

const ALLOWED_FILE = path.join(".clover", "allowed-commands.json");

function loadAllowed(): string[] {
  if (!fs.existsSync(ALLOWED_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(ALLOWED_FILE, "utf8")) as string[];
  } catch {
    return [];
  }
}

function saveAllowed(prefixes: string[]): void {
  fs.mkdirSync(path.dirname(ALLOWED_FILE), { recursive: true });
  fs.writeFileSync(ALLOWED_FILE, JSON.stringify(prefixes, null, 2), "utf8");
}

export class PermissionManager {
  private allowed = loadAllowed();

  constructor(private readonly config: CloverConfig) {}

  /** 检查命令是否可执行：竞速模式 + 已批准前缀 → 自动放行；否则询问用户 */
  async approve(command: string): Promise<boolean> {
    if (this.config.speedMode) return true;
    const head = command.trim().split(/\s+/)[0] ?? "";
    if (this.allowed.includes(head)) return true;
    const ok = await askYesNo("允许执行命令？ " + command.slice(0, 120));
    if (ok && head) {
      this.allowed.push(head);
      saveAllowed(this.allowed);
    }
    return ok;
  }

  listAllowed(): string[] {
    return [...this.allowed];
  }
}
