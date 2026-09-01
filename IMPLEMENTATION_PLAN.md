# IMPLEMENTATION_PLAN.md

# SELL OUT — Implementation Plan

目标：

> 从零完成一个可以真正玩的 Vertical Slice。

---

# PHASE 0 — Environment

## Goal

确认开发环境。

检查：

- Node
- npm/pnpm
- TypeScript
- Phaser
- Vite
- SQLite
- Zod
- GLM API

结果写入：

`README.md`

---

# PHASE 1 — Bare Game

## Goal

运行一个 Phaser 页面。

实现：

- Window
- Background
- Player
- NPC placeholder
- Basic UI

验收：

> 可以启动。

---

# PHASE 2 — NPC Interaction

实现：

- NPC 点击
- 对话窗口
- 输入框
- 发送按钮

验收：

> 玩家可以和一个 NPC 开始对话。

先不要连接真实 AI。

---

# PHASE 3 — Server

实现：

```text
client
↓
server
```

建立：

```text
/api/game
/api/npc
/api/conversation
```

验收：

> 客户端可以从 Server 获取 NPC。

---

# PHASE 4 — GLM Adapter

实现：

```ts
LLMProvider
```

连接 GLM。

验收：

> NPC 可以获得 AI 回复。

---

# PHASE 5 — NPC State

实现：

```text
trust
interest
suspicion
patience
mood
```

验收：

> 不同玩家话术可以改变状态。

---

# PHASE 6 — NPC Knowledge

实现：

```text
World Truth
NPC Knowledge
NPC Beliefs
```

验收：

> NPC 不会自动知道玩家知道的一切。

---

# PHASE 7 — Need System

先实现一个需求。

NPC：

> 节俭大叔

Need：

> 减少食物浪费

Hidden：

> 家里冰箱经常装满

Emotional：

> 害怕浪费钱

验收：

> 玩家通过聊天逐渐发现。

---

# PHASE 8 — Product

制作：

## 第二冰箱

实现：

- Name
- Price
- Function
- Sales Angles
- Compatible Needs

验收：

> 玩家可以向 NPC 提出商品。

---

# PHASE 9 — Sales Logic

实现：

```text
Need
Trust
Interest
Suspicion
Budget
Argument
```

形成：

```text
SaleEvaluation
```

验收：

> NPC 不会随机购买。

---

# PHASE 10 — Refusal

NPC 必须能够：

```text
拒绝
怀疑
离开
```

验收：

> 玩家必须调整策略。

---

# PHASE 11 — Purchase

成功：

```text
Player Money += Price
NPC Budget -= Price
Inventory -= Product
```

并生成：

```text
SaleRecord
MemoryEvent
```

验收：

> 钱和状态正确变化。

---

# PHASE 12 — Memory

NPC 第二次遇到玩家。

它知道：

> 玩家卖过什么。

验收：

NPC 能自然引用过去。

---

# PHASE 13 — 第二 NPC

增加：

## 虚荣妈妈

验证：

同一个商品：

> 不同人格需要不同销售方法。

---

# PHASE 14 — 5 NPC

增加：

- 节俭大叔
- 虚荣妈妈
- 阴谋论者
- 社恐工程师
- 职业推销员

---

# PHASE 15 — 6 Products

加入：

- 第二冰箱
- 便携式地下室
- 防猫背叛保险
- 防尴尬沙发
- 防鸽子服
- 家庭火箭发射台

---

# PHASE 16 — World

实现：

- NPC 移动
- 地点
- 基础日程

不需要复杂 AI Navigation。

---

# PHASE 17 — Day Loop

实现：

```text
Morning
↓
Street
↓
Sales
↓
Return
↓
Daily Report
↓
Next Day
```

---

# PHASE 18 — Comedy Layer

加入：

- 荒谬公司邮件
- 荒谬 KPI
- 荒谬新闻
- 错误销售结果
- NPC 认真面对荒谬事件

---

# PHASE 19 — Vertical Slice Test

至少进行：

### Test 1

玩家自然聊天。

### Test 2

玩家故意撒谎。

### Test 3

玩家正确发现需求。

### Test 4

玩家错误判断需求。

### Test 5

玩家改变销售策略。

### Test 6

NPC 拒绝。

### Test 7

NPC 成交。

### Test 8

NPC 第二次遇见玩家。

### Test 9

NPC 记忆第一次购买。

### Test 10

不同 NPC 对同一句话产生不同反应。

---

# PHASE 20 — Stop Condition

完成 Vertical Slice 后：

**停止扩张。**

不要立即增加 50 个 NPC。

先评估：

> 核心销售循环是否真的好玩。

---

# 当前最高优先级

只做：

```text
一个 NPC
+
一个商品
+
自由对话
+
真实销售
+
记忆
```

先让：

> **“第二冰箱卖给节俭大叔”**

这一件事真正成立。

然后再扩大。