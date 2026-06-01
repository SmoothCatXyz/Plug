# Plug — Visual Design Brief

> **用途**：给 designer 和 Claude Code 的视觉实现 brief，独立于主 spec。
> 主 spec 的 §7 是"为什么这么做"，本文档是"具体怎么做"。
> 所有数值、token、命名、文件路径都可以直接复制到代码。

---

## 0. 总览：Design DNA

**一句话**：钢铁侠 J.A.R.V.I.S. UI 的信息架构 × EVA 初号机座舱的情感张力 × 星际争霸 2 终端的几何秩序。

**核心 DNA**：

| 维度 | 选择 |
|------|------|
| 主色调性 | 深空蓝黑 + 电青蓝（cyan accent） |
| 情绪 | 专业、克制、有压迫感（不松弛、不亲民） |
| 信息密度 | 高（向 Bloomberg Terminal 看齐，不是 ChatGPT） |
| 几何语言 | 折角 + 双线 + 菱形 + 六边形（不用圆角软语言） |
| 动效哲学 | 服务信息变化，不为美而美 |
| 音效 | 一等公民，每个关键交互必有声 |

**绝对不做**：

- ❌ Material Design 风的卡片阴影、柔和圆角
- ❌ shadcn/ui 默认视觉
- ❌ 任何明亮色 / 浅色模式
- ❌ Cyberpunk 霓虹粉紫、Tron 蓝绿网格、Matrix 代码雨
- ❌ 游戏化元素（等级、徽章、成就）

---

## 1. 色彩系统

### 1.1 主色板（CSS Variables）

```css
:root {
  /* ─── 背景层级（深色基底）─── */
  --bg-void:        #05080D;  /* 最深，整个 app 底色 */
  --bg-panel:       #0A0E14;  /* 主要 panel 底色 */
  --bg-elevated:    #11161F;  /* 浮层、Mission Panel、modal */
  --bg-overlay:     #1A2230;  /* 最高层级（dropdown、tooltip） */

  /* ─── 边框系统 ─── */
  --border-subtle:  rgba(255, 255, 255, 0.04);  /* 极弱分隔 */
  --border-default: #1F2937;                    /* 默认分割线 */
  --border-strong:  #2D3B4F;                    /* 强调边框 */
  --border-accent:  #00D9FF;                    /* HUD 装饰、激活态 */
  --border-glow:    rgba(0, 217, 255, 0.4);     /* 发光边框（用于聚焦） */

  /* ─── 功能色（信号灯，严格分工）─── */
  --accent-cyan:    #00D9FF;  /* J.A.R.V.I.S. 蓝 — 主交互、品牌 */
  --accent-cyan-dim:#0099B8;  /* 弱化 cyan，用于 hover/disabled */
  --accent-amber:   #F59E0B;  /* 等待、AWAITING、需用户决策 */
  --accent-red:     #FF3B30;  /* 错误、危险、EVA 应急 */
  --accent-red-dim: #B82D24;  /* 弱化 red */
  --accent-green:   #10F4B1;  /* 完成、健康、连通 */
  --accent-violet:  #9D5CFF;  /* Plan 模式、AI 思考中 */

  /* ─── 文字色 ─── */
  --text-primary:   #E5F2FF;  /* 主文本（注意：不是纯白，长时阅读舒适） */
  --text-secondary: #7B8EA3;  /* 次要文本 */
  --text-muted:     #4A5868;  /* 弱化文本 */
  --text-hud:       #00D9FF;  /* HUD 标签（全大写 + tracking） */
  --text-on-accent: #05080D;  /* 在 accent 色背景上的文字 */

  /* ─── 状态背景（用于内联高亮）─── */
  --status-running: rgba(0, 217, 255, 0.08);
  --status-waiting: rgba(245, 158, 11, 0.08);
  --status-error:   rgba(255, 59, 48, 0.08);
  --status-success: rgba(16, 244, 177, 0.08);

  /* ─── 透明度系统 ─── */
  --alpha-decorative: 0.6;    /* HUD 装饰最大透明度，不能再高否则压制主内容 */
  --alpha-disabled:   0.35;
  --alpha-overlay-bg: 0.85;   /* modal 背景遮罩 */
}
```

### 1.2 颜色使用规则

**严格不允许**：

- ❌ 渲染层任何硬编码色值（`color: #fff` / `bg-red-500` / `style={{color:'red'}}`）
- ❌ 用 Tailwind 默认色板（`bg-blue-500`、`text-gray-400`）
- ❌ 给同一种"状态"用多种色（例如错误既用红又用橙）
- ❌ accent 色用作大面积背景（cyan/amber/red 都是高对比信号色，大面积会刺眼）

**正确用法**：

- ✅ 通过 Tailwind 自定义配置映射到 CSS vars：`bg-void`、`text-primary`、`border-accent`
- ✅ 状态色只在小面积出现（按钮、图标、边框、文字、徽章）
- ✅ Hover 态用 `--accent-cyan-dim`，不用调透明度

### 1.3 Tailwind 配置（直接复制）

```ts
// tailwind.config.ts
export default {
  theme: {
    extend: {
      colors: {
        void: 'var(--bg-void)',
        panel: 'var(--bg-panel)',
        elevated: 'var(--bg-elevated)',
        overlay: 'var(--bg-overlay)',
        'border-subtle': 'var(--border-subtle)',
        'border-default': 'var(--border-default)',
        'border-strong': 'var(--border-strong)',
        'border-accent': 'var(--border-accent)',
        cyan: {
          DEFAULT: 'var(--accent-cyan)',
          dim: 'var(--accent-cyan-dim)',
        },
        amber: { DEFAULT: 'var(--accent-amber)' },
        red: {
          DEFAULT: 'var(--accent-red)',
          dim: 'var(--accent-red-dim)',
        },
        green: { DEFAULT: 'var(--accent-green)' },
        violet: { DEFAULT: 'var(--accent-violet)' },
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        hud: 'var(--text-hud)',
      },
    },
  },
}
```

