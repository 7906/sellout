读取项目根目录中的：

- AGENTS.md
- GAME_DESIGN.md
- ARCHITECTURE.md
- LLM_PROTOCOL.md
- IMPLEMENTATION_PLAN.md

然后接管这个项目。

不要重新设计游戏。

不要先写长篇方案。

不要等待我逐项告诉你怎么做。

按照 IMPLEMENTATION_PLAN.md 从当前阶段开始执行。

第一轮只完成：

> PHASE 0 → PHASE 4

也就是：

1. 检查开发环境
2. 确定项目技术栈
3. 建立 / 修复 Phaser + TypeScript + Vite 项目
4. 建立 Node.js + TypeScript Server
5. 建立 Client ↔ Server 通信
6. 建立共享 TypeScript 类型
7. 建立 GLM Adapter
8. 建立第一个 NPC 的最小数据结构
9. 建立最小聊天界面
10. 让玩家能够真正发送一句话，并收到 GLM 驱动的 NPC 回复

要求：

- 实际运行项目
- 实际测试
- 遇到错误先修
- 不要只生成代码
- 不要在没有运行的情况下宣布完成

完成后给出简洁报告：

1. 做了什么
2. 修改了哪些文件
3. 如何运行
4. GLM 如何配置
5. 测试结果
6. 当前剩余问题
7. 下一阶段应该做什么

然后停下来。

不要提前实现后面的系统。