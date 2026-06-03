#!/usr/bin/env node
// Generate one Plug skill per PM framework from pm-frameworks.json (sourced from
// pmframe.works). Each skill auto-loads when the user's request matches its
// triggers, so the agent applies the right framework without being told to.
//
// Usage: node scripts/generate-framework-skills.mjs [targetDir]
//   targetDir defaults to ~/.plug/skills (personal skills, live for all projects).

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = join(here, "pm-frameworks.json");
const target = process.argv[2] || join(homedir(), ".plug", "skills");

// Trailing verbs stripped to derive shorter, order-robust keyword triggers.
const TRAILING_VERBS = /(构建|分析|排序|梳理|优化|发现|规划|设计|管理|激发|定义|测试|验证|迁移|筛选|决策|追踪|草绘|建模|聚焦|对齐|拆解|评估|创新)$/;
const ACRONYMS = new Set(["rice", "ice", "aarrr", "heart", "jtbd", "swot", "moscow", "okr", "mvp", "rat", "kj", "errc", "daci", "raci", "hmw", "scamper", "triz", "wsjf", "kano"]);

function prettyName(id) {
  if (ACRONYMS.has(id)) return id.toUpperCase();
  return id
    .split("-")
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Short, atomic query terms — if any appears inside a framework's fit/type, it
// becomes a trigger. This is what makes loose phrasing ("排个优先级") match.
const ATOMIC = [
  "优先级", "排序", "需求", "竞品", "竞争", "对手", "旅程", "体验", "留存", "增长", "转化", "拉新",
  "激活", "变现", "裂变", "画像", "用户研究", "访谈", "满意度", "痛点", "场景", "指标", "北极星",
  "漏斗", "定位", "策略", "战略", "路线图", "路线", "验证", "假设", "实验", "商业模式", "盈利",
  "价值主张", "风险", "创意", "脑暴", "流程", "系统", "决策", "MVP", "原型", "可用性", "习惯",
  "上瘾", "品牌", "叙事", "市场", "机会", "根因", "问题", "拆解", "建模", "金字塔", "循环",
  "时间线", "里程碑", "范围", "迁移", "发明", "情绪"
];

// Curated Chinese aliases for headline frameworks, so users who name them (or
// their canonical Chinese term) hit them precisely.
const ALIASES = {
  "user-journey-map": ["用户旅程", "旅程地图", "旅程"],
  "empathy-map": ["同理心地图", "同理心"],
  jtbd: ["JTBD", "用户目标", "待办任务"],
  "kano-model": ["Kano", "需求分类"],
  rice: ["RICE"],
  moscow: ["MoSCoW"],
  "business-model-canvas": ["商业模式", "商业画布", "商业模式画布"],
  "lean-startup-mvp": ["精益", "MVP", "最小可行产品"],
  "lean-canvas": ["精益画布"],
  aarrr: ["AARRR", "海盗指标"],
  heart: ["HEART"],
  "north-star-metric": ["北极星", "北极星指标"],
  swot: ["SWOT"],
  "value-proposition-canvas": ["价值主张", "价值主张画布"],
  persona: ["用户画像", "画像"],
  "competitive-positioning-map": ["竞品", "竞品分析", "竞争定位"],
  "competitive-analysis": ["竞品", "竞品分析"],
  "ansoff-matrix": ["安索夫", "增长矩阵"],
  "five-why": ["五个为什么", "5why", "根因"],
  "design-thinking": ["设计思维"],
  "hook-model": ["上瘾", "习惯养成", "Hook"]
};

function triggersFrom(fit, type, id) {
  const set = new Set(ALIASES[id] ?? []);
  const haystack = `${fit} ${type}`;
  for (const phrase of String(fit).split(/\s*·\s*/)) {
    const p = phrase.trim();
    if (p.length >= 2) {
      set.add(p);
      const stripped = p.replace(TRAILING_VERBS, "");
      if (stripped.length >= 2 && stripped !== p) set.add(stripped);
    }
  }
  for (const term of ATOMIC) {
    if (haystack.includes(term)) set.add(term);
  }
  if (type) set.add(String(type).replace(/(工具|模型|框架|方法|方法论)$/, "") || type);
  if (ACRONYMS.has(id)) set.add(id.toUpperCase());
  return [...set].filter(Boolean).slice(0, 12);
}

function skillBody(name, m) {
  return `# ${name}（${m.type}）

- 来源:${m.by}${m.year ? `（${m.year}）` : ""}
- 何时用:${m.fit}

## 如何应用
这是「${name}」框架。当用户的诉求落在上面的场景时,【主动用它】分析当前项目的真实内容(不要泛泛复述框架定义,要结合项目具体落地):

1. 按 ${name} 的标准结构,结合项目背景逐项填充,得出有依据的结论。
2. 把分析结果用 write_document 写入 section=analysis(标题含框架名,带 summary/tags/status)。
3. 选合适的可视化:
   - 矩阵/对比类 → HTML 表格 或 2×2 矩阵(class="matrix-2x2");
   - 画布类(商业/精益/价值主张)→ 九宫格(class="canvas-grid");
   - 旅程/流程类 → 用户旅程(class="journey")或 Mermaid 流程图;
   - 评分类(RICE/ICE 等)→ 评分表并算出总分、按分排序。
4. 末尾给出【结论 + 下一步建议】(callout 标注关键决策)。

除非用户明确点名其它方法,这个框架匹配场景时就直接用,不必反问。`;
}

const all = JSON.parse(await readFile(dataPath, "utf8"));
const ids = Object.keys(all);
let written = 0;
const catalog = [];

for (const id of ids) {
  const m = all[id];
  const name = prettyName(id);
  const triggers = triggersFrom(m.fit, m.type, id);
  const dir = join(target, `fw-${id}`);
  const frontmatter = [
    "---",
    `name: ${name}`,
    `description: ${m.type} · 适用:${m.fit}`,
    `triggers: [${triggers.join(", ")}]`,
    "applicableSections: [analysis, prd, purpose, knowledge]",
    "---",
    ""
  ].join("\n");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "SKILL.md"), frontmatter + skillBody(name, m), "utf8");
  written += 1;
  catalog.push(`- ${name}（${m.type}）— ${m.fit}`);
}

// A catalog skill so "我该用什么框架/有哪些框架" surfaces the whole library.
const catalogDir = join(target, "fw-index");
await mkdir(catalogDir, { recursive: true });
await writeFile(
  join(catalogDir, "SKILL.md"),
  [
    "---",
    "name: 产品框架库索引",
    "description: 100+ 产品框架总览,用于推荐合适的方法",
    "triggers: [用什么框架, 哪个框架, 框架推荐, 有哪些框架, 该用什么方法, 框架库, 方法论]",
    "applicableSections: [analysis, prd, purpose, knowledge]",
    "---",
    "",
    "# 产品框架库（按需推荐）",
    "",
    "当用户问「该用什么框架/方法」时,从下面挑 1-3 个最贴合其处境的推荐,并说明为什么、怎么用;若用户已描述了具体处境,直接选最合适的一个套用(产出到 analysis 区)。",
    "",
    ...catalog
  ].join("\n"),
  "utf8"
);

console.log(`Generated ${written} framework skills + 1 catalog → ${target}`);