---

## 2. 字体系统

### 2.1 字族定义

```css
:root {
  /* 中文 UI：信息显示主力 */
  --font-cn-ui: "MiSans", "HarmonyOS Sans SC", "PingFang SC", system-ui, sans-serif;

  /* 中文标题：几何感强，有重量感 */
  --font-cn-display: "MiSans Heavy", "HarmonyOS Sans SC Bold", "PingFang SC Semibold", sans-serif;

  /* 英文 UI */
  --font-en-ui: "Inter", "SF Pro Text", system-ui, sans-serif;

  /* 英文 HUD 标题：科幻几何感 */
  --font-en-display: "Orbitron", "Rajdhani", "Inter", sans-serif;

  /* 等宽：数值、代码、HUD 标签 */
  --font-mono: "JetBrains Mono", "SF Mono", "Consolas", monospace;

  /* 全局字体栈（中英混排）*/
  --font-default: var(--font-cn-ui);
  --font-display: var(--font-cn-display);
}
```

### 2.2 字号阶梯（紧凑型，信息密度优先）

```css
:root {
  --text-hud:   10px;  /* HUD 标签，全大写 + letter-spacing: 0.1em */
  --text-xs:    11px;  /* 状态文字、辅助信息 */
  --text-sm:    13px;  /* 次要 UI */
  --text-base:  14px;  /* 主文本（比常规小 2px，提升密度） */
  --text-lg:    16px;  /* 强调 */
  --text-xl:    20px;  /* 区块标题 */
  --text-2xl:   28px;  /* 项目名、页面大标题 */
  --text-display: 40px;/* 启动页 PLUG 大标 */
}
```

### 2.3 字重

```css
:root {
  --weight-light:    300;
  --weight-regular:  400;
  --weight-medium:   500;  /* 多数 UI 默认 */
  --weight-semibold: 600;  /* 强调、区块标题 */
  --weight-bold:     700;  /* HUD 标签、大标题 */
}
```

### 2.4 关键文字风格 preset

| 用途 | font | size | weight | letter-spacing | text-transform |
|------|------|------|--------|----------------|----------------|
| HUD 标签 | `--font-mono` | 10px | 700 | 0.1em | uppercase |
| Section 名（左栏） | `--font-cn-ui` | 13px | 500 | 0 | none |
| 对话主文本 | `--font-default` | 14px | 400 | 0 | none |
| AI 回复标题 | `--font-default` | 13px | 600 | 0.02em | none |
| Tool 调用名 | `--font-mono` | 12px | 500 | 0 | none |
| 数值（token / 延迟） | `--font-mono` | 11px | 500 | 0 | none（tabular-nums） |
| 顶栏项目名 | `--font-display` | 14px | 600 | 0.05em | none |
| 启动页 PLUG | `--font-en-display` | 40px | 700 | 0.2em | uppercase |
| 模态标题 | `--font-cn-display` | 16px | 600 | 0.05em | none |

### 2.5 数字渲染规则

**所有动态数字（token 计数、延迟、ETA、百分比、SYNC 数值）必须**：

```css
.numeric {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "zero" 1;
}
```

理由：tabular-nums 让数字宽度固定，避免数字跳动时整行抖动。

### 2.6 字体加载策略

- 中文字体（MiSans）：从 CDN（jsdelivr）加载，或打包到 app resources
- 英文 Inter：打包，约 200KB（subset 后 80KB）
- Orbitron：仅 display 用，单独按需加载
- JetBrains Mono：subset 后 50KB，打包
- **不要**走 Google Fonts CDN（国内访问慢）

---

## 3. 间距与尺寸系统

### 3.1 间距 token（4px 基准）

```css
:root {
  --space-1:  4px;
  --space-2:  8px;
  --space-3:  12px;
  --space-4:  16px;
  --space-5:  20px;
  --space-6:  24px;
  --space-8:  32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
}
```

### 3.2 圆角（克制）

```css
:root {
  --radius-none: 0;
  --radius-sm:   2px;   /* 输入框、按钮 */
  --radius-md:   4px;   /* 卡片、面板 */
  --radius-lg:   6px;   /* 弹窗 */
  /* 不要更大的圆角，机甲不是软糖 */
}
```

### 3.3 关键布局尺寸

| 元素 | 尺寸 |
|------|------|
| 顶栏（HUD bar） | 高度 48px |
| 底部状态栏 | 高度 32px |
| 左栏 nav | 宽度 220px（固定） |
| 右栏文档查看器 | 宽度 380px（默认）、可拖拽 320-560px |
| 中栏（自适应） | 至少 480px |
| 输入框区域 | 高度 ≥ 80px，自动撑高最多 200px |
| Mission Panel | 最小宽度 360px，浮在中栏对话流中 |
| 决策弹窗 modal | 宽度 480px，居中 |
| Section 列表项 | 高度 32px |
| Tool call 行 | 高度 24px（紧凑模式）/ 36px（展开模式） |
| Session 切换器 dropdown | 宽度 240px |

### 3.4 边框粗细

```css
:root {
  --border-thin:    1px;   /* 默认 */
  --border-medium:  1.5px; /* HUD 折角 */
  --border-thick:   2px;   /* 决策弹窗、focus ring */
  --border-double:  3px;   /* 双线总宽（外1+空1+内1） */
}
```

### 3.5 阴影（极少使用）

```css
:root {
  /* 机甲风格不用大块阴影；只用 glow 表达高度 */
  --glow-cyan:  0 0 12px rgba(0, 217, 255, 0.25);
  --glow-amber: 0 0 12px rgba(245, 158, 11, 0.25);
  --glow-red:   0 0 12px rgba(255, 59, 48, 0.3);
  --glow-green: 0 0 12px rgba(16, 244, 177, 0.25);

  /* 仅用于 modal 等需要确实抬升的层 */
  --shadow-modal: 0 16px 64px rgba(0, 0, 0, 0.8);
}
```

