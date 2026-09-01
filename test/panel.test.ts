import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWelcomePanel, buildStatusBar, buildShortcutsPanel, cellWidth, stringWidth, truncateMiddle, padCenter } from "../src/utils/panel.ts";
import { findPet } from "../src/utils/pet.ts";

const info = {
  version: "0.1.5",
  providerLabel: "deepseek / deepseek-chat",
  budgetLabel: "$10.00",
  speedMode: false,
  folder: "C:\\Users\\34515",
  sessionLabel: "新会话，等你发令",
  sessionIdShort: "abc12345",
  pet: findPet("happy")!,
  language: "zh" as const,
};

test("cellWidth：CJK 与 Emoji 计 2 列", () => {
  assert.equal(cellWidth("a"), 1);
  assert.equal(cellWidth("中"), 2);
  assert.equal(cellWidth("🍀"), 2);
  assert.equal(stringWidth("a中🍀"), 5);
});

test("欢迎屏：所有行等宽 76 且边框闭合", () => {
  const lines = buildWelcomePanel(info);
  for (const line of lines) {
    assert.equal(stringWidth(line), 76);
  }
  assert.ok(lines[0].startsWith("╭"));
  assert.ok(lines[0].includes("┬"));
  assert.ok(lines[0].endsWith("╮"));
  assert.ok(lines[lines.length - 1].startsWith("╰"));
  assert.ok(lines[lines.length - 1].endsWith("╯"));
  for (const row of lines.slice(1, -1)) {
    assert.ok(row.startsWith("│"));
    assert.ok(row.endsWith("│"));
  }
});

test("欢迎屏：超长目录/会话文案不破框", () => {
  const long = "C:\\very\\long\\path\\" + "x".repeat(80);
  const lines = buildWelcomePanel({ ...info, folder: long, sessionLabel: "上次会话 abc12345（123 条消息，内容非常非常非常长）" });
  for (const line of lines) assert.equal(stringWidth(line), 76);
});

test("欢迎屏：右栏包含新手提示与更新内容", () => {
  const lines = buildWelcomePanel(info).join("\n");
  assert.ok(lines.includes("新手提示"));
  assert.ok(lines.includes("/compact 压缩长对话"));
  assert.ok(lines.includes("更新内容"));
  assert.ok(lines.includes("v0.1.5 启动欢迎屏"));
});

test("快捷键面板：等宽闭合、包含 /mode 与 ?", () => {
  const lines = buildShortcutsPanel("zh");
  const width = stringWidth(lines[0]);
  for (const line of lines) assert.equal(stringWidth(line), width);
  assert.ok(lines[0].startsWith("╭"));
  assert.ok(lines[lines.length - 1].startsWith("╰"));
  const joined = lines.join("\n");
  assert.ok(joined.includes("?"), "包含 ? 帮助");
  assert.ok(joined.includes("/mode"));
  assert.ok(joined.includes("/compact"));
  assert.ok(joined.includes("压缩对话历史"));
  const en = buildShortcutsPanel("en");
  assert.ok(en.join("\n").includes("Shortcuts & Commands"));
});

test("状态栏包含模式/预算/模型/会话/目录/帮助", () => {
  const bar = buildStatusBar(info);
  assert.ok(bar.includes("⏸ 默认确认"));
  assert.ok(bar.includes("$10.00"));
  assert.ok(bar.includes("deepseek / deepseek-chat"));
  assert.ok(bar.includes("abc12345"));
  assert.ok(bar.includes("C:\\Users\\34515"));
  assert.ok(bar.includes("/help"));
});

test("truncateMiddle / padCenter 按显示宽度工作", () => {
  assert.equal(truncateMiddle("abcdefgh", 6), "abc…gh");
  assert.ok(stringWidth(truncateMiddle("中文测试字符串", 8)) <= 8);
  assert.ok(stringWidth(truncateMiddle("中文测试字符串", 8)) >= 6);
  assert.equal(padCenter("ab", 6), "  ab  ");
});
