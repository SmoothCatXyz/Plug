# Plug — Implementation Spec

> **Plug** 是一个基于 Electron 的 AI-first 桌面工作仓，面向中国用户。本文档是给实现 agent（Codex / Claude Code）的项目规范，描述产品定位、架构、文件结构、UI 布局、MVP 范围、验收标准。

---

## 0. 关于名字

**Plug** 来自《新世纪福音战士》（Evangelion）的 **Entry Plug**（エントリープラグ / 进入插栓）——机师通过一个圆柱形舱体被插入到 Eva 机体内部，与机体同步、共同作战。

这个名字描述了产品的核心交互模型：

- 用户 **plug into** 一个项目
- AI 是机体（执行能力）
- 用户是机师（指挥、监督、纠偏）
- 项目是结构化的作战环境（PRD / 设计 / 知识 / 代码 / 交付物）

视觉与交互设计应围绕这个意象：启动应用、打开项目时一道光从顶部落下、项目舱"插入"、进入工作界面。Logo / 图标方向可以基于圆柱形 Entry Plug 的俯视/侧视轮廓。

中文产品名沿用 "Plug"，必要时可叫"栓"（Entry Plug 的官方中译"插入栓"的核心字），保持品牌简洁。

### 0.1 视觉与交互定位

**Plug 不是一个普通的 markdown 工具加 AI 聊天框。它是一台机甲的驾驶舱。**

用户打开 Plug 时应该感觉自己"插入了一台机器"——专注于一个项目时，整个面板进入未来感的战术指挥视图。用户是机师，AI 是机体，项目是当前作战环境。用户的角色是发号施令、监督状态、必要时介入或重定向，而不是手动编辑文件。

**视觉调性参考坐标**：

- **主线**：钢铁侠 J.A.R.V.I.S. UI ——透明蓝色、信息密度高、模块化分区、优雅克制
- **情感**：EVA 初号机座舱——同步率显示、应急警报、有机感的状态指示
- **秩序**：星际争霸 2 终端——几何边角、菱形装饰、明确的状态色

**关键设计承诺**：

1. **不是主题选项，是产品本体**。Plug 没有"普通模式"，整个产品就是机甲模式。
2. **HUD 装饰服务功能，不喧宾夺主**。所有视觉元素必须对应"AI 在做什么"的实际信息。
3. **专业感优先于游戏感**。Plug 是 PM 每天用 8 小时的工作工具，不是娱乐界面。
4. **音效是一等公民**。没有音效的机甲 UI 是死的，所有关键交互都有声音反馈。

详细设计 spec 见 §7。

---

## 1. 产品定位

**一句话：** Plug 是一个以 Project 为单位的、AI 主导的、本地优先的桌面工作仓。用户告诉 AI 要做什么，AI 在结构化的项目环境里完成工作（写文档、整理知识、调用工具），用户监督和指导。

**与现有产品的区别：**

- **不是 IDE**：不做代码编辑，代码通过 git 外挂引用，用户用自己的 IDE 编辑
- **不是文档工具**：AI 是主操作者，不是辅助编辑者
- **不是通用 chatbot**：强结构化的 project 是核心抽象
- **不是 web agent**：本地优先，所有数据在用户磁盘上

**目标用户：**

- 中国用户（无法稳定使用 Cursor / Claude Code 的群体）
- 小团队、独立工作者、产品经理、内容创作者、研究者
- **不一定是程序员**——产品的核心交互不假设用户会编程

**核心承诺：** 项目持久、记忆稳定、操作可控、模型可选、数据在本地。

---

## 2. 核心原则

1. **Project-centric**：所有工作以 project 为单位。Project 是磁盘上一个文件夹。
2. **AI-first**：用户主要通过对话推进工作，不是手动编辑文件。
3. **Local-first**：所有数据在用户本地磁盘，可备份、可 git、可移植。
4. **Template-driven**：项目结构由模版定义，**绝对不在代码里 hardcode 结构**。
5. **Convention over configuration**：固定的文件夹命名规则让 AI 知道东西在哪。
6. **Memory isolation**：项目之间记忆隔离，项目内多 session 共享记忆。
7. **Single project at a time**：一次只打开一个项目，状态管理简化。

---

## 3. 技术栈

| 类别 | 选型 | 说明 |
|------|------|------|
| 桌面壳 | Electron | 成熟生态优先于体积 |
| 构建 | Vite | 渲染层和主进程都用 |
| UI 框架 | React + TypeScript | 严格模式，无 any |
| 状态管理 | Zustand | 比 Redux 轻量 |
| 样式 | Tailwind + 自定义 design tokens | **不要用 shadcn/ui 的视觉默认**，全部 override 成机甲风 |
| Markdown 编辑器 | Milkdown | 基于 ProseMirror，所见即所得；可切 raw 模式 |
| AI SDK | Vercel AI SDK | 多 provider 支持，国产模型走 OpenAI-compatible |
| 数据库 ORM | Drizzle | 持久化 manifest / sessions / 配置（参考 Alma 的选型） |
| MCP 客户端 | `@modelcontextprotocol/sdk` | Anthropic 官方 TS SDK |
| Git | `simple-git` | npm 包，主进程使用 |
| Schema 校验 | zod | 所有 tool input/output、IPC payload 都校验 |
| 存储 | 文件系统 | 项目 = 磁盘文件夹；app 配置 = `~/.plug/` |
| **动画** | **Framer Motion** | React 生态最成熟，HUD 过渡、数字滚动、面板切换 |
| **复杂动效** | **Lottie** | 启动动画、能量蓄能、同步率上升等粒子级效果 |
| **粒子背景** | **tsParticles** | 背景星点 / 数据流粒子，可选 |
| **音效** | **Howler.js** | 全部音频资源本地打包，UI 反馈音必备 |
| **语音输入** | **whisper.cpp（本地）+ Web Speech API（兜底）** | 长按空格说话，转写到输入框 |

---

## 4. Project 磁盘结构

每个 project 是磁盘上一个文件夹。结构由模版定义，但有以下约定：

```
my-project/
├── .plug/
│   ├── manifest.json         # 项目配置（模版、模型偏好、git remote 等）
│   ├── memory.md             # AI 维护的项目级压缩记忆
│   ├── rules.md              # 工作规范（模版生成）
│   ├── sessions/             # 多 session 历史
│   │   ├── 001.json
│   │   └── 002.json
│   ├── plans/                # 任务规划与执行记录
│   └── code-cache/           # git clone 缓存（如有代码区）
├── 00-home.md                # 主页（AI 维护的项目状态仪表盘）
├── 01-purpose.md             # 项目目的
├── 02-prd/                   # PRD 区（示例 section）
│   ├── _index.md             # AI 维护的本区索引
│   └── ...
├── 03-design/
│   ├── _index.md
│   └── ...
├── 04-code/                  # 代码区（含 README 描述外链 git repo，不存代码）
│   └── _index.md
├── 05-knowledge/
│   ├── _index.md
│   └── ...
└── 06-deliverables/
    └── _index.md
```

### 4.1 `manifest.json` Schema

```json
{
  "version": 1,
  "name": "项目名",
  "templateId": "product-dev",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "model": {
    "default": "deepseek-chat",
    "planning": "deepseek-reasoner"
  },
  "code": {
    "type": "git",
    "url": "https://github.com/user/repo",
    "branch": "main"
  },
  "sections": [
    {
      "id": "home",
      "label": "主页",
      "path": "00-home.md",
      "type": "file",
      "aiWrite": "auto",
      "icon": "home"
    },
    {
      "id": "purpose",
      "label": "项目目的",
      "path": "01-purpose.md",
      "type": "file",
      "aiWrite": "auto",
      "icon": "target"
    },
    {
      "id": "prd",
      "label": "PRD",
      "path": "02-prd/",
      "type": "folder",
      "aiWrite": "confirm",
      "icon": "file-text"
    },
    {
      "id": "design",
      "label": "设计",
      "path": "03-design/",
      "type": "folder",
      "aiWrite": "confirm",
      "icon": "palette"
    },
    {
      "id": "code",
      "label": "代码",
      "path": "04-code/",
      "type": "git",
      "aiWrite": "confirm",
      "icon": "git-branch"
    },
    {
      "id": "knowledge",
      "label": "知识仓库",
      "path": "05-knowledge/",
      "type": "folder",
      "aiWrite": "auto",
      "icon": "book"
    },
    {
      "id": "deliverables",
      "label": "交付物",
      "path": "06-deliverables/",
      "type": "folder",
      "aiWrite": "confirm",
      "icon": "package"
    }
  ]
}
```

### 4.2 `aiWrite` 三档

| 值 | 含义 |
|------|------|
| `auto` | AI 可自动写入，无需用户确认 |
| `confirm` | AI 提议修改后，必须用户在 diff 视图确认才会写入 |
| `readonly` | AI 不能写，只能读 |

### 4.3 `_index.md` 约定

每个 `type: folder` 的 section 下都有一个 `_index.md`，由 AI 维护。格式：

```markdown
# {sectionLabel} 索引

> 此文件由 AI 自动维护，请勿手动编辑。

## 概况
- 文档数：{n}
- 最近更新：{date}
- 阶段：{stage}

## 文档列表
- [文件名.md](./路径) - 简介（最后更新 {date}）
- ...

## 最近变更
- {date}: 变更描述
- ...
```

**关键设计点：** AI 在工作前先读 `_index.md` 了解 section 状态，**不要扫所有文件**。这是控制上下文成本的关键。

