import type { DocMeta } from "./document-metadata";

export interface PrdRenderOptions {
  theme?: "dark" | "light";
  /** Optional cover banner image URL; falls back to a gradient. */
  cover?: string;
}

/**
 * Wrap AI-authored PRD HTML in a polished, self-contained document with a cover,
 * auto table-of-contents, light/dark themes, Mermaid diagrams, and a rich set of
 * component classes (callouts, badges, KPI cards, timeline, steps, cards…). Plain
 * semantic HTML already looks good; the component classes (PRD_AUTHORING_GUIDE)
 * make it richer.
 */
export function renderPrdHtml(title: string, bodyHtml: string, meta: DocMeta, opts: PrdRenderOptions = {}): string {
  const theme = opts.theme === "light" ? "light" : "dark";
  const status = meta.status ?? "draft";
  const statusLabel = { draft: "草稿", "in-progress": "进行中", done: "已定稿" }[status] ?? status;
  const tags = (meta.tags ?? []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("");
  const bannerStyle = opts.cover
    ? ` style="background-image:linear-gradient(180deg,rgba(8,12,20,0.2),rgba(8,12,20,0.85)),url('${escapeAttr(opts.cover)}')"`
    : "";

  return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${PRD_CSS}</style>
</head>
<body data-theme="${theme}">
<button class="prd-theme-toggle" type="button" aria-label="切换主题">◐</button>
<div class="prd-shell">
  <header class="prd-cover">
    <div class="prd-cover__banner"${bannerStyle}></div>
    <div class="prd-cover__inner">
      <div class="prd-cover__badges"><span class="badge badge--status badge--${status}">${escapeHtml(statusLabel)}</span>${meta.updated ? `<span class="badge badge--muted">更新 ${escapeHtml(meta.updated)}</span>` : ""}</div>
      <h1 class="prd-cover__title">${escapeHtml(title)}</h1>
      ${meta.summary ? `<p class="prd-cover__summary">${escapeHtml(meta.summary)}</p>` : ""}
      ${tags ? `<div class="prd-cover__tags">${tags}</div>` : ""}
    </div>
  </header>
  <nav class="prd-toc" id="prd-toc"><div class="prd-toc__title">目录</div><ul></ul></nav>
  <main class="prd-doc"><div class="prd-body">
${bodyHtml}
  </div></main>
</div>
<script>${PRD_SCRIPT}</script>
</body>
</html>
`;
}

const PRD_CSS = `
:root {
  color-scheme: dark light;
  --accent: #4ea7ff; --p0: #ff6b6b; --p1: #ffb454; --p2: #5fd0a0; --p3: #8aa0b6;
  --ok: #5fd0a0; --warn: #ffb454; --info: #4ea7ff; --danger: #ff6b6b;
}
body[data-theme="dark"] {
  --bg: #0b0f16; --surface: #111927; --surface-2: #0e1622; --line: #1e2c3d;
  --line-soft: #17222f; --text: #d9e4f0; --muted: #8aa0b6; --banner: linear-gradient(135deg,#13243b,#0e1622 60%,#1a1330);
}
body[data-theme="light"] {
  --bg: #f6f8fb; --surface: #ffffff; --surface-2: #f1f5f9; --line: #e2e8f0;
  --line-soft: #eef2f6; --text: #1c2733; --muted: #5b6b7c; --banner: linear-gradient(135deg,#dCe9ff,#eef3fb 60%,#f3e9ff);
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, "PingFang SC", "Segoe UI", system-ui, "Microsoft YaHei", sans-serif;
  line-height: 1.75; -webkit-font-smoothing: antialiased; transition: background .2s, color .2s; }
.prd-shell { max-width: 900px; margin: 0 auto; padding: 0 28px 96px; }

/* Theme toggle */
.prd-theme-toggle { position: fixed; top: 14px; right: 16px; z-index: 20; width: 34px; height: 34px;
  border-radius: 999px; border: 1px solid var(--line); background: var(--surface); color: var(--muted);
  font-size: 16px; cursor: pointer; }
.prd-theme-toggle:hover { color: var(--accent); }

/* Cover */
.prd-cover { margin: 0 -28px 32px; }
.prd-cover__banner { height: 140px; background: var(--banner); background-size: cover; background-position: center; }
.prd-cover__inner { padding: 0 28px; margin-top: -40px; }
.prd-cover__badges { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.prd-cover__title { font-size: 34px; line-height: 1.25; margin: 0 0 12px; letter-spacing: -0.01em; }
.prd-cover__summary { font-size: 16px; color: var(--muted); margin: 0 0 14px; }
.prd-cover__tags { display: flex; gap: 6px; flex-wrap: wrap; }

/* TOC */
.prd-toc { margin: 0 0 28px; padding: 14px 18px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-2); }
.prd-toc__title { font-weight: 700; font-size: 13px; color: var(--muted); margin-bottom: 6px; letter-spacing: 0.04em; }
.prd-toc ul { list-style: none; margin: 0; padding: 0; columns: 2; }
.prd-toc li { break-inside: avoid; }
.prd-toc a { color: var(--text); text-decoration: none; font-size: 14px; display: block; padding: 3px 0; }
.prd-toc a:hover { color: var(--accent); }
.prd-toc__h3 a { padding-left: 16px; font-size: 13px; color: var(--muted); }

/* Typography */
.prd-body { counter-reset: h2; }
.prd-body h2 { font-size: 21px; margin: 44px 0 14px; scroll-margin-top: 16px; }
.prd-body h2::before { counter-increment: h2; content: counter(h2) ". "; color: var(--accent); font-variant-numeric: tabular-nums; }
.prd-body h3 { font-size: 16px; margin: 26px 0 8px; scroll-margin-top: 16px; }
.prd-body p { margin: 12px 0; }
.prd-body ul, .prd-body ol { margin: 12px 0; padding-left: 22px; }
.prd-body li { margin: 6px 0; }
.prd-body a { color: var(--accent); }
.prd-body code { background: var(--surface); border: 1px solid var(--line-soft); padding: 1px 6px; border-radius: 5px; font-size: 13px; }
.prd-body hr { border: 0; border-top: 1px solid var(--line); margin: 32px 0; }
.prd-body blockquote { margin: 16px 0; padding: 10px 16px; border-left: 3px solid var(--accent); background: var(--surface-2); color: var(--muted); }

/* Tables */
.prd-body table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.prd-body th, .prd-body td { border-bottom: 1px solid var(--line-soft); padding: 10px 14px; text-align: left; vertical-align: top; }
.prd-body th { background: var(--surface); font-weight: 600; }
.prd-body tr:last-child td { border-bottom: 0; }
.prd-body tbody tr:hover { background: rgba(78,167,255,0.06); }

/* Badges & tags */
.badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; line-height: 1.4; }
.badge--status.badge--draft { background: rgba(224,160,192,0.16); color: #e0a0c0; }
.badge--status.badge--in-progress { background: rgba(127,209,255,0.16); color: #7fd1ff; }
.badge--status.badge--done { background: rgba(111,224,176,0.16); color: #6fe0b0; }
.badge--muted { background: var(--surface); color: var(--muted); border: 1px solid var(--line-soft); }
.badge--p0 { background: rgba(255,107,107,0.16); color: var(--p0); }
.badge--p1 { background: rgba(255,180,84,0.16); color: var(--p1); }
.badge--p2 { background: rgba(95,208,160,0.16); color: var(--p2); }
.badge--p3 { background: rgba(138,160,182,0.16); color: var(--p3); }
.tag { display: inline-block; padding: 2px 9px; border-radius: 6px; font-size: 12px; background: var(--surface); color: var(--muted); border: 1px solid var(--line-soft); }

/* Callouts */
.callout { display: block; margin: 18px 0; padding: 14px 16px; border-radius: 10px; border: 1px solid var(--line); border-left-width: 3px; background: var(--surface-2); }
.callout__title { font-weight: 700; margin-bottom: 6px; font-size: 14px; }
.callout--info { border-left-color: var(--info); } .callout--info .callout__title { color: var(--info); }
.callout--warn { border-left-color: var(--warn); } .callout--warn .callout__title { color: var(--warn); }
.callout--success { border-left-color: var(--ok); } .callout--success .callout__title { color: var(--ok); }
.callout--danger { border-left-color: var(--danger); } .callout--danger .callout__title { color: var(--danger); }

/* KPI cards */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 18px 0; }
.kpi { padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); }
.kpi__num { font-size: 24px; font-weight: 700; color: var(--accent); }
.kpi__label { font-size: 13px; color: var(--muted); margin-top: 4px; }

/* Progress */
.progress { height: 8px; border-radius: 999px; background: var(--surface); overflow: hidden; margin: 8px 0; }
.progress__bar { height: 100%; background: linear-gradient(90deg, var(--accent), #7fd1ff); }

/* Two columns / pros-cons */
.cols-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 18px 0; }
@media (max-width: 560px) { .cols-2 { grid-template-columns: 1fr; } }

/* Cards (persona / user story) */
.card { padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--surface-2); margin: 14px 0; }
.card__title { font-weight: 700; margin-bottom: 6px; }

/* Timeline */
.timeline { list-style: none; margin: 18px 0; padding: 0; position: relative; }
.timeline::before { content: ""; position: absolute; left: 6px; top: 4px; bottom: 4px; width: 2px; background: var(--line); }
.timeline li { position: relative; padding: 0 0 16px 26px; }
.timeline li::before { content: ""; position: absolute; left: 0; top: 5px; width: 14px; height: 14px; border-radius: 50%; background: var(--bg); border: 2px solid var(--accent); }
.timeline .t-date { font-size: 12px; color: var(--accent); font-weight: 600; }
.timeline .t-title { font-weight: 600; }

/* Steps */
.steps { counter-reset: step; list-style: none; margin: 18px 0; padding: 0; }
.steps li { position: relative; padding: 0 0 12px 38px; }
.steps li::before { counter-increment: step; content: counter(step); position: absolute; left: 0; top: 0; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: #04111f; font-weight: 700; display: flex; align-items: center; justify-content: center; font-size: 13px; }

/* Mermaid */
.mermaid { margin: 18px 0; text-align: center; }

/* Framework: 2x2 matrix */
.matrix-2x2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 18px 0; }
.matrix-2x2 .m-cell { padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); min-height: 88px; }
.matrix-2x2 .m-label { font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 6px; }

/* Framework: canvas grid (business model / lean / value proposition) */
.canvas-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin: 18px 0; }
.canvas-block { padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); }
.canvas-block__title { font-size: 13px; font-weight: 700; color: var(--accent); margin-bottom: 6px; }