---

## 4. HUD 装饰元素

### 4.1 折角装饰（◢◣）

**用途**：每个一级 panel 的左上角和右下角各一个，是机甲风的核心标识。

**实现方式**：SVG 内联，**不用 emoji 字符**（不同系统渲染差异大）。

```html
<!-- 左上角折角 -->
<svg width="14" height="14" class="absolute top-0 left-0" viewBox="0 0 14 14">
  <path d="M 0 14 L 0 0 L 14 0" stroke="var(--border-accent)"
        stroke-width="1.5" fill="none" />
</svg>

<!-- 右下角折角 -->
<svg width="14" height="14" class="absolute bottom-0 right-0" viewBox="0 0 14 14">
  <path d="M 14 0 L 14 14 L 0 14" stroke="var(--border-accent)"
        stroke-width="1.5" fill="none" />
</svg>
```

**变体**：

- 默认：cyan 边框
- Active panel：cyan + glow（用 `--glow-cyan` filter）
- Warning panel：amber
- Error panel：red

### 4.2 双线边框

```css
.hud-panel {
  position: relative;
  border: 1px solid var(--border-default);
  /* 内层用 inset shadow 模拟内层线 */
  box-shadow: inset 0 0 0 1px var(--bg-panel),
              inset 0 0 0 2px var(--border-default);
}
.hud-panel.active {
  border-color: var(--border-accent);
  box-shadow: inset 0 0 0 1px var(--bg-panel),
              inset 0 0 0 2px var(--border-accent),
              var(--glow-cyan);
}
```

### 4.3 几何符号清单（全部用 SVG 或 Unicode）

| 符号 | Unicode | 用途 |
|------|---------|------|
| ◆ | U+25C6 | Section 项目符号、激活态 |
| ◇ | U+25C7 | Section 未激活、装饰菱形 |
| ● | U+25CF | 当前 active section、运行中状态点 |
| ○ | U+25CB | 待执行步骤 |
| ⬢ | U+2B22 | 仪表盘指标（MCP / Token / Model） |
| ⬡ | U+2B21 | 仪表盘空态 |
| ▶ | U+25B6 | Tool call 行起始 |
| ▼ | U+25BC | 折叠展开指示 |
| ▲ | U+25B2 | 折叠收起指示 |
| ✓ | U+2713 | 完成 |
| ✗ | U+2717 | 失败 |
| ⏳ | U+23F3 | 等待中（用 SVG 替代，emoji 不稳定） |
| ⚠ | U+26A0 | 警告（用 SVG 替代） |
| ━ | U+2501 | 实体水平分隔线 |
| ═ | U+2550 | 双线水平分隔线 |
| ◢◣ | U+25E2 U+25E3 | 折角装饰（仅作 ASCII mockup 参考，实际用 SVG） |

**重要**：所有 emoji（⏳ ⚠ 🎤 ⚙️ 等）在 designer 给的最终 mockup 里都必须替换为定制 SVG 图标，否则不同 OS 渲染会破坏一致性。

### 4.4 仪表盘指标（左栏底部）

```
⬢ MCP        ⬢ TOKEN       ⬢ MODEL
3/5 ACT      23k/64k       142ms
```

**结构**：

- 顶行：`⬢` 图标 + 标签（HUD 字体，全大写）
- 底行：数值（mono + tabular-nums）
- 三个一组横向，或纵向堆叠
- 数值变化时用 §6.5 的数字滚动动效

### 4.5 角落能量符号

每个主 panel 的四角可以有一个细微的"接口装饰"——一个 4×4px 的发光小圆点或 L 形。**非必须**，但 Phase 2 时加上能显著提升机甲质感。

---

## 5. 关键组件视觉规范

### 5.1 顶栏（HUD Bar）

```
高度：48px
背景：var(--bg-panel)
底边：1px var(--border-default)
内边距：horizontal 16px

布局（从左到右）：
[◢ PLUG ◣]  [PROJECT: 项目名]  [SYNC: 87%]   ...  [模型 ▼]  [模式 ▼]  [⚙]
```

- `◢ PLUG ◣`：品牌标识，cyan，固定宽度 100px
- 项目名：`--font-display`，可点击切换项目
- SYNC 值：mono + tabular，cyan 数字 + 灰色单位，每 5 秒微跳一次
- 模型 / 模式选择器：自定义 dropdown，**不用 native select**
- 设置图标：32×32px hit area，icon 18×18px

### 5.2 左栏（Section Nav）

```
宽度：220px（固定）
背景：var(--bg-panel)
右边：1px var(--border-default)
内边距：vertical 12px, horizontal 8px

每个 section 项：
高度：32px
内边距：horizontal 12px
内容：◆ [section name]    ●（active 时）
hover: bg = var(--bg-elevated)
active: bg = var(--bg-elevated) + ◆ 变 cyan + 右侧 1px cyan 竖条
```

### 5.3 中栏（AI 对话主区）

```
背景：var(--bg-void)
内边距：horizontal 24px, vertical 16px

Session 切换器（顶部）：
高度：36px
[当前 session ▼]              [+ NEW]
分隔线：◇━━━━━━━━━━━━◇（cyan，opacity 0.4）

消息流（中部）：
用户消息：> 内容（cyan 引导符 + primary 文本）
AI 响应：▼ AI RESPONSE · streaming...（HUD 标签 + 内容块）
Tool call 行：▶ TOOL: name ✓ [12ms]（mono 字体，紧凑高 24px）

输入框（底部）：
高度：≥ 80px（auto-grow）
背景：var(--bg-elevated)
边框：1px var(--border-default)，focus 时变 var(--border-accent) + glow
内部：[输入框] + [🎤 语音按钮] + [↵ 发送]
placeholder：var(--text-muted)
```