### 4.4 `memory.md` 约定

AI 维护的项目级压缩记忆。结构建议：

```markdown
# 项目记忆

## 项目目的
{一段话概括}

## 关键决定
- {date}: {决定}
- ...

## 当前阶段
{stage} - {简述}

## 待办
- [ ] {item}
- ...

## 重要上下文
{AI 认为后续 session 需要知道的事}
```

**更新时机（不要每条消息后更新）：**

- 用户手动触发（对话框 "记入项目记忆" 按钮）
- AI 主动调用 `update_memory` tool（重要决定 / 阶段切换）

### 4.5 `rules.md` 约定

工作规范，**模版生成**，定义 AI 行为边界。每次对话开始时自动注入到 system prompt。包含：

- 项目工作流程约定（如：PRD 先于设计、设计先于代码）
- 每个 section 的 AI 写入权限说明
- 关键操作的审批要求（git commit / push 必须用户确认）
- 命名约定
- 风格指南

---

## 5. UI 布局

### 5.1 启动页（无项目打开）

```
┌──────────────────────────────────────────────────────────┐
│ ◢◢◢ PLUG ◣◣◣        SYSTEM ONLINE      [SETTINGS] [⚙]  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│    ╔══════════════════════════════════════════════╗     │
│    ║  ◆ NEW PROJECT                               ║     │
│    ║    INITIALIZE NEW MISSION                    ║     │
│    ╚══════════════════════════════════════════════╝     │
│                                                          │
│    RECENT PROJECTS                                       │
│    ┌────────────────────────────────────────────┐       │
│    │ ◆ 登录系统重构     ACTIVE · 2 hrs ago      │       │
│    │ ◆ 内容日历 2026Q2  STANDBY · 1 day ago     │       │
│    │ ◆ 用户研究报告     ARCHIVED · 3 days ago   │       │
│    └────────────────────────────────────────────┘       │
│                                                          │
│    ALL PROJECTS  [search ___________]                    │
│    ...                                                   │
│                                                          │
│    SYSTEM CONFIG                                         │
│    [PROVIDERS]  [MCP]  [PERSONAS]  [PREFERENCES]         │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ ◢ STATUS: STANDBY · NO ACTIVE PROJECT ◣                  │
└──────────────────────────────────────────────────────────┘
```

所有装饰元素（◢◣ 折角、◆ 菱形项目符号、═ 实体框）必须用真实 Unicode 或 SVG 渲染，不是 ASCII 占位。

### 5.2 项目工作界面（机甲座舱布局）

```
┌────────────────────────────────────────────────────────────────────────┐
│ ◢ PLUG ◣  PROJECT: 登录系统重构   SYNC:87%  [DeepSeek▼] [PLAN▼] [⚙]  │  ← HUD 顶栏
├──────────┬─────────────────────────────────────────┬───────────────────┤
│ ▼ NAV    │ SESSION 1 ▼              [+ NEW]        │ ▼ DOC VIEWER     │
│          │ ════════════════════════════════════════ │                  │
│ ◆ HOME   │                                          │ 02-prd/login.md  │
│ ◆ PURP.  │  > 用户消息                               │ ─────────────────│
│ ◆ PRD ●  │                                          │                  │
│ ◆ DESN.  │  ▼ AI RESPONSE · streaming...            │  [文档内容渲染]   │
│ ◆ CODE   │                                          │                  │
│ ◆ KNOW.  │  ▶ TOOL: read_file ✓  [12ms]            │                  │
│ ◆ DELIV. │  ▶ TOOL: propose_edit ⏳ AWAITING        │                  │
│          │                                          │                  │
│ ──────── │  ╔═══════════════════════════════╗      │                  │
│ ⬢ MCP    │  ║ MISSION PANEL                 ║      │                  │
│ 3/5 ACT  │  ║ ─────────────────────────────  ║      │                  │
│ ⬢ TOKEN  │  ║ ✓ [01] 读取项目目的             ║      │                  │
│ 23k/64k  │  ║ ✓ [02] 分析三种登录方式         ║      │                  │
│ ⬢ MODEL  │  ║ ▶ [03] 生成 login.md  ←CURRENT ║      │                  │
│ 142ms    │  ║ ○ [04] 更新 _index.md          ║      │                  │
│          │  ║ ○ [05] 记入项目记忆             ║      │                  │
│          │  ║ [PAUSE] [OVERRIDE] [ABORT]    ║      │                  │
│          │  ╚═══════════════════════════════╝      │ [EDIT] [COPY]    │
│          │ ════════════════════════════════════════ │                  │
│          │ ╔════════════════════════════╗ [🎤][↵] │                  │
│          │ ║ 输入指令... (长按 Space说话)║          │                  │
│          │ ╚════════════════════════════╝          │                  │
└──────────┴─────────────────────────────────────────┴───────────────────┘
  ◢ STATUS: AI EXECUTING · 5 STEPS PLANNED · 2 COMPLETE · ETA 2m 30s ◣    ← 底部状态栏
```

**核心新增 HUD 元素**：

- **顶栏 SYNC 数值**：致敬 EVA 同步率，实际显示项目"健康度"综合指标（context 使用率 + 模型连通性 + 待审批项数量），数字会动态跳动
- **左栏底部仪表盘**：MCP 连接数 / Token 使用 / 模型延迟，每个有 ⬢ 六边形图标和实时数值
- **Mission Panel**：AI 执行任务时浮现在对话流中，列出 planned steps，实时显示当前进度。**这是机甲座舱的核心 HUD 元素**，见 §7.6
- **底部状态栏**：当前任务状态、planned/completed steps、ETA，始终可见
- **语音输入按钮**：输入框旁的 🎤 图标，长按 Space 也可触发
- **Section 状态指示点**：当前 active 的 section 旁有 ● 标记

所有装饰元素（◢◣ 折角、◆ 菱形项目符号、═ 实体框、⬢ 六边形仪表）必须用真实 Unicode 或 SVG 渲染，不是 ASCII 占位。

**三栏宽度**：

- 左栏 200-240px（固定）
- 中栏 AI 对话主区（自适应填充）
- 右栏 350-500px（可调整宽度、可折叠）

**交互逻辑**：

- 点击左栏 section → 该 section 的 `_index.md`（或单 file section 的内容）显示在右栏
- 点击右栏文档里的文件链接 → 在右栏切换到该文件
- 点击对话中 AI 引用的文件链接 → 右栏自动打开该文件
- AI 调用 `propose_edit` → 右栏自动切换到该文件，显示 diff 视图
- 右栏可整体折叠（收起后中栏占满），通过 Cmd/Ctrl+\ 或顶栏按钮

### 5.3 Session 切换器

中栏顶部，含：

- 当前 session 名称（dropdown 切换）
- `+ Session` 按钮新建
- Session 标题用户可改（默认 "新对话 N"）

Session 数据保存在 `.plug/sessions/{id}.json`。

### 5.4 文档查看器状态

| 状态 | 触发 | 显示 |
|------|------|------|
| 空态 | 项目刚打开 | 显示 00-home.md（主页） |
| 只读浏览 | 点击 section / 文件链接 | 渲染后的 markdown |
| 编辑模式 | 点击 "编辑" 按钮 | Milkdown 编辑器（用户手动编辑） |
| Diff 模式 | AI 调用 `propose_edit` | 原内容 vs 新内容 diff + [接受] [拒绝] |
| Git 视图 | 点击 "代码" section | 仓库元信息 + commit 列表 + Open in IDE 按钮 |

---

## 6. AI 对话机制

### 6.1 Session 模型

- 每个 project 内可有多个 session
- Session = 独立对话历史 + 标题 + 创建/更新时间
- Session 数据：`.plug/sessions/{uuid}.json`
- 同 project 多 session **共享** `memory.md` 和 `rules.md`
- 不同 project **不共享**任何记忆

### 6.2 并发约束（MVP）

**同一时刻只允许一个 session 正在执行 AI 任务**，其他 session 进入只读 / 排队状态。避免 memory.md 写冲突。UI 上显示 "其他 session 正在运行..." 提示。

### 6.3 上下文构成（每次 AI 调用注入顺序）

1. **System prompt 基底**（基础人设、当前模式 plan/execute）
2. **`rules.md` 全文**
3. **`memory.md` 全文**
4. **当前 section 的 `_index.md`**（如果用户在某个 section 上下文里）
5. **当前 session 历史**（含 tool calls + results）
6. **用户当前消息**

### 6.4 AI 可用 Tools

> **基线对标**：Alma 内置 20+ tools。Plug 的 MVP 实现核心 10 个，但**架构必须支持动态扩展到 20+**（tool registry 模式，不是 hardcode 列表）。

**MVP 必须实现（10 个 core tools）**：

| Tool | 功能 | aiWrite 等级 |
|------|------|-------------|
| `read_file(path)` | 读项目内文件 | 读类 |
| `list_section(sectionId)` | 列出某 section 内文件（读 `_index.md`，不实际扫盘） | 读类 |
| `propose_edit(path, newContent, reason)` | 提议编辑文件（按 aiWrite 配置决定流程） | 按 section |
| `create_file(path, content, reason)` | 在 section 内新建文件（同 aiWrite） | 按 section |
| `delete_file(path, reason)` | 删除项目内文件（永远 confirm） | confirm 强制 |
| `update_index(sectionId)` | 重新生成某 section 的 `_index.md`（扫该文件夹） | auto |
| `update_memory(summaryPatch)` | 更新 `memory.md` | auto |
| `web_search(query, maxResults)` | Web 搜索（通过内置 Playwright，见 §6.7） | 读类 |
| `web_fetch(url)` | 抓取 URL 内容并提取为文本（Playwright） | 读类 |
| `run_command(cmd, cwd?)` | 在受控 shell 跑命令（git 操作等） | confirm 强制 + 默认禁用 |

