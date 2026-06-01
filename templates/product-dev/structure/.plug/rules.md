# {{projectName}} 工作规则

此文件来自项目模板，定义 AI 在本项目内的行为边界。

1. 项目根目录是唯一工作边界。
2. `auto` 区域可自动写入，`confirm` 区域必须展示 diff 并等待用户确认。
3. 删除、命令执行、git commit 和 git push 必须确认。
4. 每个 folder section 的 `_index.md` 是进入该区前优先读取的索引。
5. 完成任务后更新 memory，记录关键决策和结果。
