# Plug

> 机甲座舱风的桌面 AI 产品工作台 —— 一个会用产品方法论、能直接落地文档的 AI 搭档。

Plug 是一个 Electron 桌面应用:你和一个统一人格的 AI 搭档「Plug」并肩推进产品项目。它不是一个聊天框,而是一个**工作仓**——把调研、PRD、设计、知识沉淀组织成结构化的项目文档,让 AI 直接读写、用框架分析、产出带图表的网页文稿,并能驱动真实浏览器、接入外部工具。

---

## 核心理念

- **项目 = 结构化工作仓**。每个项目由若干 *section* 组成(主页 / 项目目的 / PRD / 设计 / 代码 / 知识仓库 / 交付物 / 分析),各自是 Markdown 文件或文件夹,带自动维护的索引。
- **AI 是搭档,不是工具**。单一人格(`PLUG_PERSONA`)贯穿所有模型调用;它敢拍板、主动干活、不甩选择题。
- **会用方法论**。内置 ~100 个产品框架(RICE / Kano / JTBD / 用户旅程 / 商业模式画布 / AARRR …),按用户处境**自动触发**,把框架套到真实项目上并产出可视化分析。
- **能真正落地**。研究/文档/PRD 直接写进项目文件树、刷新索引、在侧栏渲染(PRD/分析为带样式的 HTML,含 Mermaid 图)。

---

## 主要能力

| 能力 | 说明 |
|---|---|
| **意图路由** | 每条消息先分类 `chat`(闲聊/拿主意,无工具,简洁对话)还是 `work`(干活,走带工具的 orchestrator);招呼、纯打开文档等走确定性快路径。 |
| **文档系统** | 文档带 front-matter(`.md` 用 YAML,`.html` 用注释块);section 索引是带标题/摘要/标签/状态/日期的富目录,递归子目录。 |
| **HTML PRD / 分析** | PRD 与框架分析存为自包含 HTML:封面、自动目录、亮/暗主题、Mermaid 流程图,以及 callout / 优先级徽章 / KPI 卡 / 时间轴 / 2×2 矩阵 / 画布九宫格等组件。 |
| **产品框架库** | 99 个框架被生成为可自动触发的 skill(`~/.plug/skills/`),匹配用户诉求即注入用法,产出落到「分析」区。 |
| **浏览器 Relay** | 通过 Chrome 扩展 + CDP 驱动真实浏览器标签:导航、截图、取文本、点击、输入。 |
| **MCP 集成** | 通过 Model Context Protocol 接外部服务(飞书、Jira、GitHub 等)。 |
| **多 Provider** | OpenAI 兼容网关与 Anthropic;按路径分配推理强度(闲聊/分类/确认用 `minimal`,orchestrator 用 `low`,保留 Anthropic 扩展思考)。 |

---

## 快速开始

前置:Node.js(建议 ≥ 20)。

```bash
npm install
npm run dev        # 启动 Electron 应用(electron-vite)
```

首次启动后,在 **Settings** 里配置模型 Provider(OpenAI 兼容网关的 baseURL + API Key,或 Anthropic)。配置保存在 `~/.plug/config.json`(API Key 经系统钥匙串加密)。

其它命令:

```bash
npm run typecheck  # tsc 校验(主进程 + 渲染端)
npm run build      # 生产构建(electron-vite build)
npm run preview    # 预览构建产物
npx vitest run     # 跑单元测试
```

---

## 安装产品框架库

框架以「个人 skill」形式安装,对所有项目生效:

```bash
node scripts/generate-framework-skills.mjs
# → 在 ~/.plug/skills/ 生成 99 个框架 skill + 1 个框架库索引
```

数据源 `scripts/pm-frameworks.json`(整理自 pmframe.works)。生成的 skill 文件不入库,改数据/生成器后重跑即可重建。

---

## 架构

```
electron/                 主进程(Node)
  services/               核心逻辑
    ai-service.ts         聊天入口:路由 → orchestrator → 工具/收尾
    work-classifier.ts    chat/work 分类(轻量 LLM,招呼走 regex 短路)
    conversation-service  无工具的对话通道(闲聊/拿主意)
    persona.ts            单一人格 PLUG_PERSONA(贯穿所有模型调用)
    agent-crew.ts         orchestrator 工具集 + 专职 specialist 子代理
    relay-service.ts      浏览器 Relay 的 WebSocket 服务器(:23001)
    skill-service.ts      按 query 加载相关 skill(框架库就在这里触发)
    workspace-service.ts  项目/section/文档 读取
    config-service.ts     Provider/模型配置 + 密钥
  tools/                  agent 工具(文件、浏览器、写文档、框架渲染…)
    write-document.ts     直接落盘 + 索引 + 侧栏打开(PRD/分析为 HTML)
    document-metadata.ts  front-matter 解析(.md / .html 统一)
    update-index.ts       生成 section 富目录
    prd-template.ts       HTML 文档模板 + 组件 CSS + PRD 写作规则
  ipc/                    渲染端 ↔ 主进程 的 IPC

renderer/                 React 渲染端(Vite)
  pages/Workspace.tsx     工作界面(聊天 + 文档面板)
  pages/Launcher.tsx      启动/项目选择
  hooks/useChatScroll.ts  生产级聊天滚动(粘底/分页)
  components/             Markdown 渲染、HUD 组件等

shared/                   主进程与渲染端共享的类型 / Zod schema
chrome-extension/         浏览器 Relay 扩展(offscreen WebSocket + SW 走 CDP)
templates/                新建项目的模板(product-dev:section 结构)
scripts/                  PM 框架数据 + skill 生成器
plug-design/              视觉设计资源(mockup / tokens / 图标)
```

### 聊天管线(一条消息怎么走)

```
消息 → [快路径? 如"打开XX文档" → 直接 open_document]
     → classify(chat / work)
         chat → 对话通道(无工具,简洁,带近期历史)
         work → orchestrator(带工具 + delegate_* 专职代理)
                 ├─ 直连技能:open_document / write_document
                 ├─ 框架 skill 自动注入(匹配用户处境)
                 └─ 收尾:动作类用工具 summary 直接确认(省一次模型调用)
```

设计要点:**人格是全局不变量**(路由决定「做什么」,人格决定「我是谁」);**动作确认走结构而非求模型简洁**(无工具 + token 上限);**轻路径用确定性短路与低推理**以压低延迟。

---

## 项目在磁盘上的样子

```
<project>/
  .plug/manifest.json     section 定义 + 模型配置
  00-home.md              主页(状态 + 最近文档索引)
  01-purpose.md           项目目的
  02-prd/                 PRD(.html,带样式)+ _index.md 富目录
  03-design/  04-code/  05-knowledge/  06-deliverables/
  07-analysis/            框架分析产物(.html)
```

---

## 浏览器 Relay 简述

`chrome-extension/` 是一个 MV3 扩展:`offscreen.js` 持有到 Plug 的 WebSocket(`ws://127.0.0.1:23001`),`background.js`(Service Worker)通过 Chrome DevTools Protocol 执行命令。改动扩展后需在 `chrome://extensions` 重新加载(已内置 `onInstalled` 时刷新 offscreen 文档)。

---

## 设计资源

视觉参考(mockup、W3C design tokens、SVG 图标)在 [`plug-design/`](./plug-design/) 与 `Plug-Mockup.html` / `plug-tokens.json`;产品与技术 spec 见 `Plug-Spec.md`、`Plug-Design-Brief.md`。