**Phase 2 计划加（每个独立功能模块）**：

| Tool / 模块 | 用途 |
|------------|------|
| MCP tools 注入 | 任何已连接的 MCP server 暴露的 tools 自动注入到 agent，遵循 §10.1 |
| `git_*` 高级操作 | branch / commit / push / PR 等结构化 git 操作 |
| `take_screenshot(target)` | 截图工具，含浏览器 / 桌面区域 |
| `browser_*` 系列 | 完整浏览器自动化（navigate / click / type / screenshot） |
| `search_memory(query)` | 语义检索 memory（embeddings，见 §6.6 双模型 + §10.2 增强 memory） |
| `extract_structured(text, schema)` | 用 zod schema 抽结构化数据 |
| `create_artifact(type, content)` | 生成 Artifact（HTML / Mermaid / SVG / React，见 §10.3） |
| 知识库导入 tools | 飞书 / Notion / Obsidian 等 |

**Tool registry 设计**：

```ts
type AgentTool<TParams extends ZodSchema, TResult> = {
  name: string;
  label: string;                    // 中栏 UI 显示用
  description: string;              // 给 LLM 看
  parameters: TParams;              // zod schema
  aiWriteLevel: 'read' | 'auto' | 'confirm';
  category: 'file' | 'web' | 'shell' | 'memory' | 'mcp' | 'artifact';
  execute: (params, ctx) => Promise<TResult>;
  // streaming 进度回调（用于 tool stream UI，见 §6.8）
  onUpdate?: (partial: { text?: string; details?: unknown }) => void;
};

// 在主进程注册
toolRegistry.register(readFileTool);
toolRegistry.register(webSearchTool);
// ...

// agent loop 调用时按 mode / context 过滤可用 tools
const enabledTools = toolRegistry.filter({
  mode: currentMode,           // plan / execute
  aiWriteLevel: ['read', 'auto', 'confirm'],
  category: enabledCategories,
});
```

**为什么这样设计**：Alma 的 20+ tools 是逐步加上的，Plug 的架构必须从第一天就支持这种增量扩展，否则到 Phase 2 加新 tool 时会陷入大规模重构。

### 6.5 模式切换

| 模式 | AI 可调用的 tool |
|------|----------------|
| **Plan** | 仅 `category: 'read'` 类（`read_file`、`list_section`、`web_search`、`web_fetch`） |
| **Execute** | 全部 tool（受 aiWrite 配置约束） |

模式切换在中栏顶部。**MVP 默认 Plan 模式**，避免误操作。

### 6.6 双模型架构（对标 Alma 的 Chat Model + Tool Model）

> **基线对标**：Alma 把 LLM 调用分两类——Chat Model（主对话，可选强模型）和 Tool Model（后台事务，必须快）。Plug 沿用这个设计。

**两个角色**：

| 角色 | 用途 | 推荐模型（国产） |
|------|------|----------------|
| **Chat Model** | 主对话、推理、规划、生成内容 | DeepSeek V3 / Qwen Max / Kimi |
| **Tool Model** | 后台事务：tool 选择辅助、memory 摘要生成、session 标题生成、`_index.md` 自动维护、context 压缩 | DeepSeek Chat（轻量）/ Qwen Turbo / GLM-4-Flash |

Tool Model 的特点：**fast、cheap、context 小但足够、必须支持 tool calling**。

**配置位置**：`~/.plug/config.json` 顶层。Chat Model 是项目级（manifest.json 里设默认 + session 可临时覆盖），Tool Model 是全局级（一个就够，不需要项目级覆盖）。

```json
{
  "toolModel": {
    "providerId": "deepseek-default",
    "modelId": "deepseek-chat"
  }
}
```

**MVP 必须支持**：

- 后台事务自动调用 Tool Model（不显示在 session 历史里，不消耗用户配置的 Chat Model 配额）
- 用户在设置里能单独配置 Tool Model
- 提供 "Test" 按钮验证 Tool Model 响应延迟

**为什么这么做**：用户主对话用 Claude Opus / DeepSeek Reasoner 这类高端模型时，每次生成 session 标题如果都用这些模型会**贵且慢**。Alma 分离两个模型是合理的工程选择。

### 6.7 网络层（Proxy + Retry + Timeout + Fallback）

> **基线对标**：Alma 内置 Proxy + Retry + Timeout，支持 HTTP / SOCKS5。Plug 必须有同等能力——尤其是面向中国用户，网络环境复杂。

**MVP 必须支持**：

1. **代理配置**：全局 HTTP / SOCKS5 代理，在设置里配
   - 也支持 per-provider 代理（某些 provider 走代理某些不走）
   - 代理也能用于 web search / web fetch tool
2. **自动重试**：
   - 网络错误（timeout / 5xx / 429）自动重试 3 次
   - 指数退避：1s → 2s → 4s
   - 用户可见 retry 状态（Mission Panel 里显示）
3. **超时**：
   - 单次 LLM 调用默认 60s timeout
   - 长任务（reasoner / extended thinking）放宽到 300s
   - 用户可配
4. **Provider Fallback Chain**（Phase 2 增强）：
   - 一个 provider 持续失败时自动切换到备用 provider
   - 配置：`providers: [primary, fallback1, fallback2]`
   - **MVP 阶段不做**自动 fallback，但要做错误降级提示（"DeepSeek 调用失败，建议切换到备用 provider"）

**实现位置**：主进程的 `ai-service.ts`，所有 LLM 调用必须走这一层，不允许渲染进程直接 fetch。

### 6.8 流式输出与 Tool Stream UI

> **基线对标**：Alma 的核心体验是用户实时看到 tool 在执行什么。Plug 必须做到同等水准。

**Streaming 要求**：

1. **文本 streaming**：LLM 输出文本字符级别地流到 UI（不是整段返回）
2. **Tool call 状态实时显示**：
   - AI 决定调用某个 tool → UI 立刻显示 "▶ TOOL: tool_name(...) ⏳ STARTING"
   - Tool 开始执行 → 显示 "▶ TOOL: tool_name ⏳ RUNNING"
   - Tool 有进度（如 web search 抓取多个页面）→ 通过 `onUpdate` 回调流式更新 UI
   - Tool 完成 → "▶ TOOL: tool_name ✓ [12ms]" + 结果摘要
   - Tool 失败 → "▶ TOOL: tool_name ✗ [error_msg]"
3. **AI 思考可见**：
   - 模型有 reasoning / extended thinking 时，thinking trace 可折叠显示
   - 默认折叠，点击展开
4. **Mission Panel 与对话流联动**：
   - 一个多步任务的 tool calls 在对话流里展开
   - 同时 Mission Panel（§7.6）以"任务概览"的形式聚合显示

**实现要点**：

- Vercel AI SDK 的 `streamText` + `onChunk` + tool call streaming 全部用上
- IPC 层用 EventEmitter 或 BroadcastChannel 把 streaming chunks 推到渲染层
- UI 用 React 18 的 startTransition 避免长 streaming 阻塞渲染

### 6.9 键盘快捷键体系

> **基线对标**：Alma 提供完整键盘 shortcuts（Cmd+N / Cmd+, / Cmd+B / Cmd+F 等）。Plug 必须有，且要更"机甲味"——快捷键是机师操作机甲的方式。

**MVP 必须实现（全局）**：

| 操作 | macOS | Windows |
|------|-------|---------|
| 新建项目 | `Cmd+N` | `Ctrl+N` |
| 打开项目（启动页搜索） | `Cmd+O` | `Ctrl+O` |
| 设置 | `Cmd+,` | `Ctrl+,` |
| 切换左侧 nav | `Cmd+B` | `Ctrl+B` |
| 切换右侧文档面板 | `Cmd+\` | `Ctrl+\` |
| 全局搜索（跨项目 / session） | `Cmd+F` | `Ctrl+F` |
| 新 session | `Cmd+T` | `Ctrl+T` |
| 切换 session | `Cmd+1...9` | `Ctrl+1...9` |
| 发送消息 | `Enter` | `Enter` |
| 换行 | `Shift+Enter` | `Shift+Enter` |
| 中断 AI（OVERRIDE） | `Cmd+I` | `Ctrl+I` |
| 停止 AI（ABORT） | `Cmd+.` | `Ctrl+.` |
| 切换 Plan / Execute 模式 | `Cmd+P` | `Ctrl+P` |
| 长按录音（语音输入） | `Space`（长按） | `Space`（长按） |
| 决策弹窗 - 同意 | `Y` | `Y` |
| 决策弹窗 - 拒绝 | `N` | `N` |
| 命令面板 | `Cmd+K` | `Ctrl+K` |

**命令面板（Cmd+K）**：MVP 实现简化版（最近命令 + 主要 action），完整版 Phase 2。

**视觉呈现**：所有快捷键在 tooltip / 菜单中用机甲风格的 key cap 元素显示：`⌘ K` 而不是 "Cmd+K"。

---

## 7. 视觉系统（机甲座舱）

Plug 的视觉是产品的核心承诺，不是装饰。本节定义所有视觉与音效规范。**调性：J.A.R.V.I.S. 为主 × EVA 元素点缀 × 星际争霸 2 秩序感**。

### 7.1 配色系统

**主背景层级**（深色为唯一基调，不做浅色主题）：

| 用途 | Token | 值 | 说明 |
|------|-------|-----|------|
| 最深背景 | `--bg-void` | `#05080D` | 整个应用底色 |
| 面板背景 | `--bg-panel` | `#0A0E14` | 主要 panel 底色 |
| 抬升面板 | `--bg-elevated` | `#11161F` | 浮层、Mission Panel |
| 边框 | `--border-default` | `#1F2937` | 默认分割线 |
| 边框高亮 | `--border-accent` | `#00D9FF` | 关键边框、HUD 装饰线 |