### 5.4 右栏（DOC VIEWER）

```
宽度：380px 默认（可拖 320-560px）
背景：var(--bg-panel)
左边：1px var(--border-default)

顶部 tab 栏（如果有多文件）：
高度：32px
当前文件：var(--text-primary) + 底部 2px cyan 下划线

文档内容区：
内边距：20px
markdown 渲染样式见 §5.7

底部 action bar：
高度：36px
[EDIT] [COPY] [EXPORT...]
```

### 5.5 Mission Panel（任务面板，核心组件）

```
位置：浮在中栏对话流中，AI 执行任务时显示
最大宽度：360px（不超过中栏宽度的 80%）
背景：var(--bg-elevated)
边框：双线 cyan
四角：折角装饰 + 微 glow
内边距：16px

结构：
╔══════════════════════════════════════╗
║ ◢ MISSION: [任务标题]                ║   ← HUD 字体 + cyan
║   STATUS: EXECUTING · ETA 2m 30s    ║   ← mono + tabular
║ ─────────────────────────────────── ║   ← 1px cyan opacity 0.3
║   ✓ [01] 步骤 1（已完成）            ║   ← green
║   ✓ [02] 步骤 2（已完成）            ║   ← green
║   ▶ [03] 当前步骤 ← CURRENT          ║   ← cyan 呼吸
║     ├─ 子状态实时更新                ║   ← muted
║     └─ Token: 1.2k / 8k             ║   ← mono
║   ○ [04] 待执行                      ║   ← muted
║   ○ [05] 待执行                      ║
║ ─────────────────────────────────── ║
║   [PAUSE]  [OVERRIDE]  [ABORT]      ║   ← 三个按钮，等宽
╚══════════════════════════════════════╝
```

**状态符号**：

- `✓` 完成：var(--accent-green)
- `▶ ... ← CURRENT`：var(--accent-cyan) + 呼吸动画（opacity 0.6 → 1.0，1.5s 循环）
- `○` 待执行：var(--text-muted)
- `⚠` 等待审批：var(--accent-amber)
- `✗` 失败：var(--accent-red)

**按钮**：

- `[PAUSE]`：amber 边框 + amber 文字
- `[OVERRIDE]`：cyan 边框 + cyan 文字
- `[ABORT]`：red 边框 + red 文字

### 5.6 决策弹窗（高风险操作）

```
背景遮罩：var(--bg-void) + alpha 0.85
modal 容器：
  宽度：480px
  居中
  背景：var(--bg-elevated)
  边框：2px var(--accent-amber)，呼吸（amber opacity 0.6 → 1.0）
  圆角：6px
  阴影：var(--shadow-modal)
  四角：折角装饰（amber 色）

内容：
┌────────────────────────────────────────┐
│  ⚠  REQUIRES PILOT AUTHORIZATION       │  ← HUD 字体，amber，居中
│  ─────────────────────────────────     │
│                                        │
│  AI proposes:                          │  ← secondary
│  propose_edit("02-prd/login.md")       │  ← mono, primary
│                                        │
│  Reason: ...                           │  ← primary，多行可滚动
│                                        │
│  [View Diff →]                         │  ← cyan 链接
│                                        │
│  ─────────────────────────────────     │
│                                        │
│    [ Y ] APPROVE      [ N ] REJECT     │  ← 大按钮，键盘提示
│                                        │
└────────────────────────────────────────┘
```

**按钮**：

- APPROVE：cyan 填充背景 + var(--text-on-accent) 文字 + `Y` keycap
- REJECT：red 边框 + red 文字 + `N` keycap

**键盘提示样式**（keycap）：

```css
.keycap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--bg-overlay);
  border: 1px solid var(--border-strong);
  border-radius: 3px;
  box-shadow: inset 0 -1px 0 var(--border-default);
}
```

### 5.7 Markdown 渲染样式

```css
.markdown {
  font-family: var(--font-default);
  font-size: 14px;
  line-height: 1.65;
  color: var(--text-primary);
}
.markdown h1 { font-size: 24px; font-weight: 600; margin: 24px 0 12px; color: var(--text-primary); border-bottom: 1px solid var(--border-default); padding-bottom: 8px; }
.markdown h2 { font-size: 20px; font-weight: 600; margin: 20px 0 10px; }
.markdown h3 { font-size: 16px; font-weight: 600; margin: 16px 0 8px; }
.markdown code { font-family: var(--font-mono); font-size: 13px; background: var(--bg-elevated); padding: 2px 6px; border-radius: 2px; color: var(--accent-cyan); }
.markdown pre { background: var(--bg-elevated); border: 1px solid var(--border-default); border-radius: 4px; padding: 12px; overflow-x: auto; }
.markdown pre code { background: transparent; padding: 0; color: var(--text-primary); }
.markdown a { color: var(--accent-cyan); text-decoration: underline; text-underline-offset: 2px; }
.markdown blockquote { border-left: 2px solid var(--accent-cyan); padding-left: 12px; color: var(--text-secondary); margin: 12px 0; }
.markdown table { border-collapse: collapse; margin: 12px 0; width: 100%; }
.markdown th, .markdown td { border: 1px solid var(--border-default); padding: 6px 12px; }
.markdown th { background: var(--bg-elevated); font-weight: 600; }
.markdown ul, .markdown ol { padding-left: 24px; margin: 8px 0; }
.markdown li { margin: 4px 0; }
```

### 5.8 启动页（Launcher）

