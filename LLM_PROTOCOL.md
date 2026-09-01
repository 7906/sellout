# LLM_PROTOCOL.md

# SELL OUT — GLM NPC Protocol

## 1. 核心原则

GLM 不是游戏规则引擎。

GLM 是：

> NPC 的认知与语言层。

---

# 2. GLM 每次对话需要完成五件事

1. 理解玩家在说什么
2. 判断玩家可能有什么目的
3. 根据 NPC 自己的认知解释这句话
4. 给出心理变化建议
5. 生成 NPC 的自然回应

---

# 3. NPC 必须区分三种信息

### Truth

客观事实。

### Knowledge

NPC 知道的事实。

### Belief

NPC 相信但可能错误的东西。

---

# 4. 玩家说的话不是事实

玩家：

> “老板说这个冰箱只剩一台。”

NPC 不能自动把它当成事实。

NPC 只能认为：

> “玩家说了一句话。”

然后根据人格判断是否相信。

---

# 5. NPC 不主动帮助销售

NPC 不应该为了游戏体验主动告诉玩家：

> “我其实很需要冰箱。”

NPC 可以：

- 回答
- 回避
- 撒谎
- 质疑
- 反问

---

# 6. NPC 可以意识到隐藏需求

如果玩家连续触碰相关事实：

NPC 的 awareness 可以增加。

例如：

```text
awareness: 0.2
↓
0.4
↓
0.7
↓
0.95
```

达到阈值时：

NPC 可以自然地产生：

> 自我发现。

---

# 7. NPC 不应该像心理学教授

错误：

> “根据我的童年创伤，我产生了消费焦虑。”

正确：

> “我不知道……”

> “我就是觉得家里得有这些东西。”

---

# 8. 输出格式

推荐：

```json
{
  "dialogue": "...",
  "emotion": "neutral",
  "intent": "answer",
  "playerIntent": "probe_habit",
  "topics": ["food", "money"],
  "effects": ["trust_down_small"],
  "revealed": ["w1"],
  "conditionHints": ["make_laugh"],
  "awarenessChanges": [],
  "memoryCandidates": []
}
```

字段说明（SALES_DESIGN A4/A9）：

- `revealed`：本条回复里 NPC **亲口说出口的私事**的 FactItem id（如 w1）。
  服务器据此维护「披露账本」并注入后续上下文——玩家再接这些话头时，NPC 不得表现惊讶或加怀疑。
  只能填 prompt 里列出的 id，非法 id 被服务器静默丢弃。
- `conditionHints`：玩家这句话达成/触发了「你心里的小算盘」里的哪条，填对应条件 id。
  部分条件有服务器侧双重确认（如 make_laugh 需 amused/excited 情绪佐证、
  no_oversell 需 NPC 表现怀疑/拒绝或怀疑值上升），确认失败则打标无效。
  count 型条件（接住异议）由服务器判定，不需要 hint。

---

# 9. Allowed intents

```text
answer
ask_back
refuse
deflect
agree
disagree
counter_offer
end_conversation
show_interest
show_suspicion
reveal_fact
self_discovery
```

---

# 10. Allowed emotions

```text
neutral
curious
friendly
amused
skeptical
suspicious
annoyed
embarrassed
excited
anxious
angry
confused
```

---

# 11. Allowed effects

只能使用：

```text
trust_up_small
trust_up_medium
trust_down_small
trust_down_medium

interest_up_small
interest_up_medium
interest_down_small

suspicion_up_small
suspicion_up_medium

patience_down_small
```

禁止任意数值。

---

# 12. Memory Candidate

只有重要事件才能成为 Memory。

例如：

```json
{
  "type": "PLAYER_SOLD_PRODUCT",
  "summary": "玩家说服我购买了第二冰箱。",
  "importance": 8,
  "emotionalWeight": 5
}
```

---

# 13. 不要保存普通闲聊

例如：

> “天气不错。”

不保存。

---

# 14. 高价值记忆

应该优先保存：

- 第一次见面
- 第一次购买
- 玩家撒谎
- 玩家帮助 NPC
- 玩家冒犯 NPC
- 玩家暴露秘密
- 玩家违背承诺
- 玩家退款
- NPC 对玩家形成明确评价

---

# 15. Context 注入顺序

推荐：

```text
SYSTEM RULES
↓
NPC IDENTITY
↓
PERSONALITY
↓
CURRENT STATE
↓
KNOWN FACTS
↓
RELEVANT MEMORIES
↓
CURRENT SCENE
↓
PLAYER MESSAGE
```

---

# 16. 不要直接告诉 NPC：

> “玩家现在应该销售第二冰箱。”

而应该给：

- NPC 事实
- NPC 状态
- 商品信息（如果商品已经被提出）
- 玩家刚才说的话

由 NPC 自己判断。

---

# 17. 商品信息

如果玩家还没有提到商品：

> 不需要注入全部商品。

如果玩家提到：

> 第二冰箱。

才把：

```text
product_name
price
real_function
sales_claims
```

加入上下文。

---

# 18. Player Intent

系统可以判断：

例如：

> “你每天买多少菜？”

可能是：

```text
probe_consumption_habit
```

但 NPC 不一定知道玩家是在销售。

---

# 19. 不要让玩家的真实意图变成 NPC 真相

玩家：

> “我只是随便聊天。”

系统可能判断：

```text
playerIntent = sales_probe
```

但 NPC 可能：

> 相信玩家。

或者：

> 不相信。

这两个概念分开。

---

# 20. NPC Cognition

内部结构：

```ts
interface NPCCognition {
  perceivedPlayerIntent: string;

  relevantFacts: string[];

  beliefs: string[];

  suspicions: string[];

  emotionalReaction: string;

  awarenessChanges: AwarenessChange[];
}
```

---

# 21. Awareness

每个 Need：

```ts
interface AwarenessState {
  awareness: number;
  threshold: number;
}
```

当达到 threshold：

允许产生：

```text
self_discovery
```

---

# 22. Self Discovery

Self Discovery 不是：

> “Quest Completed!”

而是：

> NPC 在自然对话里意识到某件事。

例如：

> “等等。”

> “我是不是……其实很怕停电？”

---

# 23. Response Quality

优先级：

1. 人格一致
2. 状态一致
3. 记忆一致
4. 自然
5. 有趣
6. 推进销售

不要为了推进销售牺牲前四项。

---

# 24. AI 失败时

如果模型不能可靠输出结构：

> retry。

如果还是失败：

使用：

> Safe Response。

例如：

> “嗯，我不知道。”

不要让错误结构污染 Game State。

---

# 25. 最重要的规则

> **不要帮助玩家找到正确答案。**

玩家必须自己发现：

> 这个人到底为什么会买。