**功能色**（信号灯系统，严格分工）：

| 用途 | Token | 值 | 含义 |
|------|-------|-----|------|
| 主能量色 | `--accent-cyan` | `#00D9FF` | J.A.R.V.I.S. 蓝，主交互、品牌色 |
| 警示色 | `--accent-amber` | `#F59E0B` | 等待用户决策、AWAITING 状态 |
| 警报色 | `--accent-red` | `#FF3B30` | 错误、危险操作、EVA 应急 |
| 成功色 | `--accent-green` | `#10F4B1` | tool 完成、健康状态 |
| 静默色 | `--accent-violet` | `#9D5CFF` | Plan 模式、思考中 |

**文字色**：

| 用途 | Token | 值 |
|------|-------|-----|
| 主文本 | `--text-primary` | `#E5F2FF` |
| 次要文本 | `--text-secondary` | `#7B8EA3` |
| 弱化文本 | `--text-muted` | `#4A5868` |
| HUD 标签（全大写） | `--text-hud` | `#00D9FF` + `letter-spacing: 0.1em` |

**严格约束**：

- **不要用普通蓝（#3B82F6）、Material 蓝、Tailwind blue-500**——这些都是消费品调性，破坏机甲感
- 所有 accent 色直接 100% 显示在深背景上不会刺眼，因为背景已经很深
- 状态不能只靠颜色区分，必须配合图标 / 形状（色弱友好）

### 7.2 字体系统

**核心字族**：

| 用途 | 字体 | 备选 |
|------|------|------|
| HUD 标签 / 数值 / 等宽 | **JetBrains Mono** | SF Mono, Consolas |
| 英文 UI 文字 | **Inter** | SF Pro, system-ui |
| 英文标题 | **Orbitron** 或 **Rajdhani**（科幻几何感） | Inter Bold |
| 中文 UI | **MiSans** 或 **HarmonyOS Sans** | PingFang SC |
| 中文标题 | **MiSans Heavy** | PingFang SC Bold |

**字号阶梯**（紧凑型，机甲面板信息密度高）：

```
--text-xs:   11px  // HUD 标签、状态文字
--text-sm:   13px  // 次要 UI、辅助信息
--text-base: 14px  // 主文本（注意：比常规 16px 小，提高密度）
--text-lg:   16px  // 强调
--text-xl:   20px  // 区块标题
--text-2xl:  28px  // 项目名、大标题
--text-hud:  10px  // HUD 装饰文字，全大写 + tracking
```

**数字显示规则**：所有数值（token 计数、百分比、ETA、延迟）必须用等宽字体 + tabular nums，避免数字跳动。

### 7.3 HUD 框架元素

机甲感的核心。每个面板都遵循以下装饰约定：

**1. 折角装饰（◢◣）**

每个一级 panel 的左上角和右下角各有一组折角线（不是 emoji，是 SVG 或 CSS clip-path）：

```
◢━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
║                                        ║
║         面板内容                        ║
║                                        ║
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◣
```

- 折角颜色 = `--border-accent`（cyan）
- 折角线粗细 1.5px
- 折角长度约 12-16px

**2. 双线边框**

主要 panel 用双线（外 1px + 内 1px，间隔 2px），不是单线。这是星际争霸 2 风格的关键。

**3. 几何项目符号**

不要用普通的 `•` 或 `-`。section 列表用 `◆`（菱形），状态点用 `●`，未激活用 `○`。MCP / Token / Model 等仪表用 `⬢`（六边形）。

**4. 分隔线**

不要用单调实线。使用 `━` 或 `═` 字符级别的分割，或者 SVG 画双线 + 端点小菱形：

```
◇━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━◇
```

**5. 角落能量符号**

每个 panel 的四角可以有微小的"接口装饰"——一个发光小圆点或者 L 形装饰，营造"模块拼接"感。

### 7.4 运动设计

**动效原则**：所有动效必须对应"AI 在做什么"或"系统状态变化"，不为美而美。

**关键动效清单**：

| 场景 | 动效 | 时长 | 缓动 |
|------|------|------|------|
| 应用启动 | 从屏幕中心扫开，HUD 元素逐层加载 | 1.2s | `cubic-bezier(0.16, 1, 0.3, 1)` |
| 打开项目 | 启动页淡出 + 项目界面从底部滑入 | 600ms | ease-out |
| 切换 session | 中栏内容左右滑动切换 | 240ms | ease-in-out |
| 数字变化 | tabular num 滚动到目标值 | 400ms | ease-out |
| AI 开始响应 | 输入框边框 cyan 脉冲呼吸 | 1.5s 循环 | ease-in-out |
| Tool 调用中 | 该 tool 行有横向数据流动效 | 持续 | linear |
| Tool 成功 | 该行 cyan → green 渐变 + 短促闪烁 | 300ms | ease-out |
| Tool 失败 | 该行 red 闪烁 2 次 | 600ms | ease-out |
| Mission Panel 出现 | 从对话流中"展开"，高度从 0 到目标 | 400ms | spring |
| Plan/Execute 切换 | 主色调微变 + 边框色变化 | 500ms | ease-in-out |
| 决策弹窗（高风险操作） | 红色边框脉冲 + 屏幕轻微震动 | 200ms 震动 | - |

**禁用的动效**：

- 跳动 / 弹性（bounce）—— 不符合机甲克制感
- 旋转装饰（除了 loading spinner，且 spinner 用线性扫描而不是 spin）
- 任何 > 1.5s 的过渡动画（启动动画除外）

**用 Framer Motion 实现**：所有非平凡动效统一通过 `motion.div` + `variants` 模式，禁止散落的 `transition: all`。

### 7.5 音效系统

**没有音效的机甲 UI 是死的**。所有关键交互必须有音效反馈。

**核心音效清单**（MVP 至少做这 8 个，参考 sci-fi UI 音效包）：

| 触发 | 音效特征 | 时长 |
|------|---------|------|
| 应用启动 | 低频 bass + 升频，"开机感" | 1.5s |
| 打开项目 | 金属舱门关闭 thunk + 短促 confirm beep | 600ms |
| AI 开始响应 | 电子蓄能声，渐起 | 400ms |
| Tool 成功 | clean 短促 beep（高频） | 80ms |
| Tool 失败 | 低频 warning buzz | 200ms |
| 需要审批 | 双短 alert tone（amber 警示） | 300ms |
| 高风险决策弹窗 | 红色 alarm 三连 | 500ms |
| Session 切换 | 金属滑动 swoosh | 250ms |

**音量约束**：

- 默认音效音量 30%（用户可调到 0-100%）
- 提供"静音"开关（设置里）
- 同一音效 100ms 内不重复触发（防止快速操作时音效叠加）