```
全屏背景：var(--bg-void)
中心 logo 区：
  PLUG（40px，Orbitron，cyan，letter-spacing 0.2em）
  下方：SYSTEM ONLINE（10px HUD，cyan dim）

新建项目按钮（突出）：
  宽度：360px，高度：48px
  背景：var(--bg-elevated)
  边框：2px var(--accent-cyan) + glow
  内容：◆ INITIALIZE NEW MISSION（HUD 字体 + cyan）
  hover：背景变 cyan dim，文字变 var(--bg-void)

最近项目列表：
  宽度：360px
  每项高度：56px
  布局：◆ [项目名]    STATUS · 时间
  hover：背景 var(--bg-elevated)

系统配置区（底部）：
  四个按钮横排：[PROVIDERS] [MCP] [PERSONAS] [PREFERENCES]
  按钮风格：cyan 边框 + cyan 文字，hover 反色
```

---

## 6. 动效系统

### 6.1 全局缓动曲线

```css
:root {
  --ease-out:    cubic-bezier(0.16, 1, 0.3, 1);    /* 默认 ease-out，sharp */
  --ease-in:     cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* 谨慎使用，机甲不弹跳 */
  --ease-linear: linear;
}
```

### 6.2 时长 token

```css
:root {
  --dur-instant: 80ms;   /* 瞬时反馈（按钮 click） */
  --dur-fast:    160ms;  /* 颜色变化、小幅移动 */
  --dur-base:    240ms;  /* 默认 UI 过渡 */
  --dur-medium:  400ms;  /* 面板进出、Mission Panel 展开 */
  --dur-slow:    600ms;  /* 主要切换 */
  --dur-splash:  1200ms; /* 启动动画 */
}
```

### 6.3 动效清单（完整版）

| 场景 | 触发 | 动画描述 | 时长 | 缓动 |
|------|------|----------|------|------|
| 按钮 click | mousedown | scale 1 → 0.97 → 1 + 背景 flash | 80ms | ease-out |
| 按钮 hover | mouseenter | 背景渐变 + 边框 glow | 160ms | ease-out |
| Section 切换 | click | 右栏内容 cross-fade + section 高亮滑动 | 240ms | ease-out |
| 应用启动 | app start | 中心 cyan 点 → 扫开 → logo 浮现 → HUD 展开 | 1200ms | ease-out |
| 项目打开 | 启动页 click | 启动页淡出 + 工作界面从底部滑入 | 600ms | ease-out |
| 项目关闭 | back to launcher | 工作界面分层收起 + 启动页淡入 | 400ms | ease-in |
| Session 切换 | session dropdown | 中栏内容左右滑（300px 内位移） | 240ms | ease-in-out |
| 数字滚动 | 数值变化 | 滚动到目标值，每位独立 | 400ms | ease-out |
| AI 开始响应 | LLM start | 输入框边框 cyan 脉冲呼吸（opacity 0.6 → 1） | 1500ms 循环 | ease-in-out |
| AI 思考中 | tool 调用前 | 顶栏 SYNC 数字快速跳动 | 200ms / 跳 | linear |
| Tool 调用中 | tool start | tool 行右侧出现横向数据流条 | 持续 | linear |
| Tool 成功 | tool success | 整行 cyan → green 渐变 + 短闪烁 | 300ms | ease-out |
| Tool 失败 | tool error | 整行 red 闪烁 2 次 | 600ms | ease-out |
| Mission Panel 出现 | 多步任务开始 | 高度从 0 展开到目标，folded 内容渐显 | 400ms | ease-out |
| Mission Panel 折叠 | 任务完成 | 高度收缩到一行摘要 | 300ms | ease-in |
| step 状态变化 | step complete | ○ → ▶ → ✓，颜色 muted → cyan → green | 200ms | ease-out |
| Plan/Execute 切换 | toggle | 主色调微变 + 边框色 + 短促音效 | 300ms | ease-in-out |
| 决策弹窗弹出 | high-risk action | scale 0.95 → 1 + 背景遮罩淡入 | 240ms | ease-out |
| 决策弹窗 alarm | 弹出 + 持续 | amber 边框 opacity 0.6 ↔ 1.0 | 1200ms 循环 | ease-in-out |
| 屏幕震动 | 高风险弹出 | translate ±2px 4 次 | 200ms | ease-out |
| 文档 diff 显示 | propose_edit | 旧内容左滑出 + 新内容右滑入 | 400ms | ease-out |
| 录音中 | 长按 Space | 输入框边缘 cyan 脉冲光晕 | 1000ms 循环 | ease-in-out |
| 错误 toast | error | 从顶部下滑 + 4s 后上滑消失 | 240ms / 240ms | ease-out |

### 6.4 禁用动效列表

❌ **不要做**：

- bounce / overshoot 弹性回弹（除非用 `--ease-spring`，且仅限装饰元素）
- 360° 旋转装饰
- 任何 > 1500ms 的循环动画（启动动画除外）
- parallax 视差
- 自动播放视频背景
- 鼠标跟随光标的特效

### 6.5 数字滚动实现

```tsx
import { useMotionValue, useTransform, animate } from "framer-motion";

function NumericTicker({ value }: { value: number }) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (v) => Math.round(v));

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1], // var(--ease-out)
    });
    return controls.stop;
  }, [value]);

  return <motion.span className="numeric">{rounded}</motion.span>;
}
```

### 6.6 关键 Framer Motion variants

```ts
// 面板进入
export const panelEnter = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1, y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
};

// Mission Panel 展开
export const missionPanelExpand = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: "auto", opacity: 1,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
};

// AI 边框呼吸
export const breathing = {
  animate: {
    opacity: [0.6, 1, 0.6],
    transition: { duration: 1.5, repeat: Infinity, ease: "easeInOut" },
  },
};

// 屏幕震动（决策弹窗）
export const shake = {
  shake: {
    x: [0, -2, 2, -2, 0],
    transition: { duration: 0.2, ease: "easeOut" },
  },
};
```

---

## 7. 音效系统

### 7.1 必备音效清单（Phase 1 MVP 至少 8 个）

