# 🍀 Clover（三叶草）

**专为黑客松比赛设计的命令行 AI Agent** —— 从读到赛题到提交作品的每一步都有人帮。

Clover 以 Claude Code 风格的终端交互为体验基准，具备完整通用 Agent 能力（文件读写、命令执行、联网搜索、多模态、多模型），同时内置黑客松专属工作流：赛题解析、点子评估、MVP 规划、时间管理、提交检查、Pitch 辅助、赛后复盘。

> 当前状态：M4 多模态已完成，进入发布准备（M5）

## 功能一览

- 🧩 通用 Agent 能力：文件读写、终端命令、联网搜索、LLM 对话、多模态（图片输入：PNG / JPG / GIF / WebP）
- 🏆 黑客松工作流：赛题解析 → 点子生成/评估（联网市场分析）→ MVP 规划 → 提交检查 → Pitch 辅助 → 赛后复盘
- 🧠 多模型：OpenAI / Anthropic / Gemini / Ollama 本地 / 自定义兼容接口，可切换
- 💰 成本控制：token 用量与费用统计，预算上限提醒
- ⚡ 竞速模式：默认命令需确认，可一键切换全自动，配定时 git 备份
- 📁 比赛管理：每场一个目录 + 全局档案，历史可回溯
- 📝 模板库：README / Pitch / 提交说明 / 时间线 一键生成
- 🐾 终端小宠物：ASCII 三叶草吉祥物，启动时随机姿态出场

## 快速开始

```bash
npm install -g clover-hackathon
clover config        # 配置向导：模型、API Key、语言、预算
clover start         # 直接开跑！目录未初始化会自动初始化（像 Claude Code 一样开箱即用）
clover init          # 可选：手动初始化，设置赛题、截止时间等
```

> npm 包名 `clover` 若已被占用，本包使用 `clover-hackathon`，命令名保持 `clover`。

## 命令

| 命令 | 说明 |
| --- | --- |
| `clover init` | 初始化比赛项目（当前目录） |
| `clover new <name>` | 创建新比赛档案 |
| `clover start` | 进入 Agent 对话模式（对话内 `/img <图片> [问题]` 发送图片） |
| `clover analyze <file/url>` | 赛题解析 |
| `clover ideate` | 点子生成 |
| `clover evaluate <idea>` | 点子评估（联网市场分析） |
| `clover plan` | MVP 规划 |
| `clover template <type>` | 生成模板文档 |
| `clover check` | 提交前检查 |
| `clover review` | 赛后复盘 |
| `clover status` | 比赛状态/倒计时/预算 |
| `clover config` | 配置向导 |
| `clover models` | 模型管理 |
| `clover archive list` | 历史比赛档案 |

## 开发

```bash
npm install
npm run dev -- --help    # tsx 直接跑
npm run build            # 编译到 dist/
npm run typecheck        # 类型检查
```

## 目录结构

```text
src/
├── index.ts            # 入口
├── cli/                # 命令实现
├── core/               # agent 循环 / 工具注册 / 会话 / 权限
├── hackathon/          # 黑客松领域逻辑
├── models/             # 模型 Provider 抽象与实现
├── templates/          # 文档模板
└── utils/              # 配置 / 成本 / 日志
```

## 路线图

- M1 脚手架：项目结构、命令骨架、配置系统 ✅
- M2 Agent 核心：Provider 抽象、对话循环、工具调用、会话恢复 ✅
- M3 黑客松工作流：赛题解析 / 点子评估 / 规划 / 检查 / Pitch / 复盘 + 联网市场分析 ✅
- M4 多模态：图片输入，OpenAI / Anthropic / Gemini / Ollama 四家格式适配 ✅
- M5 发布：GitHub 开源 + npm 发布

## 开源

MIT License，欢迎贡献。完整需求见 [docs/PRD.md](docs/PRD.md)。
