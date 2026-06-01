# {{projectName}} 工作规则

此项目由 Plug 的 `product-dev` 模板创建。AI 必须遵守以下规则：

1. 所有工作以项目根目录为边界，不读取或写入项目外文件。
2. 开始任务前先读取 `.plug/memory.md`、`.plug/rules.md` 和当前 section 的 `_index.md`。
3. PRD 先于设计，设计先于代码实现建议。
4. `02-prd/`、`03-design/`、`04-code/`、`06-deliverables/` 的写入必须先提出 diff 并等待用户确认。
5. `05-knowledge/` 和 `.plug/memory.md` 可自动维护，但要保持简洁、可读、可审计。
6. 删除文件、运行命令、git commit、git push 永远需要用户明确批准。
7. 更新文件后同步维护对应 section 的 `_index.md`。
8. 重要决定、阶段变化和关键发现需要写入 `.plug/memory.md`。