| ID | 触发场景 | 特征 | 时长 | 音量基线 |
|----|----------|------|------|----------|
| `boot` | 应用启动 | 低频 bass + 升频扫频，有"开机感" | 1500ms | 35% |
| `project-open` | 项目打开 | 金属舱门关闭 thunk + 短促 cyan beep | 600ms | 30% |
| `ai-start` | AI 开始响应 | 电子蓄能声，渐起 | 400ms | 25% |
| `tool-success` | Tool 完成 | 短促高频 beep（800Hz, clean） | 80ms | 25% |
| `tool-error` | Tool 失败 | 低频 buzz（180Hz） | 200ms | 30% |
| `awaiting` | 需要审批 | 双短 alert tone（amber 警示） | 300ms | 35% |
| `alarm` | 高风险弹窗 | 红色 alarm 三连（紧迫但不刺耳） | 500ms | 40% |
| `session-switch` | Session 切换 | 金属滑动 swoosh | 250ms | 25% |

### 7.2 Phase 2 扩展音效（W5+）

| ID | 用途 |
|----|------|
| `mode-toggle-plan` | 切到 Plan 模式（低频拨杆 down） |
| `mode-toggle-execute` | 切到 Execute 模式（高频拨杆 up） |
| `step-complete` | Mission Panel 单步完成（细小 tick） |
| `sync-up` | SYNC 数值上升（短促升频） |
| `notification` | 后台任务完成提示 |
| `recording-start` | 开始录音（细 click） |
| `recording-end` | 结束录音（细 click） |
| `voice-detected` | 语音转写完成（清脆 chime） |
| `mcp-connected` | MCP 服务器连接成功 |
| `mcp-disconnected` | MCP 服务器断开 |
| `provider-fallback` | 切换备用 provider |
| `error-network` | 网络错误（低频 wob） |
| `confirm-y` | 决策弹窗按 Y |
| `reject-n` | 决策弹窗按 N |
| `hover-button` | 关键按钮 hover（极细微，慎用） |
| `tab-switch` | 右栏 tab 切换 |
| `panel-collapse` | 折叠面板 |
| `panel-expand` | 展开面板 |
| `dropdown-open` | dropdown 打开 |
| `text-stream` | 文本 streaming（极轻打字声，可选） |
| `task-complete` | 整个 mission 完成（带成就感的 chord） |
| `welcome` | 首次打开应用 |

### 7.3 音效引擎实现

```ts
// audio-service.ts
import { Howl } from "howler";

const AUDIO_BASE = "/audio";  // 打包到 app resources
const SFX = {
  boot: new Howl({ src: `${AUDIO_BASE}/boot.webm`, volume: 0.35 }),
  'project-open': new Howl({ src: `${AUDIO_BASE}/project-open.webm`, volume: 0.30 }),
  // ...
};

class AudioService {
  private volumeScale = 0.3;   // 用户全局音量（0-1）
  private muted = false;
  private lastPlayed = new Map<string, number>();
  private DEBOUNCE_MS = 100;   // 同音效 100ms 内不重复

  play(id: keyof typeof SFX) {
    if (this.muted) return;
    const now = Date.now();
    const last = this.lastPlayed.get(id) ?? 0;
    if (now - last < this.DEBOUNCE_MS) return;
    this.lastPlayed.set(id, now);

    const sound = SFX[id];
    sound.volume(sound.defaultVolume * this.volumeScale);
    sound.play();
  }

  setVolume(scale: number) { this.volumeScale = Math.max(0, Math.min(1, scale)); }
  setMuted(m: boolean) { this.muted = m; }
}

export const audio = new AudioService();
```

### 7.4 音效资源获取建议

