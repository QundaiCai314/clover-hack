// CLI 入口：注册所有 clover 子命令

import { Command } from "commander";
import { cmdInit, cmdNew, cmdArchiveList, cmdConfig, cmdModels, cmdSessions, cmdStatus, cmdCheck, cmdTemplate, cmdAnalyze, cmdIdeate, cmdEvaluate, cmdPlan, cmdPitch, cmdReview, cmdStart } from "./commands.js";

export async function runCli(): Promise<void> {
  const program = new Command();

  program
    .name("clover")
    .description("🍀 Clover — 专为黑客松比赛设计的命令行 AI Agent")
    .version("0.1.0");

  program
    .command("init")
    .description("在当前目录初始化比赛项目")
    .action(async () => {
      try {
        await cmdInit();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("new <name>")
    .description("创建新比赛档案目录")
    .action(async (name: string) => {
      try {
        await cmdNew(name);
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("archive")
    .description("历史比赛档案")
    .argument("[list]", "子命令，目前仅支持 list")
    .action(async () => {
      try {
        await cmdArchiveList();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("config")
    .description("配置向导：模型、API Key、语言、预算、竞速模式")
    .action(async () => {
      try {
        await cmdConfig();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("models")
    .description("查看模型配置")
    .action(() => {
      try {
        cmdModels();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("status")
    .description("比赛状态：倒计时/预算/模式")
    .action(() => {
      try {
        cmdStatus();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("analyze [source]")
    .description("解析赛题（文件路径 / URL / 直接粘贴文本）")
    .action(async (source?: string) => {
      try {
        await cmdAnalyze(source);
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("ideate")
    .description("基于赛题生成项目点子")
    .action(async () => {
      try {
        await cmdIdeate();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("evaluate [idea]")
    .description("点子评估：合理性 + 市场分析（蓝海/红海）")
    .action(async (idea?: string) => {
      try {
        await cmdEvaluate(idea);
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("plan")
    .description("MVP 规划")
    .action(async () => {
      try {
        await cmdPlan();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("pitch")
    .description("生成 Pitch 演讲稿")
    .action(async () => {
      try {
        await cmdPitch();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("template <type>")
    .description("生成模板文档：readme / pitch / submission / timeline")
    .action((type: string) => {
      try {
        cmdTemplate(type);
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("check")
    .description("提交前检查清单")
    .action(async () => {
      try {
        await cmdCheck();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("review")
    .description("赛后复盘报告")
    .action(async () => {
      try {
        await cmdReview();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("sessions [id]")
    .description("查看历史会话（无参=列表，带ID=详情）")
    .action((id?: string) => {
      try {
        cmdSessions(id);
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program
    .command("start")
    .description("进入 Clover 对话模式")
    .action(async () => {
      try {
        await cmdStart();
      } catch (err) {
        console.error("✖ " + (err instanceof Error ? err.message : err));
        process.exitCode = 1;
      }
    });

  program.parseAsync(process.argv);
}