/* Framework: user journey (wide, scrollable) */
.journey { overflow-x: auto; }
.journey table { min-width: 640px; }

/* Framework: user story map — horizontal activity columns with stacked cards */
.story-map { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 10px; margin: 18px 0; }
.sm-activity { flex: 0 0 200px; display: flex; flex-direction: column; gap: 8px; }
.sm-activity__title { font-weight: 700; color: var(--accent); padding: 8px 10px; border-bottom: 2px solid var(--accent); margin-bottom: 2px; }
.sm-step { font-size: 12px; font-weight: 600; color: var(--muted); padding: 2px 0; letter-spacing: 0.02em; }
.sm-card { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); font-size: 13px; line-height: 1.5; }
.sm-release { font-size: 11px; color: var(--muted); margin: 6px 0; padding-left: 2px; border-left: 2px solid var(--line); }
`;

// No template-literal interpolation / backticks inside this string.
const PRD_SCRIPT = `
(function(){
  var body = document.body;
  var toc = document.querySelector('#prd-toc ul');
  var heads = document.querySelectorAll('.prd-body h2, .prd-body h3');
  if (toc && heads.length) {
    heads.forEach(function(h, i){
      var id = 'sec-' + i; h.id = id;
      var li = document.createElement('li');
      li.className = 'prd-toc__' + h.tagName.toLowerCase();
      var a = document.createElement('a'); a.href = '#' + id; a.textContent = (h.textContent || '').trim();
      a.addEventListener('click', function(e){
        // In a srcdoc/sandboxed iframe a native #anchor navigates to a blank
        // page, so scroll programmatically instead.
        e.preventDefault();
        var target = document.getElementById(id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(a); toc.appendChild(li);
    });
  } else { var nav = document.getElementById('prd-toc'); if (nav) nav.style.display = 'none'; }

  var btn = document.querySelector('.prd-theme-toggle');
  if (btn) btn.addEventListener('click', function(){
    body.dataset.theme = body.dataset.theme === 'light' ? 'dark' : 'light';
  });

  if (document.querySelector('.mermaid')) {
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
    s.onload = function(){
      try { window.mermaid.initialize({ startOnLoad: true, theme: body.dataset.theme === 'light' ? 'neutral' : 'dark' }); window.mermaid.run(); } catch (e) {}
    };
    document.head.appendChild(s);
  }
})();
`;

/**
 * Injected into the orchestrator when it may author a PRD. Tells the agent the
 * expected structure and the full HTML component vocabulary the template styles.
 */
export const PRD_AUTHORING_GUIDE = [
  "写 PRD(section=prd)时,你是资深产品经理,默认就要交付一份【图文并茂、开箱即用】的专业 PRD——不要等用户点名才加图表,主动配齐。content 用 HTML,不写 <h1>(模板自动生成封面),内容要具体可执行、绝不写占位符。",
  "",
  "【必须包含的小节与配套图表,缺一不可】(每节 <h2>,自动编号):",
  "1. 背景与目标:问题/机会 1-2 段。",
  '2. 目标用户与场景:至少 1 张用户画像卡 <div class="card"><div class="card__title">画像:XX 玩家</div>特征/动机/痛点</div>,再加典型使用场景列表。',
  '3. 核心流程:【必须画一张 Mermaid 流程图】<div class="mermaid">flowchart LR; A[游客]-->B[选择登录方式]; B-->C{已有账号?}; C-->|是|D[登录]; C-->|否|E[注册]; D-->F[进入游戏]; E-->F</div>(复杂交互可再加 sequenceDiagram)。',
  '4. 功能需求:需求表 <table>,列=功能|说明|优先级|验收标准;优先级用徽章 <span class="badge badge--p0">P0</span>(p0/p1/p2/p3)。',
  '5. 非功能需求:性能/安全/兼容,关键约束用 <div class="callout callout--warn"><div class="callout__title">约束</div>…</div> 标注。',
  '6. 成功指标:【必须用 KPI 卡片】<div class="kpi-grid"><div class="kpi"><div class="kpi__num">≥40%</div><div class="kpi__label">次日留存</div></div>…</div>(给 3-5 个量化指标)。',
  '7. 里程碑与排期:【必须用时间轴】<ul class="timeline"><li><div class="t-date">2026-07</div><div class="t-title">内测</div>说明</li>…</ul>。',
  '8. 风险与依赖:用 <div class="callout callout--danger"> 或 callout--warn 标注主要风险。',
  "9. 开放问题:待决策清单。",
  "",
  "其它可选组件:进度条 progress、双栏对比 cols-2、操作步骤 <ol class=\"steps\">、callout 变体 info/success。目录 TOC 会自动生成,无需手写。",
  "底线:一份 PRD 至少要有【1 张 Mermaid 流程图 + 1 个需求表(带优先级徽章)+ 1 组 KPI 卡片 + 1 张用户画像卡 + 1 条里程碑时间轴】,否则不算合格。"
].join("\n");

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value.replace(/'/g, "%27").replace(/"/g, "%22");
}
