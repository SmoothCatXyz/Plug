# Plug Design Assets

机甲座舱风桌面 AI 工作仓 Plug 的视觉设计资源包。

## 文件说明

### `Plug-Mockup.html`
独立 HTML，浏览器直接打开。包含 5 个视图，用顶部切换器切换：
- **01 Launcher** — 启动页（无项目打开时）
- **02 Workspace · Executing** — 工作界面，Mission Panel 处于执行中状态
- **03 Workspace · Planning** — Plan 模式，整体调色变 violet
- **04 Workspace · Awaiting** — 任务暂停等待用户审批
- **05 Decision Modal** — 高风险操作的全屏决策弹窗（按 Y/N 或 Esc 关闭）

适合用作 designer 在 Figma 中复刻的视觉参考，或 Claude Code 实现前端时的 CSS 起点。

### `plug-tokens.json`
W3C Design Tokens 格式（[规范链接](https://design-tokens.github.io/community-group/format/)）。

导入方式：
- **Tokens Studio for Figma 插件**：直接 import → 自动生成 Figma Variables
- **Style Dictionary**：`style-dictionary build` 编译成 CSS / Sass / JS / Swift / Android XML
- **手工映射到 Tailwind**：参考 Plug-Design-Brief.md §1.3

### `icons/`
17 个自定义 SVG 图标，所有图标用 `currentColor`，可通过 CSS 色控制：

- `hud-corner-{tl,tr,bl,br}.svg` — 四个折角装饰
- `diamond-{filled,outline}.svg` — 菱形符号
- `hexagon-{filled,outline}.svg` — 仪表盘六边形
- `pulse-dot.svg` — 呼吸状态点
- `check.svg`, `cross.svg`, `play.svg`, `warning.svg` — 状态符号
- `plug-logo.svg` — Plug 品牌图标（Entry Plug 俯视意象）
- `voice-mic.svg`, `send.svg`, `settings.svg` — 工具图标

剩余 ~30 个自定义图标（section icons、power 符号、MCP 状态等）建议 designer 在 Figma library 里基于这套风格延伸完成。

## 后续步骤

1. 浏览器打开 `Plug-Mockup.html`，确认视觉方向
2. 把 `plug-tokens.json` 导入 Figma（用 Tokens Studio）
3. 把 `icons/` 拖进 Figma library
4. Designer 基于这三样资源，在 Figma 里复刻 mockup 的每个屏，并补齐剩余 30 个自定义图标
5. Designer 提交 Figma 文件后，开发用 Style Dictionary 把 tokens 编译成 CSS Variables，直接接入 Plug 项目

## 配套文档

- `Plug-Spec.md` — 产品 + 技术 spec
- `Plug-Design-Brief.md` — 视觉实现详细 brief（本资源包是它的配套交付物）
