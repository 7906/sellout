# ARCHITECTURE.md

# SELL OUT Technical Architecture

## 1. 技术选型

## Client

- TypeScript
- Phaser 4.2.1
- Vite
- HTML/CSS Overlay

## Server

- Node.js
- TypeScript
- Fastify

## Database

- SQLite

## Validation

- Zod

## AI

- GLM API

---

# 2. 总体结构

```text
Browser
   │
   │ HTTP / WebSocket
   ↓
Game Server
   │
   ├── Game State
   ├── NPC State
   ├── Memory
   ├── Sales Logic
   ├── Validation
   │
   ↓
LLM Adapter
   │
   ↓
GLM
```

---

# 3. Server Authority

以下数据只能由 Server 控制：

- money
- inventory
- product price
- NPC state
- trust
- interest
- suspicion
- budget
- purchase history
- memory
- world state
- sales result

客户端不能成为这些数据的权威来源。

---

# 4. Client Responsibilities

Client 负责：

- Rendering
- Input
- Scene
- UI
- NPC movement
- Animation
- Display game state

---

# 5. Server Responsibilities

Server 负责：

- Game rules
- NPC logic
- LLM calls
- State validation
- Persistence
- Sales calculation
- Memory
- Save/load

---

# 6. Shared Types

`shared/` 中保存：

```text
NPCState
Product
ConversationMessage
ConversationResult
MemoryEvent
SaleResult
GameState
WorldEvent
```

Client 和 Server 都引用。

---

# 7. Client Structure

```text
client/src/

game/
scenes/
entities/
systems/
ui/
network/
data/
debug/
main.ts
```

---

# 8. Server Structure

```text
server/src/

api/
game/
npc/
conversation/
llm/
memory/
sales/
validation/
db/
debug/
server.ts
```

---

# 9. Conversation Pipeline

```text
Player Input
↓
Server
↓
Conversation Context Builder
↓
GLM Adapter
↓
Structured Output
↓
Zod Validation
↓
State Validator
↓
Game Logic
↓
NPC Response
↓
Client
```

---

# 10. LLM Adapter

不要把 GLM SDK 直接散落在项目里。

统一：

```ts
interface LLMProvider {
  generateNPCResponse(
    context: NPCContext
  ): Promise<LLMResponse>;
}
```

未来可以替换：

```text
GLM
Claude
OpenAI
Local Model
```

而不修改 Game Logic。

---

# 11. NPC Service

```ts
interface NPCService {
  getNPC(id: string): NPCState;

  updateNPC(
    id: string,
    update: NPCUpdate
  ): void;

  addMemory(
    id: string,
    memory: MemoryEvent
  ): void;
}
```

---

# 12. Sales Service

```ts
interface SalesService {
  evaluateProposal(
    npc: NPCState,
    product: Product,
    argument: SalesArgument
  ): SaleEvaluation;
}
```

---

# 13. Game State

```ts
interface GameState {
  day: number;

  player: PlayerState;

  npcs: Record<string, NPCState>;

  products: Record<string, Product>;

  world: WorldState;

  sales: SaleRecord[];
}
```

---

# 14. NPC State Mutation

所有状态变化必须走统一入口：

```ts
applyNPCEffect()
```

不要在不同模块直接：

```ts
npc.trust += 5
```

---

# 15. Effect System

使用有限效果集合：

```text
trust_up_small
trust_up_medium

trust_down_small
trust_down_medium

interest_up_small
interest_up_medium

suspicion_up_small
suspicion_up_medium

patience_down_small
```

这样 LLM 只能选择：

> 有限的效果。

不能产生任意数字。

---

# 16. Database

第一版使用 SQLite。

建议表：

```text
players
npcs
npc_memory
products
sales
world_state
conversations
```

---

# 17. Save Strategy

每次关键事件后保存：

- purchase
- refund
- relationship change
- memory event
- day end

---

# 18. Debug Mode

开发版显示：

```text
NPC:
trust
interest
suspicion

Needs:
awareness

LLM:
raw output

Validator:
accepted effects

Game:
state changes
```

这是调 AI 游戏时必须保留的工具。

---

# 19. Error Handling

LLM 出错不能导致游戏无法继续。

Fallback：

1. Retry
2. Simplified Prompt
3. Safe NPC Response
4. Continue Conversation

---

# 20. Streaming

第一版可以先使用：

> 非流式响应。

确认玩法成立以后再做：

> Streaming。

先解决游戏逻辑。

---

# 21. Network

Vertical Slice：

HTTP 足够。

如果需要实时 NPC：

再增加 WebSocket。

不要一开始做复杂实时架构。

---

# 22. Deployment

开发：

```text
localhost
client
server
SQLite
```

之后：

```text
Desktop
↓
Electron / Tauri
```

---

# 23. 架构最高原则

不要让：

> LLM = Game Engine。

应该：

> **Game Engine = 世界规则**

> **LLM = NPC 大脑的语言接口**