1. **Sonniss GameAudioGDC 免费包**：每年 GDC 发布，包含 30GB+ 商用免费音效，必下。
2. **Side Effects [sci-fi UI](https://sideeffects.io)**：约 $50-200 能买到完整 sci-fi UI pack，质量稳定。
3. **Boom Library [Cinematic Tools](https://www.boomlibrary.com)**：用于 boot / project-open 等"大事件"音效。
4. **不要用 freesound.org 免费素材**：质量参差不齐，授权链路混乱。

### 7.5 音效格式

- 格式：webm（小、跨平台）+ mp3 fallback
- 采样率：48kHz
- 单声道（mono）即可，UI 音效不需要立体声
- 压缩后大小：单个 < 30KB，总包 < 1MB

### 7.6 音量与可访问性

- 默认全局音量 30%
- 设置里提供 0-100% slider
- 提供"静音"开关
- 提供"减少动效"开关（联动 prefers-reduced-motion）

---

## 8. 图标系统

### 8.1 图标库选型

**推荐组合**：

1. **Lucide React**（主力）—— [lucide.dev](https://lucide.dev)
   - 几何线条风格，与机甲调性匹配
   - 1400+ 图标，覆盖 90% 需求
   - tree-shakable，按需引入
2. **自定义 SVG**（特色补充，约 30-50 个）
   - HUD 装饰（折角、菱形接口、能量节点）
   - Plug 品牌图标
   - 机甲座舱仪表盘符号

**不用**：Material Icons、Heroicons（风格不符）、Emoji（渲染不一致）。

### 8.2 图标规格

| 尺寸 | 用途 |
|------|------|
| 12px | 状态点、超紧凑 UI |
| 16px | 行内图标（默认） |
| 18px | 顶栏 / 工具栏按钮 |
| 20px | section nav |
| 24px | 突出按钮、modal 标题 |
| 32px | 启动页等大型图标 |

**stroke-width**：默认 1.5px（lucide 默认 2px，需调）。

### 8.3 必备自定义图标清单

Designer 需要画的（30 个）：

- `plug-logo`（应用图标，方形 + 圆角，含 Entry Plug 元素）
- `plug-logo-wordmark`（横向 logo）
- `hud-corner-tl`、`hud-corner-tr`、`hud-corner-bl`、`hud-corner-br`（4 个折角）
- `hexagon-filled`、`hexagon-outline`（仪表盘六边形）
- `diamond-filled`、`diamond-outline`（菱形项目符号）
- `pulse-dot`（呼吸状态点）
- `mission-active`、`mission-paused`、`mission-aborted`
- `sync-up`、`sync-down`（同步率箭头）
- `voice-mic`（麦克风，机甲风）
- `voice-recording`（带波形）
- `power-cyan`、`power-amber`、`power-red`、`power-green`（四色能量符号）
- `eva-plug`（Entry Plug 装饰，仅用于品牌区）
- `model-cyan`、`tool-cyan`（双模型架构指示）
- `mcp-connected`、`mcp-disconnected`
- `section-icon-{home, purpose, prd, design, code, knowledge, deliverable}`（7 个 section 图标）

---

## 9. 启动动画 Storyboard

**总时长 1200ms**，分 4 帧：

```
T+0ms:    黑屏（var(--bg-void)）
T+200ms:  中心出现 4×4px cyan 圆点
T+400ms:  圆点向外扫开成同心圆（环厚 1px，cyan）
          ┌ 同时低频 bass 音效起 ┐
T+600ms:  环扩散至屏幕边缘并消失
          中心浮现 "PLUG" wordmark（40px Orbitron，cyan，opacity 0 → 1）
T+800ms:  PLUG 周围浮现 4 个折角装饰（依次淡入）
T+1000ms: 底部出现 "SYSTEM ONLINE"（HUD 字体，cyan dim，淡入）
          ┌ boot 音效升频结束 ┐
T+1200ms: 整个 splash 淡出（300ms ease-in），启动页淡入

跳过：按任意键直接跳到 T+1200ms 状态
```

---

## 10. 响应式与可访问性

### 10.1 最小窗口尺寸

- 宽度：1280px
- 高度：800px
- 小于此尺寸时显示"窗口太小"提示（不做响应式自适应——Plug 是桌面专业工具）

### 10.2 高分屏处理

- 所有 SVG 自动缩放（vector），无需特殊处理
- 字体在 retina 上自动锐化
- 1×、2×、3× DPR 都要测试

### 10.3 可访问性（必做项）

| 项目 | 要求 |
|------|------|
| 键盘导航 | 所有功能可纯键盘操作（见 §6.9） |
| Focus 可见 | 所有可聚焦元素 focus 时有 cyan 2px ring |
| 色盲友好 | 状态不能仅靠颜色区分（必配图标 / 形状） |
| 文本对比度 | text-primary on bg-panel ≥ 7:1（WCAG AAA） |
| Reduce motion | `prefers-reduced-motion: reduce` 时禁用循环动画 |
| 屏幕阅读器 | 所有交互元素有 aria-label |
| 字号放大 | 支持 OS 级字号放大（不写死像素） |

### 10.4 prefers-reduced-motion 处理

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /* 但保留功能性反馈，如 streaming 边框呼吸改为静态边框 */
  .ai-responding { border-color: var(--border-accent); }
}
```

---

## 11. Designer 交付物清单

Designer 完工时需要交付以下文件，作为开发 ground truth：

### 11.1 Figma 文件

```
Plug Design System.fig
├── 🎨 Foundations
│   ├── Colors (全套 tokens)
│   ├── Typography (字号字重示例)
│   ├── Spacing (间距标尺)
│   ├── Iconography (图标库)
│   └── Effects (glow / shadow 示例)
├── 🧩 Components
│   ├── Buttons (各种变体)
│   ├── Inputs
│   ├── Panels (含 HUD 折角)
│   ├── Mission Panel (各种状态)
│   ├── Decision Modal
│   ├── Tool Call Row (各状态)
│   ├── Section Nav Item
│   └── Top HUD Bar
├── 📱 Screens
│   ├── Launcher
│   ├── Workspace - Empty
│   ├── Workspace - Active Session
│   ├── Workspace - Mission Running
│   ├── Workspace - Decision Required
│   ├── Workspace - Plan Mode
│   ├── Workspace - Doc Viewer Collapsed
│   └── Settings (Providers / MCP / Personas)
├── 🎬 Animations
│   ├── Startup Splash (帧序列)
│   ├── Mission Panel Expand
│   ├── Decision Modal Entry
│   └── Tool Stream States
└── 🎨 Brand
    ├── App Icon (各尺寸)
    ├── Wordmark
    └── Splash Variations
```

### 11.2 导出资源

```
assets/
├── icons/
│   ├── lucide/      # 用到的 Lucide 图标的 SVG 副本（防止版本变化）
│   ├── custom/      # 自定义 SVG 图标，单文件，含 currentColor 支持
│   └── app/         # App icon 各尺寸（16/32/64/128/256/512/1024）
├── audio/
│   ├── boot.webm
│   ├── project-open.webm
│   ├── ai-start.webm
│   ├── tool-success.webm
│   ├── tool-error.webm
│   ├── awaiting.webm
│   ├── alarm.webm
│   └── session-switch.webm
├── fonts/
│   ├── MiSans/      # 中文字体子集（仅 GB2312 + 常用 + 英文数字）
│   ├── Inter/       # 英文 subset
│   ├── Orbitron/    # display 字体
│   └── JetBrainsMono/
└── splash/
    ├── splash-frames.json   # Lottie 文件
    └── splash-storyboard.png
```

### 11.3 设计 tokens 导出

`design-tokens.json`（W3C Design Tokens 格式）：

```json
{
  "color": {
    "bg": {
      "void": { "value": "#05080D" },
      "panel": { "value": "#0A0E14" }
    }
  },
  "spacing": { "1": { "value": "4px" } }
}
```

用 Style Dictionary 或 Tokens Studio 把这个 JSON 编译成 CSS variables / Tailwind config。

---

## 12. Claude Code 实现指南

如果是 Claude Code 直接做实现（无独立 designer），按以下顺序执行：

### 12.1 Day 1 任务

1. 用 `vite create` 起 Electron + React + TS 项目
2. 安装依赖：
   ```
   tailwindcss framer-motion howler lucide-react
   @milkdown/core @milkdown/preset-commonmark
   zustand
   ```
3. 把本文档 §1.1 的 CSS variables 全部写入 `src/styles/tokens.css`
4. 把本文档 §1.3 的 Tailwind config 写入 `tailwind.config.ts`
5. 把 §2 的字体配置接进 `index.html`
6. 创建 `src/styles/global.css` 含 body 默认样式：

```css
body {
  background: var(--bg-void);
  color: var(--text-primary);
  font-family: var(--font-default);
  font-size: var(--text-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
```

### 12.2 Day 2-3 任务

1. 创建 HUD 组件库：`src/components/hud/`
   - `<HUDPanel>` 含折角 + 双线边框
   - `<HUDCorner type="tl|tr|bl|br" color="cyan|amber|red">`
   - `<Keycap>` 键盘提示
   - `<NumericTicker>` 数字滚动
   - `<StatusDot status="running|complete|pending|error">`
2. 实现 `audio-service.ts`（§7.3）
3. 把 §7.1 的 8 个音效占位文件先放上（哪怕是从 Sonniss 包里随便挑的近似音）

### 12.3 Day 4+ 任务

按主 spec §11 的 W1-W4 节奏推进，所有 UI 必须从 HUD 组件库扩展，不允许写裸 div + className。

### 12.4 验收时的视觉自检清单

W4 末截图前自检：

- [ ] 主背景是否是 #05080D（最深，不是 #000）
- [ ] 没有任何 Tailwind 默认蓝（`text-blue-500` / `bg-blue-600` 等）
- [ ] 所有 panel 有折角装饰
- [ ] 所有数字使用 mono + tabular-nums
- [ ] HUD 标签全大写 + tracking
- [ ] 没有任何柔和的卡片阴影
- [ ] AI 响应时输入框边框有呼吸效果
- [ ] Tool call 行有状态颜色变化（cyan → green/red）
- [ ] Mission Panel 有完整的 step 状态指示
- [ ] 高风险操作弹出全屏 modal（不是小弹窗）
- [ ] 至少 5 个音效已生效
- [ ] 截图发给非技术朋友，能立即说出"未来感的工具"

---

## 13. 设计陷阱终极清单（再次强调）

### ⚠ 视觉陷阱

1. ❌ 圆角过大（> 8px）—— 机甲不是软糖
2. ❌ 卡片阴影 —— 用 glow 而不是 shadow
3. ❌ 渐变背景 —— 除了功能性 glow 不要用
4. ❌ 多种字体混用 —— 严格按 §2.1 字族分工
5. ❌ accent 色大面积铺 —— 信号色只小面积出现
6. ❌ 任何浅色主题预留 —— 一开始就排除可能性

### ⚠ 动效陷阱

1. ❌ 弹簧 / 弹跳 —— 机甲不弹
2. ❌ 旋转装饰 —— spinner 用线性扫描而非 spin
3. ❌ > 1.5s 的循环动画 —— 干扰工作
4. ❌ parallax / 鼠标跟随 —— 廉价 sci-fi 风
5. ❌ 装饰性 transitions —— 必须对应信息变化
6. ❌ 整页 slide-in transition —— 内容应原地切换

### ⚠ 音效陷阱

1. ❌ 默认音量 > 40% —— 工作场景不能扰人
2. ❌ 同音效短时间叠播 —— 必须 debounce
3. ❌ "机器人说话" 声效 —— 不是 sci-fi 玩具
4. ❌ 背景音乐 —— Plug 不是游戏
5. ❌ 长 > 1.5s 的 UI 音效 —— 卡操作流
6. ❌ 立体声 UI 音效 —— mono 即可

### ⚠ 信息架构陷阱

1. ❌ 用颜色单独表达状态（必须配图标 / 形状）
2. ❌ tooltip 替代正式 UI（关键信息要直接可见）
3. ❌ 隐藏可发现性差的快捷键（要有命令面板）
4. ❌ 弹窗叠弹窗（最多一层 modal）
5. ❌ 把 Plan 和 Execute 模式做得视觉差异不明显（必须 main color 微变）

---

## 14. 评审 Checklist（每次 PR / 周会用）

每周末过一遍：

**色彩**：
- [ ] 渲染层零硬编码色值（grep 检查 `#` 颜色）
- [ ] Tailwind 默认色板未被使用（`bg-blue-500` 等）

**字体**：
- [ ] 数字都用 tabular-nums
- [ ] HUD 标签都全大写 + tracking
- [ ] 没有混用 4+ 字族

**HUD 元素**：
- [ ] 主要 panel 有折角装饰
- [ ] active 状态的 panel 有 glow
- [ ] 状态点都有图标 + 颜色双指示

**动效**：
- [ ] 没有循环 > 1.5s 的动画
- [ ] AI streaming 边框有呼吸
- [ ] Tool 状态变化有过渡

**音效**:
- [ ] 至少 8 个核心音效已接入
- [ ] 默认音量 ≤ 35%
- [ ] 有静音开关
- [ ] 有 reduce-motion 适配

**可访问性**：
- [ ] 所有交互元素可键盘操作
- [ ] Focus ring 可见
- [ ] 文字对比度达 AAA

---

**End of Design Brief**

> 与主 spec 配合使用：
> - 主 spec `Plug-Spec.md` 定义"做什么"和"为什么这么做"
> - 本 brief 定义"具体怎么做"
> - 任何视觉决策冲突以本 brief 为准
