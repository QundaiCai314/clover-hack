#!/usr/bin/env node
// Clover 入口

import { runCli } from "./cli/index.js";

runCli().catch((err) => {
  console.error("✖ Clover 运行出错：" + (err instanceof Error ? err.message : err));
  process.exit(1);
});