**资源获取**：建议买 [Sonniss GameAudioGDC](https://sonniss.com/gameaudiogdc/) 免费包 + Side Effects 的 sci-fi UI pack（约 $50-200）。**不要用 freesound.org 的免费素材**——质量参差不齐且授权混乱。

### 7.6 Mission Panel（任务面板）

**这是 Plug 视觉系统的灵魂部件**，必须做扎实。

**出现时机**：

- AI 开始执行一个多步任务时（≥2 步），Mission Panel 在对话流中展开
- 任务完成后，panel 折叠成一行摘要（可点击展开看历史）
- 同时刻只有一个 active Mission Panel

**面板结构**：

```
╔════════════════════════════════════════════╗
║ ◢ MISSION: 撰写登录系统 PRD                ║
║   STATUS: EXECUTING · ETA 2m 30s           ║
║ ─────────────────────────────────────────  ║
║   ✓ [01] 读取项目目的与现有 PRD            ║
║   ✓ [02] 分析三种登录方式                  ║
║   ▶ [03] 生成 02-prd/login.md  ← CURRENT  ║
║     ├─ Drafting structure...               ║
║     └─ Token: 1.2k / 8k                    ║
║   ○ [04] 更新 _index.md                    ║
║   ○ [05] 记入项目记忆                      ║
║ ─────────────────────────────────────────  ║
║   [PAUSE]  [OVERRIDE]  [ABORT]             ║
╚════════════════════════════════════════════╝
```

**状态符号**：

- `✓` 已完成（green）
- `▶` 进行中（cyan，呼吸）
- `○` 待执行（muted）
- `⚠` 等待审批（amber）
- `✗` 失败（red）

**控制按钮**：

- **PAUSE**：暂停后续步骤（当前正在执行的 tool 仍会完成）
- **OVERRIDE**：打开输入框，用户输入 steering message，AI 接收后调整后续步骤
- **ABORT**：立即中止整个任务，AI 停止所有后续 tool calls

这三个按钮是"机师可以随时介入"的视觉化承诺。**这部分不能省**。

### 7.7 关键交互的视觉规范

**1. 高风险操作的全屏弹窗**

当 AI 提议高风险操作（写代码、push git、删文件等 `aiWrite: confirm` 类操作），不要用小弹窗。**全屏 modal**：

```
       ╔══════════════════════════════════════╗
       ║   ⚠  REQUIRES PILOT AUTHORIZATION   ║
       ║ ──────────────────────────────────── ║
       ║                                      ║
       ║   AI proposes:                       ║
       ║   propose_edit("02-prd/login.md")    ║
       ║                                      ║
       ║   Reason: ...                        ║
       ║                                      ║
       ║   [View Diff]                        ║
       ║                                      ║
       ║   ─────────────────────────────────  ║
       ║                                      ║
       ║   [ Y ] APPROVE      [ N ] REJECT    ║
       ║                                      ║
       ╚══════════════════════════════════════╝
```

- 全屏暗化 + 中心 modal
- modal 边框 amber 脉冲
- 弹出时 alarm 音效
- 支持 Y / N 键确认（不强制鼠标）

**2. Plan / Execute 模式切换器**

不要做成普通 toggle。做成驾驶舱拨杆样式：

- 视觉上有两档（PLAN / EXECUTE），明显的"档位感"
- 切换时主色调微变：PLAN = violet 调，EXECUTE = cyan 调
- 切换音效：金属拨杆声
- MVP 阶段可以先做 segmented control + 颜色变化，Phase 2 再做完整拨杆视觉

**3. 语音输入**

- 输入框右侧有 🎤 图标按钮，长按 Space 也可触发
- 录音中：输入框边缘 cyan 脉冲光晕，HUD 上方出现"RECORDING · 0:03"
- 实时转写：whisper.cpp 流式转写到输入框（边说边出字）
- 松开：自动停止录音，转写文本可编辑或直接发送
- **MVP 实现**：先做"按住 → 录音 → 松开转写后填入输入框"，不做完全 voice-only 工作流

**4. 启动动画（Splash）**

- 黑屏 → 中心出现一个 cyan 圆点 → 向外脉冲扫开 → 露出 PLUG logo（约 1s）→ logo 周围浮现一圈 HUD 装饰元素 → 淡入启动页
- 配低频 bass + 升频的开机音
- 跳过：按任意键可跳过启动动画

### 7.8 设计陷阱清单（必须避开）

实现时反复 check 以下红线：

1. **不要做"主题切换"** —— Plug 没有"普通模式"。整个产品就是机甲模式。提供主题选项会摧毁品牌一致性。
2. **HUD 装饰不能阻碍可读性** —— 所有装饰元素 opacity ≤ 60%，主内容 100% 清晰。
3. **不要堆砌动效** —— 所有动效必须对应实际信息变化。装饰性动画一律砍掉。
4. **不要用色彩单独传达状态** —— 必须配图标 / 形状（色弱友好）。
5. **长时间使用要柔和** —— PM 一天 8 小时，主区文字对比度不要拉满。`text-primary` 用 `#E5F2FF` 而不是纯白。
6. **不要游戏化** —— 不要做"等级"、"经验"、"成就徽章"这类元素。Plug 是工作工具不是游戏。
7. **WebGL 慎用** —— 除非真的有 3D 全息需求，否则 2D + CSS + Canvas 已经够。WebGL 会让笔记本发热，PM 一天 8 小时用不了。
8. **音效不能扰人** —— 默认音量 30%，可静音。同一音效短时间内不重复触发。
9. **不要追逐每一个 sci-fi 风潮** —— Cyberpunk 的霓虹、Tron 的网格、Matrix 的代码雨——这些**都不要做**。Plug 的视觉锚点是"专业工作的机甲座舱"，不是"炫酷"。

### 7.9 视觉系统的实施分期

视觉系统会显著增加工程量。分两期落地：

**Phase 1（MVP, W1-W4）：基础 HUD**

- 配色 token、字体系统、深色基底
- 折角装饰、双线边框、几何项目符号
- Mission Panel 基础版本（无复杂动效）
- 5-8 个核心音效
- 数字滚动、状态色变化等基础动效
- **不做**：启动动画、语音输入、复杂粒子效果、拨杆样式开关

**Phase 2（视觉强化, W5-W8）：完整机甲化**

- 启动动画（splash）
- 语音输入完整流程（whisper.cpp 集成）
- Plan/Execute 拨杆样式
- 同步率数值动态视效、能量蓄能动画
- 完整音效库（30+ 音效）
- 粒子背景、数据流动效

**Phase 1 末要达到的视觉标准**：截图发给任何人，对方能立刻说出"这是个未来感的工具"，而不是"这是另一个 ChatGPT 客户端"。

---

## 8. 模版系统

### 8.1 模版位置

- 内置模版（应用打包随附）：`{app-resources}/templates/`
- 用户自定义模版（Phase 2）：`~/.plug/templates/`

### 8.2 模版结构

```
templates/product-dev/
├── template.json              # 模版元信息（label、description、icon）
├── manifest.template.json     # 项目 manifest 模版（含变量占位符）
├── rules.md                   # 默认 rules.md
└── structure/                 # 项目初始文件
    ├── 00-home.md             # 含 {{projectName}} 等占位符
    ├── 01-purpose.md
    ├── 02-prd/
    │   └── _index.md
    └── ...
```

变量占位符语法用 `{{varName}}`，初始化时由代码替换。

### 8.3 内置模版（MVP 只需 1 个，2-3 个理想）

| ID | 描述 | Sections |
|------|------|---------|
| `product-dev` | 产品开发 | home, purpose, prd, design, code, knowledge, deliverables |
| `content-creation` | 内容创作 | home, purpose, topics, drafts, published, assets, analytics |
| `general` | 通用最小项目 | home, purpose, notes, deliverables |

**MVP 阶段至少要有 `product-dev`。**

### 8.4 新建项目流程

1. 用户点 "+ 新建项目"
2. 选模版（含预览图）
3. 填项目名
4. 选磁盘位置（默认 `~/Documents/Plug/`）
5. 选默认模型（dropdown 从配置好的 model connector 中选）
6. （可选）填 git remote URL（仅产品开发模版）
7. 系统：拷贝模版 structure → 替换变量 → 生成 `.plug/` → 写入 `~/.plug/projects.json`
8. 自动打开项目，进入工作界面

**整个流程 < 30 秒。**

---

## 9. 模型 Connector

### 9.1 支持的模型（MVP）

至少接入 1 个（**DeepSeek 优先**），结构上支持任意 OpenAI-compatible 端点：

- DeepSeek（`deepseek-chat`、`deepseek-reasoner`）
- 通义千问 Qwen（`qwen-max`、`qwen3-coder`）
- 智谱 GLM（`glm-4-plus`）
- Kimi（`kimi-k2-...`）
- 火山豆包（`doubao-...`）
- 本地 Ollama（`http://localhost:11434/v1`）

### 9.2 配置结构

`~/.plug/config.json`：

```json
{
  "modelConnectors": [
    {
      "id": "deepseek-default",
      "label": "DeepSeek",
      "baseURL": "https://api.deepseek.com/v1",
      "apiKey": "{local:v1 encoded}",
      "models": ["deepseek-chat", "deepseek-reasoner"]
    }
  ]
}
```

API key 存在 Plug 本地配置文件中（`local:v1` 编码格式，不使用 macOS Keychain / Electron `safeStorage`）。**渲染进程永远不接触明文 key**。

---

## 10. Phase 2 高级特性（对标 Alma 基线）

> **MVP 不做，但 spec 必须先写明**——这些是 Plug 在 Phase 2（W5-W16）必须达到 Alma 同等水平的能力。**MVP 阶段的架构设计必须为这些特性预留扩展位**，否则 Phase 2 会陷入大规模重构。

### 10.1 MCP 集成（W5-W6）

> **对标**：Alma 支持第三方 MCP servers，扩展工具与数据源。

**核心要求**：

- 用户在设置里配置任意 MCP server（stdio / Streamable HTTP 两种 transport）
- MCP 服务器暴露的 tools 自动注入到 agent 的 tool registry（见 §6.4）
- 工具调用时遵循 aiWrite 等级（MCP tool 默认 `confirm`，可在 manifest.json 调）
- 一个 MCP server 可在多个项目复用（全局配置 + 项目级 enable/disable）
- 提供 MCP server 健康检查（连接状态、可用 tools 数量）

**Plug 优先集成的国产工具 MCP（合作 / 自建）**：

- 飞书 MCP（文档读写、群消息、日历）
- 企业微信 MCP（消息、文档、审批）
- 语雀 MCP（知识库读写）
- PingCode / Worktile MCP（项目管理 / Jira 类）
- Coding / Gitee MCP（代码托管）

国内 MCP 生态薄弱，**Plug 团队需要自建上述至少 2 个 MCP server 作为示范集成**——这是 Plug 面向中国市场的关键护城河。

### 10.2 Semantic Memory（W7-W8，增强 memory.md）

> **对标**：Alma 用 semantic embeddings 自动检索跨对话的相关上下文，远比纯 markdown memory 准确。

**MVP 的 markdown memory.md 不够用**，长项目运行几周后：

- memory.md 会膨胀到几千行
- LLM 每次读全文 → token 成本爆炸
- 不相关的旧记忆会污染当前 context

**Phase 2 增强方案**：

- 引入 SQLite + sqlite-vss（轻量本地向量库），不引外部服务
- memory.md 作为人类可读的"备份层"保留
- AI 每次写入 memory 时同时生成 embedding 存入向量库
- agent loop 在 context builder 阶段（§6.3）按当前 user message 做 semantic search，只注入 top-k 相关 memories（而不是 memory.md 全文）
- 新增 `search_memory(query, topK)` tool 让 AI 主动检索

**Embedding 模型选择**：

- 默认用 `bge-small-zh-v1.5`（本地运行，中文友好，384 维）
- 用户可在设置里切换：本地 bge / Voyage API / OpenAI embeddings / 阿里 text-embedding-v3
- 本地 embedding 用 transformers.js 或者 Rust binding，避免依赖 Python

**memory.md 仍保留**：

- 人类可读、可备份、可手改
- 是 ground truth；向量库是索引层，可重建

### 10.3 Artifacts & Preview（W9-W10）

> **对标**：Alma 的 Artifacts 系统能实时渲染 HTML / React / Mermaid / SVG / 可交互代码。

**Plug 的 Artifact 类型**：

| 类型 | 触发 | 渲染位置 |
|------|------|----------|
| Mermaid 图 | AI 输出 ` ```mermaid ` 块 | 右栏 / 对话流内联 |
| SVG 图形 | AI 输出 SVG | 右栏 / 对话流内联 |
| HTML 预览 | AI 调用 `create_artifact('html', ...)` | 右栏独立 tab，含 iframe sandbox |
| React 组件预览 | AI 调用 `create_artifact('react', ...)` | 右栏 iframe + esbuild 编译 |
| 数据表格 | AI 调用 `create_artifact('table', csvData)` | 右栏内联交互表格 |
| 流程图 / 状态机 | Mermaid 扩展 | 同上 |

**关键设计**：

- Artifact 保存到项目的 `06-deliverables/` 或 `02-prd/` 等 section（根据 AI 判断或用户指定）
- 用户可以"导出"为独立文件（HTML / SVG / PNG）
- HTML / React artifact 在 sandbox iframe 里运行，**禁止访问 Plug 主进程 / 文件系统**
- React 编译用 esbuild-wasm（浏览器内编译，不需要 Node sidecar）

**对 PM 场景的价值**：原型线框、流程图、状态机这些 PM 高频需求，可以让 AI 直接生成 Mermaid 或 SVG，比文字描述效率高一个量级。

### 10.4 Prompt Apps（W11）

> **对标**：Alma 的 Prompt Apps 让用户做"可复用 prompt 模版 + 自定义输入字段 + 模型 / 工具配置 + 快捷键"。

**Plug 的 Prompt App 定义**：

```ts
type PromptApp = {
  id: string;
  name: string;              // "写用户故事"、"竞品分析"
  description: string;
  icon: string;
  shortcut?: string;         // 全局快捷键，如 Cmd+Shift+U
  inputs: Array<{            // 自定义输入字段
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'file';
    required: boolean;
    placeholder?: string;
  }>;
  promptTemplate: string;    // 含 {{inputId}} 占位符
  preferredModel?: string;
  enabledTools: string[];
  outputSection?: string;    // 输出归档到哪个 section
};
```

**举例：PM 高频 Prompt Apps**（Phase 2 内置）：

| Prompt App | 输入字段 | 输出归档 |
|-----------|---------|---------|
| 写用户故事 | feature name, user role | 02-prd/user-stories.md |
| 竞品分析 | competitor name, scope | 05-knowledge/competitors/ |
| 写 release notes | version, key changes | 06-deliverables/ |
| 复盘 5 Whys | problem statement | 05-knowledge/retros/ |
| 用户访谈大纲 | persona, research goal | 05-knowledge/interviews/ |

**UI**：在中栏输入框旁边有 `⚡ Apps` 按钮，弹出 Prompt App 选择器；或者通过快捷键直接触发。

### 10.5 Skills 系统（W12-W13）

> **对标**：Alma 的 Skills 系统支持三层（personal / project / marketplace），且**兼容 Claude Code skills 格式**。

**Plug 的 Skills**：

- 文件夹结构遵循 Anthropic skills 标准：`SKILL.md` + 资源文件
- 三层加载：
  - **Personal**：`~/.plug/skills/` 跨项目可用
  - **Project**：项目的 `.plug/skills/` 仅本项目
  - **Marketplace**（Phase 3）：从 marketplace 安装
- agent 启动时按当前项目上下文加载相关 skills 到 context
- **关键：直接复用 Claude Code 已有的 skills 生态**——把用户 `~/.claude/skills/` 也作为来源（用户可在设置里启用）

**Skill 定义示例**（`SKILL.md` frontmatter）：

```yaml
---
name: writing-prd
description: 标准化 PRD 撰写流程，含模版、检查项、必备 sections
triggers:
  - "写 PRD"
  - "新需求文档"
  - "draft PRD"
applicableSections: [prd]
---

# Writing PRD Skill

When the user asks to write a PRD, follow these steps:
1. ...
```

**与项目模版的关系**：

- **项目模版**：定义项目的**结构骨架**（哪些 sections、哪些文件、rules.md）
- **Skills**：定义**做某类任务的方法论**（写 PRD 怎么写、做竞品分析怎么做）
- 一个项目模版可以默认绑定一组推荐 skills

### 10.6 Chrome Browser Relay（W14-W15，对标 Alma 的差异化武器）

> **对标**：Alma 通过 Chrome Extension + CDP（Chrome DevTools Protocol）+ WebSocket 接管用户**真实** Chrome 浏览器，带登录态、cookies、扩展。这是 Alma 的差异化武器之一。

**为什么需要**：

- 内置 Playwright（§6.4）只能开"干净的" Chromium，**没有用户登录态**
- 用户想让 AI 操作"我已经登录的飞书 / 内网 Jira / 公司邮箱"必须用真实 Chrome
- 这对 PM 场景极有价值（让 AI 帮你看 Jira、整理飞书消息、抓 GA 数据）

**架构**：

```
Plug Renderer → Plug Main (WebSocket server) ↔ Chrome Extension (CDP client) → Chrome Tab
```

**实现要点**：

- Plug 发布配套 Chrome Extension（独立 repo，通过 Web Store 分发）
- 主进程开 WebSocket server（localhost:23001 或类似）
- Extension 通过 `chrome.debugger` API 控制当前 tab
- AI 通过新增 `browser_*` 系列 tool 操控

**安全要求**：

- WebSocket 连接需要 auth token（Plug 启动时生成，extension 配置时手输）
- 默认只允许 `localhost` 连接
- 用户必须显式启用某个 tab 才能被 AI 控制（不能后台静默）
- 所有浏览器操作都进 Mission Panel + 操作日志，可审计

### 10.7 Extended Thinking / Reasoning 模式

> **对标**：Alma 支持启用模型的 extended thinking（如 Claude 的 thinking、DeepSeek Reasoner、OpenAI o-series）。

**Plug 的实现**：

- 用户在 Plan 模式下可勾选"启用深度思考"
- agent loop 调 LLM 时传 `reasoning_effort` 或对应模型参数
- thinking trace 在对话流里可折叠显示（默认折叠）
- token 计费分两部分显示（thinking tokens / output tokens）
- 某些模型（DeepSeek Reasoner / o3）天然支持，某些模型需要 prompt engineering 模拟

**MVP 不做**，但 §6.3 context builder 已经为 reasoning 留了扩展位。

---

## 11. MVP 范围（4 周）

> **MVP 的 agent 能力目标：达到 Alma 的核心子集**。20+ tools 不要求 MVP 全实现，但**架构必须支持后续扩展到 20+**。下列任务里凡标 ⚓ 的都是 Alma 对标的关键能力，省了就达不到基线。

### Week 1

- [ ] Electron + Vite + React + TS 项目脚手架
- [ ] IPC 框架（zod 校验的 channel 系统）
- [ ] **建立 design tokens 系统**（colors / fonts / spacing / motion easing，见 §7.1-7.2）
- [ ] 启动页 UI（含基础 HUD 装饰：折角、双线边框、菱形项目符号）
- [ ] 项目列表持久化（`~/.plug/projects.json`）
- [ ] 新建项目向导（含 `product-dev` 模版）
- [ ] 在磁盘正确创建项目文件夹结构
- [ ] ⚓ **网络层基础**：HTTP / SOCKS5 代理配置 UI + 全局生效（见 §6.7）

### Week 2

- [ ] 项目工作界面三栏布局（HUD 顶栏 + 三栏主区 + 底部状态栏）
- [ ] 左栏 section 导航（基于 manifest）+ 仪表盘元素（⬢ MCP / Token / Model 占位显示）
- [ ] 右栏文档查看器：Milkdown 渲染 + 切换编辑/只读
- [ ] 点 section → 右栏显示对应 `_index.md` 或文件
- [ ] 右栏可折叠 + 宽度可调
- [ ] **基础 UI 音效接入**（5-8 个核心音效，见 §7.5）
- [ ] ⚓ **键盘快捷键骨架**：Cmd+N / Cmd+, / Cmd+B / Cmd+\ / Cmd+T / Cmd+K（命令面板雏形）（见 §6.9）
- [ ] ⚓ **Provider 管理 UI**：增删改 provider（支持 OpenAI-compat + Anthropic 两种类型，配 baseURL + apiKey + models 列表）
- [ ] ⚓ **Tool Model 配置**：在设置里单独配置 Tool Model（见 §6.6）

### Week 3

- [ ] 中栏 AI 对话主区 UI（含 streaming 视觉反馈：边框脉冲呼吸）
- [ ] 接入 Vercel AI SDK
- [ ] 接 DeepSeek（model connector 配置流程 + 调用）
- [ ] 单 session：对话流跑通（无 tool calling）
- [ ] 对话历史保存到 `.plug/sessions/`
- [ ] Session 切换器（支持新建、切换；不支持删除）
- [ ] **数字滚动、状态色变化等基础动效**（Framer Motion）
- [ ] ⚓ **文本 streaming 实现**：LLM 输出逐字流到 UI（见 §6.8）
- [ ] ⚓ **双模型架构落地**：Chat Model 用于主对话，Tool Model 自动生成 session 标题（见 §6.6）
- [ ] ⚓ **Retry + Timeout**：网络错误自动重试 3 次（指数退避），单次调用 60s timeout（见 §6.7）

### Week 4

- [ ] Agent loop：tool calling 接通（基于 Vercel AI SDK）
- [ ] ⚓ **Tool Registry 模式**：tools 通过 registry 注册，不是 hardcode 列表（见 §6.4）
- [ ] ⚓ **实现 10 个 core tools**：`read_file`、`list_section`、`propose_edit`、`create_file`、`delete_file`、`update_index`、`update_memory`、`web_search`、`web_fetch`、`run_command`（见 §6.4）
- [ ] ⚓ **Playwright 内置 Chromium**：build 阶段安装到 app 资源，主进程检测 + 启动（见 §10.6 的简化版，用于 web_search / web_fetch）
- [ ] ⚓ **Tool Stream UI**：tool call 状态实时显示在对话流（▶ STARTING / ⏳ RUNNING / ✓ 完成 / ✗ 失败 + 耗时）（见 §6.8）
- [ ] **Mission Panel 基础版本**（任务执行时展示步骤列表 + PAUSE/OVERRIDE/ABORT，见 §7.6）
- [ ] **底部状态栏实时显示任务状态**
- [ ] Diff 视图（右栏显示 AI 提议）+ 接受/拒绝
- [ ] **高风险操作的全屏决策弹窗**（见 §7.7）
- [ ] `memory.md` 和 `rules.md` 自动注入
- [ ] Plan / Execute 模式切换（MVP 用 segmented control，拨杆样式 Phase 2）
- [ ] 端到端 demo 跑通（见 §13 验收标准）
- [ ] **视觉验收**：W4 末截图发给非技术朋友，能立即说出"未来感的工具"
- [ ] ⚓ **Agent 能力验收**：W4 末用 Plug 完成"PRD 草稿 + 抓一次竞品 + 整合到 _index.md"完整链路，体验不输 Alma 同等场景

### 关于 Alma 对标的注意事项

- **不要求 MVP 实现 20+ tools**，但 §6.4 的 tool registry 架构必须落地，能用一行代码注册新 tool。
- **不要求 MVP 集成 MCP**，但 tool registry 要预留 MCP tools 的注入位置（namespace、aiWrite 等级、按 server 启停）。
- **不要求 MVP 做 semantic memory**，但 §6.3 context builder 的接口要预留 `searchMemory(query)` hook，Phase 2 接 embeddings 时不重写。
- **不要求 MVP 做 Artifacts**，但 Markdown 渲染要支持 Mermaid（这是 Artifacts 的最小子集，写 PRD 时立刻有用）。

---

## 12. Phase 1 之外（不做）

以下功能在 MVP **明确不做**。括号内是计划阶段；详细规格见 §10。

**Agent / 集成类**：

- MCP 集成（§10.1，W5-W6）
- Semantic Memory / embeddings（§10.2，W7-W8）
- Artifacts & Preview 完整套件（§10.3，W9-W10）—— **MVP 仅支持 Mermaid 渲染**
- Prompt Apps（§10.4，W11）
- Skills 系统（§10.5，W12-W13）
- Chrome Browser Relay（§10.6，W14-W15）
- Extended Thinking / Reasoning 模式 UI（§10.7，W5+）
- 知识库导入（飞书、Notion、Obsidian 等，W6+，作为 MCP 形态实现）
- Provider Fallback Chain 自动切换（§6.7，W5+）—— MVP 只做错误降级提示

**项目 / 模版类**：

- 多模型 connector UI 完整版（DeepSeek 之外 provider 的 UI，W5+）
- 其他项目模版（W5+，MVP 只有 product-dev）
- 自定义模版（W7+）
- 自定义 section（W7+）
- 多 session 并发执行（W5+）

**视觉 / 交互类**：

- 启动动画 splash（W5+，Phase 2 视觉强化）
- 语音输入完整流程（whisper.cpp 集成 W5+）
- Plan/Execute 拨杆样式（W5+，MVP 用 segmented control）
- 同步率 / 能量蓄能等高级动效（W5+）
- 粒子背景、数据流动效（W5+）
- 完整 30+ 音效库（MVP 只做 5-8 个核心音效）

**协作 / 商业化类**：

- 团队协作 / 多人（Phase 2）
- 私有化部署 / 离线运行（Phase 3）
- AI Marketplace（Phase 3）

**永远不做**：

- 明亮主题 / 主题切换（Plug 只有机甲深色一种形态）
- 移动端

**实现 agent 不要主动建议或实现这些功能。** 遇到 Phase 2 功能的需求时，引用 §10 对应小节，但**不要开始实现**。

---

## 13. 验收标准

W4 末，**两个端到端 demo 都跑通**才算 MVP 完成。

### Demo A — 基础项目工作流（产品功能验收）

1. 启动应用 → 启动页 → 点 "+ 新建项目"
2. 选 `product-dev` 模版 → 项目名 "登录系统重构" → 选磁盘位置 → 完成
3. 项目打开，中栏空对话，右栏自动显示 `00-home.md`
4. 输入："帮我写一个登录流程的 PRD，包含手机号 + 验证码 + 第三方登录三种方式"
5. AI 处于 Plan 模式，回复列出计划（创建 `02-prd/login.md`，写入三种方式需求）
6. 用户切到 Execute 模式，输入 "执行"
7. AI 调用 `propose_edit` 创建 `02-prd/login.md`，右栏自动切换显示 diff
8. 用户点 [接受]，文件写入磁盘
9. AI 调用 `update_index` 更新 `02-prd/_index.md`
10. AI 调用 `update_memory` 写入 "已完成登录流程初版 PRD"
11. 用户点 "+ Session" 新建 session，命名 "design discussion"
12. 新 session 输入："针对刚才写的登录 PRD，给出 UI 设计建议"
13. AI 应能从 `memory.md` 知道 PRD 已写，调用 `read_file` 读 `02-prd/login.md`，给出设计建议

### Demo B — Agent 能力对标 Alma（基线验收）

**核心目标：在同样的任务下，Plug 的 agent 体验不输 Alma。**

在 Demo A 的同一个项目里继续：

1. 用户输入："去看看微信、支付宝、抖音的登录方式，做个竞品分析放到 05-knowledge/competitors/ 里"
2. AI 进入 Plan 模式，列出 plan：搜索三家登录方式 → 抓取关键页面 → 整合成对比文档
3. 用户切 Execute → "执行"
4. AI 串行调用：`web_search("微信登录方式")` → `web_fetch(url)` → `web_search("支付宝登录方式")` → ... 共 6-9 次 tool calls
5. **Tool Stream UI 实时展示每个 tool call**：状态、耗时、返回内容摘要（参考 §6.8）
6. **Mission Panel 显示全部 planned steps 和当前进度**
7. AI 把结果整合后调用 `create_file('05-knowledge/competitors/login-methods.md', ...)`
8. 用户点 [接受] 写入文件
9. AI 调用 `update_index('knowledge')` 更新知识库索引
10. AI 调用 `update_memory` 记录关键发现
11. **新 session：用户输入 "总结一下我们项目当前的核心决定"**
12. AI 通过 `read_file` 读 `memory.md`，准确说出"已完成登录 PRD（手机号 / 验证码 / 三方）+ 完成三家竞品分析（微信 / 支付宝 / 抖音）"
13. **过程中触发一次网络错误**（人为关掉网络再开）—— 系统自动 retry 3 次并显示状态，最终成功

### 验收门槛

- Demo A 13 步 + Demo B 13 步全部跑通才算 MVP 完成
- **Demo B 是与 Alma 的能力 baseline 对标**。如果做完后用 Alma 跑同样任务体验明显更好（速度、稳定性、tool 多样性、UI 反馈），说明 §6.4-6.9 没落地到位，必须返工。
- 视觉验收：截图发给非技术朋友，能立即说出"未来感的工具"
- 性能验收：冷启动 < 3s（不含模型 API 延迟）、切换 session < 100ms、tool 调用面板更新 < 50ms 延迟

---

## 14. 应用源码结构

```
plug/
├── package.json
├── electron.vite.config.ts
├── electron/
│   ├── main.ts                    # Electron 主进程入口
│   ├── ipc/                       # IPC handlers
│   │   ├── index.ts
│   │   ├── project.ts             # 项目 CRUD
│   │   ├── file.ts                # 文件读写
│   │   ├── git.ts                 # git 操作
│   │   ├── ai.ts                  # AI 调用代理
│   │   └── config.ts              # 全局配置
│   ├── services/
│   │   ├── project-service.ts
│   │   ├── template-service.ts
│   │   ├── memory-service.ts
│   │   ├── session-service.ts
│   │   └── agent-service.ts       # agent loop
│   ├── tools/                     # AI tool 实现
│   │   ├── index.ts
│   │   ├── read-file.ts
│   │   ├── list-section.ts
│   │   ├── propose-edit.ts
│   │   ├── update-index.ts
│   │   └── update-memory.ts
│   └── utils/
│       ├── crypto.ts              # API key 加密
│       └── paths.ts
├── renderer/
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── Launcher.tsx           # 启动页
│   │   └── Workspace.tsx          # 项目工作界面
│   ├── components/
│   │   ├── SectionNav.tsx         # 左栏
│   │   ├── ConversationMain.tsx   # 中栏 AI 对话
│   │   ├── DocumentViewer.tsx     # 右栏文档
│   │   ├── DiffPanel.tsx          # 右栏 diff 视图
│   │   ├── SessionSwitcher.tsx
│   │   ├── ModelSelector.tsx
│   │   ├── ModeSwitch.tsx         # plan/execute
│   │   ├── NewProjectWizard.tsx
│   │   └── MarkdownEditor.tsx     # Milkdown 封装
│   ├── stores/                    # Zustand
│   │   ├── project.ts
│   │   ├── session.ts
│   │   ├── ui.ts                  # 右栏折叠状态等
│   │   └── config.ts
│   └── lib/
│       ├── ipc-client.ts          # IPC 调用封装（类型安全）
│       └── markdown.ts
├── shared/                        # 主/渲染共享
│   ├── types.ts                   # 全部类型定义
│   ├── ipc-schema.ts              # zod schemas
│   └── tool-schema.ts
├── templates/                     # 内置模版（打包到 app 资源）
│   ├── product-dev/
│   │   ├── template.json
│   │   ├── manifest.template.json
│   │   ├── rules.md
│   │   └── structure/
│   ├── content-creation/
│   └── general/
└── README.md
```

---

## 15. 约定与风格

### 15.1 命名

- 文件名 kebab-case
- 内部 section id 用英文 kebab-case（`prd`、`code-cache`）
- section label 允许中文（显示用）
- TypeScript 类型用 PascalCase，函数 camelCase
- IPC channel 用点号分隔（`project.create`、`file.read`）

### 15.2 TypeScript 风格

- strict 模式开启
- **零 `any`**（用 `unknown` + 类型守卫）
- 主/渲染进程通信的所有 payload 用 zod 校验
- 所有 AI tool 的输入输出用 zod schema

### 15.3 错误处理

- 文件操作错误：UI 显示明确信息，不静默吞
- AI 调用错误：作为系统消息显示在对话流里
- 网络错误：retry 一次，再失败提示用户
- 主进程未捕获异常：弹窗 + 写入 `~/.plug/logs/`

### 15.4 性能

- 项目文件 > 100 时左栏用虚拟滚动
- markdown > 10KB 时懒加载渲染
- 主进程禁止做重计算（用 worker_threads 或推到渲染层）
- AI 调用全程 streaming，UI 实时显示生成内容

### 15.5 安全

- API key 使用 Plug 本地配置文件的 `local:v1` 编码格式存储，不使用 macOS Keychain / Electron `safeStorage`
- 渲染进程永远不接触明文 key（通过 IPC 代理 AI 调用）
- `run_command` tool 默认禁用，需用户在 settings 显式开启
- 文件读写限定在项目目录内，禁止跨项目访问

### 15.6 设计风格

- 整体风格：克制、信息密度高、深浅主题都要支持
- 字体：UI 用系统默认（Inter / PingFang SC），代码用等宽（JetBrains Mono / SF Mono）
- 圆角：6-8px
- 主色：先用一个中性蓝（`#3B82F6` 之类），后续可调
- 不要花哨动画，只在必要的状态过渡上加 200ms 缓动

---

## 16. 实现顺序建议

实现 agent 按以下顺序进行，每步完成后跑通再下一步：

1. **W1-Day 1-2**：脚手架 + 启动页静态 UI
2. **W1-Day 3-4**：IPC 框架 + 项目列表持久化
3. **W1-Day 5-7**：新建项目向导 + 模版拷贝逻辑（含 1 个内置模版）
4. **W2-Day 1-3**：工作界面三栏布局（先静态数据）
5. **W2-Day 4-5**：左栏 section 导航 + manifest 读取
6. **W2-Day 6-7**：右栏文档查看器（Milkdown 集成）
7. **W3-Day 1-2**：模型 connector 配置 UI + 加密存储
8. **W3-Day 3-5**：AI 对话主区 + Vercel AI SDK 接 DeepSeek（先无 tool）
9. **W3-Day 6-7**：Session 切换器 + 历史持久化
10. **W4-Day 1-3**：实现 5 个 core tool + agent loop
11. **W4-Day 4-5**：Diff 视图 + 接受/拒绝流程
12. **W4-Day 6**：memory.md / rules.md 自动注入 + plan/execute 模式
13. **W4-Day 7**：跑完 §13 验收 demo，修 bug

---

## 17. 给实现 Agent 的提示

**通用约束：**

- **不要扩大范围。** 本文档 §12 列了"不做"清单，遇到这些功能直接跳过。
- **不要重新设计架构。** 文件结构、布局、tool 列表已定，不要"优化"成别的形态。
- **遇到歧义先列方案，不要凭直觉选。** 把可选方案列出，问用户。
- **AI tool 必须用 zod 校验输入输出。** 不校验的 tool 不算实现完成。
- **每个 PR / 提交跑一次 §13 验收 demo。** 跑不通的代码不要 merge。
- **不要引入未列出的依赖。** 需要新依赖时先在 PR 里说明理由。
- **`memory.md` 写入是关键路径。** 多 session 共享记忆的承诺靠它兑现，不要简化。
- **不要为"以后扩展"做抽象。** 当前 spec 描述的是 MVP，过度抽象会拖慢交付。

**视觉系统的红线（实现时反复 check §7.8）：**

- **不要用 shadcn/ui 的默认视觉。** 可以用 Tailwind 但全部 override 成机甲风。`bg-blue-500` 这类默认颜色一律禁止。
- **所有颜色必须来自 §7.1 的 design tokens。** 渲染层不能出现硬编码的色值。
- **不要做主题切换。** Plug 只有一种视觉形态——机甲深色。任何"明亮模式"建议都拒绝。
- **不要堆砌动效。** 每个动效必须对应实际的信息变化或状态过渡，纯装饰动画一律砍掉。
- **Mission Panel 是核心 HUD 组件**（§7.6），不能做成简单 todo list。step 状态 / current 标记 / 控制按钮三件套缺一不可。
- **音效不是后期补丁，是 Week 2 任务。** 没有音效的机甲 UI 是死的，必须 MVP 就接入。
- **不要追逐每一个 sci-fi 风潮。** Cyberpunk 霓虹、Tron 网格、Matrix 代码雨——这些都不要做。锚点是"专业工作的机甲座舱"，不是炫酷。
- **WebGL / 3D 慎用。** 没有明确指令前一律用 2D + CSS + Canvas。
- **数字必须用 tabular nums。** token 计数、百分比、ETA 这些跳动的数字不能让宽度变化。
- **截图测试**：W4 末必须截图发给非技术朋友，能立刻说出"这是个未来感的工具"才算视觉验收通过。

**Agent 能力的红线（对标 Alma 基线，反复 check §6 与 §10）：**

- **Plug 的 agent 能力基线是 Alma。** 验收时拿 Demo B（§13）和 Alma 跑同样任务对比，体验明显逊色就要返工。"功能跑通"不是验收标准，"体验对得起机甲座舱定位"才是。
- **Tool registry 必须是动态的，不是 hardcode**（见 §6.4）。MVP 实现 10 个，但加第 11 个时不应该改 agent loop 的代码。
- **双模型架构（Chat Model + Tool Model）从 Week 3 就要落地**（见 §6.6）。不要把所有调用都打给 Chat Model 然后说"以后再分"——那"以后"就不会发生。
- **Streaming + Tool Stream UI 是核心交互**（见 §6.8）。把 tool 调用做成"等结果返回再显示"是错误实现，必须流式。
- **Playwright 必须 build 阶段安装到 app**（见 §10.6 提到的 Alma 模式）。不要让用户首次使用时 npm install。
- **网络层（proxy + retry + timeout）是 Week 1 任务，不是后期补丁**（见 §6.7）。面向中国用户没有这层产品直接挂。
- **Memory 系统要为 Phase 2 的 semantic search 预留 hook**（见 §6.3 与 §10.2）。MVP 的 markdown memory 不要写成无法扩展的样子。
- **Tool registry 的 namespace 设计要预留 MCP**（见 §10.1）。MCP tool 在 Phase 2 注入时不应该和 core tool 冲突。
- **遇到 Phase 2 功能的实现请求时**，引用 §10 对应小节告知"已规划但 MVP 不做"，**不要私下偷偷实现一部分**。半成品比没做更糟。
- **不要 fork Cline / Roo Code / OpenClaw 的代码** 作为基础。这些可作为参考，但 Plug 必须从 Vercel AI SDK 直接起步，保持代码库整洁。
- **不要直接用 Pi（earendil-works/pi）库** 替代 Vercel AI SDK。Pi 是个好项目但生态没 Vercel AI SDK 成熟，且和 Alma 验证过的技术栈不一致——保持和 Alma 同栈降低未来对比的不确定性。

---

**End of Spec**
