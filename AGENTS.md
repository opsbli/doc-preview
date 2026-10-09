# Codex – Core Rules

You are working in a real production codebase.

---

## Global Language & Output Rules
- Always respond with Model:[current-model]
- Always respond in Simplified Chinese
- Be concise, technical, and precise
- No fluff, no praise, no motivational language
- Explain only what is necessary

---

## Core Behavior
- Prefer correctness over cleverness
- Prefer minimal, safe changes
- Never assume missing requirements
- If information is missing or uncertain, say so explicitly

---

## Code Rules
- Do NOT change business logic unless explicitly asked
- Do NOT introduce new dependencies unless explicitly asked
- Do NOT refactor unrelated code
- Keep changes local, minimal, and reviewable
- Always follow the project’s ESLint specifications

---

## File & Artifact Creation Rules
- Never create example files unless explicitly requested
- Never create test files unless explicitly requested
- Never create fix summaries, implementation summaries, or similar documentation files unless explicitly specified

---

## Terminal & Runtime Rules
- When using terminal tools, avoid restarting the project unless absolutely necessary
- Assume the project is designed to run continuously

---

## Reasoning Rules
- Give conclusions first, then reasoning
- Clearly separate confirmed facts from assumptions
- Never guess framework, library, or environment behavior
- If behavior is uncertain, suggest how to verify instead of guessing

---

## HTML & Markup Rules
- When writing special characters inside HTML tags, always use their corresponding HTML entity form

---

Follow these rules strictly unless explicitly overridden by the user.

## Important Constraints (Network Access Rules)

1. In this task:
   - Your built-in `fetch / WebFetch / any internal network request capability` must be treated as **completely unavailable**.
   - You are **not allowed to initiate any direct HTTP requests**.
2. Any action that requires internet access (including web browsing, API calls, or data queries):
    → **must be performed exclusively through the MCP tool `chrome_devtools`.**
3. Replacement rule:
   - Any scenario that would normally require `fetch / WebFetch`
      → must be replaced with calls to **mcp chrome_devtools**.
4. Information source rule:
    All network-related judgments (API availability, request parameters, headers, response structure, etc.)
    → must rely solely on **real records from Chrome DevTools Network Panel** as the only source of truth.
5. Strictly prohibited:
   - Simulating or fabricating API requests
   - Constructing requests based on assumptions
   - Guessing API structures from prior knowledge
   - Using “trial-and-error” requests to test interfaces
6. Data acquisition process:
    When network information is required, you may only:
   - Wait for me to provide copied Request / Response from DevTools
   - Or call `mcp chrome_devtools` to analyze real network activity
   - **You must not invent or assume any network data**

---

<!-- pax-family 强制规则区块（由 pax-init 追加，2026-10-09；保留合并模式下不覆盖上方用户手写规则） -->

## ⭐ pax-family 强制规则（最高优先级）

> 本区块由 `pax-init` 在「保留合并」模式下追加。以下规则对 AI 工具在本项目中的协作行为生效。

- **对任何用户请求，MUST 先经过 pax-family 的 L0 编排入口（`pax-orchestrate`）做意图分类与风险分级，NEVER 直接执行。**
- **硬性前置动作**：收到任务后第一步 MUST 调用编排入口；在编排入口返回快照（达成编排）之前，禁止任何文件写操作、编译、构建或 `git` 操作。
- **未产出 `pax-snapshot.yaml` 即禁止写/编译/git**；缺失快照时引导用户先走编排入口，NEVER 在空上下文静默执行。
- **高风险动作（部署 / 数据订正 / 破坏性命令）MUST 先取得用户显式 approval / confirm**，NEVER 自行下发。
- **每完成一个里程碑 MUST `git commit`**：提交前先跑构建 / 测试确认通过。
- **环境降级 MUST 随交付提示**，NEVER 静默降级。
- **门禁失败 NOT 环境降级**：编排门禁与快照缺失是硬性拒绝启动，MUST 返回 `blocked`；仅版本门自身故障允许放行并标注口径。
- 项目元数据唯一来源见 `.pax/project-profile.json`；本文件仅为其人可读摘要。

---

## 项目信息（自动生成 · 与 .pax/project-profile.json 同源）

| 项 | 内容 |
|---|---|
| 项目名称 | @opsbli/file-preview-monorepo |
| 项目描述 | React + Vue 文件预览组件库 Monorepo（doc-preview） |
| 仓库路径 | C:\Users\sam\Documents\codes\doc-preview |
| 接入模式 | single_project |
| 家族版本 | 1.0.1（家族运行时 pax-ops/versions.json 未找到，版本门放行） |

### 技术栈（证据文件）

- TypeScript — `tsconfig.json`（typescript ^5.6.3）
- React — `packages/react-file-preview/package.json`（用户确认）
- Vue 3 — `packages/vue-file-preview/package.json`（用户确认）
- Node.js / pnpm — `package.json`（pnpm@10.15.0）
- Monorepo — `pnpm-workspace.yaml`（packages/*）
- 未检测到：Java/Maven、Spring Boot、Gradle、RuoYi、Vite、Vue 相关 UI 库、Pinia/Vuex、Tailwind/UnoCSS、Go、Python、Docker、CI/CD

### 构建与验证命令

```bash
# 构建
pnpm run build
# 测试
pnpm run test
# Lint
pnpm run lint
```

### 编码规范要点

- 语言：TypeScript；框架：React + Vue 3 组件库
- 命名：PascalCase 组件 / camelCase 变量函数；包按 @opsbli/<scope> 拆分
- 分层：monorepo（file-preview-core / react-file-preview / vue-file-preview / examples / docs）
- Linter：ESLint 9 flat config（@typescript-eslint + react-hooks）
- Formatter：未检测到

### 规范文档指针

- 未检测到项目级规范文档（无 docs/agents、CONTEXT.md、docs/adr）。`consumption_rule`：下游阶段若命中规范文档 MUST 完整阅读原文后逐条对照，profile 仅结构化摘要，冲突以原文为准。

### DB 约定

- 未检测到代码生成器，按通用规范：`id` / `created_at` / `updated_at` / `deleted_at`（逻辑删除）

### 产物目录

- `.pax/plan/`（规划）、`.pax/execute/`（执行）、`.pax/review/`（评审）、`.pax/docs/`（文档沉淀）
- 产物命名：`<问题类型>_<YYYYMMDD>_<HHMMSS>_<会话ID前8位>`
