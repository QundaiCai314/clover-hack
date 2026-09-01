import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrustLines, decodeTrustKey } from "../src/utils/input.ts";

test("decodeTrustKey 映射完整按键序列", () => {
  assert.equal(decodeTrustKey("\r"), "confirm");
  assert.equal(decodeTrustKey("\n"), "confirm");
  assert.equal(decodeTrustKey("\u001b"), "cancel");
  assert.equal(decodeTrustKey("\u0003"), "cancel");
  assert.equal(decodeTrustKey("\u001b[A"), "select-yes");
  assert.equal(decodeTrustKey("\u001b[B"), "select-no");
  assert.equal(decodeTrustKey("1"), "select-yes");
  assert.equal(decodeTrustKey("2"), "select-no");
  assert.equal(decodeTrustKey("x"), "none");
});

test("buildTrustLines 中文布局：末尾四行为 选项1/选项2/空行/提示", () => {
  const lines = buildTrustLines("C:\\demo", "zh");
  assert.equal(lines[lines.length - 4], "> 1. 是的，我信任这个文件夹");
  assert.equal(lines[lines.length - 3], "  2. 否，退出");
  assert.equal(lines[lines.length - 2], "");
  assert.equal(lines[lines.length - 1], "回车确认 · Esc 取消");
  assert.equal(lines[0], "正在访问工作区：C:\\demo");
});

test("buildTrustLines 英文布局", () => {
  const lines = buildTrustLines("/demo", "en");
  assert.equal(lines[lines.length - 4], "> 1. Yes, I trust this folder");
  assert.equal(lines[lines.length - 3], "  2. No, exit");
  assert.equal(lines[lines.length - 1], "Enter to confirm · Esc to cancel");
  assert.equal(lines[0], "Accessing workspace: /demo");
});

test("长路径与长文本按列宽硬换行，不破坏末尾布局", () => {
  const long = "C:\\very\\long\\path\\" + "x".repeat(120);
  const lines = buildTrustLines(long, "zh");
  assert.equal(lines[lines.length - 4], "> 1. 是的，我信任这个文件夹");
  assert.ok(lines.length > 12, "长内容应产生多行");
});
