// ===== 枚举：与 LLM_PROTOCOL.md 第 9/10/11 节严格一致 =====

export const EMOTIONS = [
  "neutral",
  "curious",
  "friendly",
  "amused",
  "skeptical",
  "suspicious",
  "annoyed",
  "embarrassed",
  "excited",
  "anxious",
  "angry",
  "confused",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

export const NPC_INTENTS = [
  "answer",
  "ask_back",
  "refuse",
  "deflect",
  "agree",
  "disagree",
  "counter_offer",
  "end_conversation",
  "show_interest",
  "show_suspicion",
  "reveal_fact",
  "self_discovery",
] as const;

export type NpcIntent = (typeof NPC_INTENTS)[number];

export const EFFECT_IDS = [
  "trust_up_small",
  "trust_up_medium",
  "trust_down_small",
  "trust_down_medium",
  "interest_up_small",
  "interest_up_medium",
  "interest_down_small",
  "suspicion_up_small",
  "suspicion_up_medium",
  "suspicion_down_small",
  "patience_down_small",
] as const;

export type EffectId = (typeof EFFECT_IDS)[number];

// ===== 核心数据结构 =====

/**
 * NPC 的知识/心事条目（SALES_DESIGN A9 披露账本）：
 * - id：账本与 LLM「revealed 申报」的锚点（w1/k2…）
 * - text：注入 prompt 的原文
 * - tags：2-4 字关键词，仅服务器用于匹配玩家消息（不进 prompt）——
 *   命中已披露条目 → 丢弃本回合 suspicion_up；命中未披露条目 → 照常（雷区生效）
 */
export interface FactItem {
  id: string;
  text: string;
  tags: string[];
}

/** 成交条件账本条目（Server-only；SALES_DESIGN A3-A6） */
export interface ConditionFlag {
  count: number;
  /** 记账发生在第几天（调试用；反向条件每天由 resetDaily 清空） */
  setAtDay: number;
}

/** NPC 的心理数值，全部由 Server 权威控制（ARCHITECTURE.md §3） */
export interface NPCVitals {
  /** 信任 0-100 */
  trust: number;
  /** 兴趣 0-100 */
  interest: number;
  /** 怀疑 0-100 */
  suspicion: number;
  /** 耐心 0-100 */
  patience: number;
  /** 当前心情 */
  mood: Emotion;
}

/**
 * NPC 状态。
 * 三层认知：knowledge（NPC 知道的事实）/ worries（心里惦记的事）/ vitals（此刻心理数值）。
 * World Truth / Belief 的进一步拆分属于 Phase 6。
 */
export interface NPCState {
  id: string;
  name: string;
  /** 场景头像符号 */
  emoji: string;
  /** 身份标签，如「退休工人 · 节俭多疑」 */
  identity: string;
  /** 完整人设卡（注入 prompt 的人物小传） */
  persona: string;
  /** 攻略方向（玩家可见的引导提示，随脱敏视图下发；不是隐藏条件本身） */
  strategyHints: string[];
  /** NPC 知道的客观事实（NPC Knowledge 层，注入 prompt） */
  knowledge: FactItem[];
  /** NPC 心里惦记的事（情绪层；玩家要通过聊天发现，注入 prompt 但要求 NPC 不主动吐露） */
  worries: FactItem[];
  /** 开场白（会话第一次打开时 NPC 先说的话） */
  hello: string[];
  /** 场景观察线索（客户端可见，帮助玩家观察推理） */
  clues: string[];
  /** 隐藏成交条件（Server-only，SALES_DESIGN A3-A5 结算使用；判定标准可注入 NPC prompt，禁止下发客户端） */
  dealConditions: DealCondition[];
  vitals: NPCVitals;
  /** 从本玩家手里买过的商品（Server-only；防止重复购买 + 注入 prompt 提示 NPC） */
  purchased: PurchasedItem[];
  /** 成交条件账本（Server-only；flag 名 → 次数与记账日） */
  conditionFlags: Record<string, ConditionFlag>;
  /** 各需求的觉醒度（Phase 7 使用，本阶段保留结构） */
  awareness: Record<string, number>;
  /** NPC 可支配预算（Server-only，Phase 9/11 使用） */
  budget: NPCBudget;
  /** 耳根软硬系数（Server-only，Phase 9 销售判定使用；>1 好骗，<1 难说服） */
  gullible: number;
  /** 特殊行为标记（Server-only） */
  flags: NPCBehaviorFlags;
}

/** 预算：积蓄 + 月供上限（0 = 这辈子不欠账） */
export interface NPCBudget {
  savings: number;
  monthlyCap: number;
}

export interface NPCBehaviorFlags {
  /** 听到「分期/0首付」会立即激怒 */
  noInstall: boolean;
  /** 道德目标：向 TA 销售需要过良心关（卖了会内疚的人） */
  kindTarget: boolean;
  /** 隐藏身份议程（如同行卧底），仅 prompt 知道 */
  hiddenAgenda?: string;
}

/** NPC 已购买记录 */
export interface PurchasedItem {
  productId: string;
  price: number;
  day: number;
}

/** 实时攻略单条：ok=true 这道闸已过，false=被卡住（text 里带怎么补） */
export interface SaleAdviceItem {
  ok: boolean;
  text: string;
}

/** 实时攻略（GET /api/npc/:id/advice）：当前 NPC 的成交诊断 + 推荐主攻商品 */
export interface SaleAdvice {
  npcId: string;
  /** 背包里有商品现在就能成交 */
  canCloseNow: boolean;
  /** 最接近成交的商品（无候选则缺省） */
  recommend?: { productId: string; productName: string; emoji: string; price: number };
  /** 各道闸的状态清单（顺序即裁决顺序） */
  items: SaleAdviceItem[];
}

/** 隐藏成交条件（来自 Engine 原型的 CONDITIONS 机制，Phase 9 结算） */
export interface DealCondition {
  id: string;
  /** 结算时写入的 flag 名 */
  flag: string;
  /** true = 反向条件：违反即失败 */
  negative?: boolean;
  /** count 型条件：需要达成次数 */
  count?: number;
  /** 服务器侧旁证关键词：玩家消息命中任一 tag 即可记账（不依赖 LLM 打标，SALES_DESIGN A4） */
  confirmTags?: string[];
  desc: string;
}

/** 成交结算信息（附在 ConversationResult 上返回给客户端） */
export interface PurchaseSettlement {
  productId: string;
  productName: string;
  emoji: string;
  /** 商品成交价（NPC 付款） */
  price: number;
  /** 玩家拿到的佣金 */
  commission: number;
  /** 特殊任务奖金（仅任务商品首次售出） */
  bonus: number;
  /** 结算后玩家总资产 */
  money: number;
  /** 本次成交是否完成了今日特殊任务 */
  taskCompleted: boolean;
}

/** 客户端可见的脱敏 NPC 视图（不含 budget/gullible/dealConditions/persona） */
export interface NPCPublicView {
  id: string;
  name: string;
  emoji: string;
  identity: string;
  hello: string[];
  clues: string[];
  /** 攻略方向（玩家可见的引导提示，「📖 攻略」按钮切换显示） */
  strategyHints: string[];
  vitals: NPCVitals;
  /** 成交所需信任线（=45÷gullible，游戏 UI 可显示） */
  saleTrustGate: number;
}

export interface PlayerState {
  name: string;
  money: number;
  /** 玩家携带的商品 id 列表（今天公司发的货） */
  inventory: string[];
}

/** 商品档位：normal = 常规货（传统商品）；special = 特殊任务（荒诞高难） */
export type ProductTier = "normal" | "special";

/** 商品（GAME_DESIGN §9：真实功能 + 合理价格 + 潜在需求 + 定位） */
export interface Product {
  id: string;
  name: string;
  emoji: string;
  price: number;
  /** 定位一句话（给玩家看） */
  tagline: string;
  /** 真实功能（Server 知道的底；注入 prompt 供 NPC 按常识反应） */
  realFunction: string;
  /** 公司销售口径（玩家可能这样说；LLM_PROTOCOL §17） */
  claims: string[];
  /** 玩家消息提及检测关键词（Server-side 匹配） */
  keywords: string[];
  tier: ProductTier;
  /** 卖出佣金（Phase 11 结算用） */
  commission: number;
  /** 特殊任务难度 1-5（仅 special） */
  difficulty?: number;
}

/** 公司发放的特殊任务：把某件荒诞库存卖出去，额外给奖金 */
export interface TaskAssignment {
  productId: string;
  /** 额外奖金（叠加在佣金上，Phase 11 结算） */
  bonus: number;
  title: string;
  desc: string;
}

export interface GameState {
  day: number;
  player: PlayerState;
  npcs: Record<string, NPCState>;
}

/** 公司邮件（喜剧层 PHASE 18：KPI 从正常逐渐荒谬，GAME_DESIGN §13） */
export interface CompanyEmail {
  from: string;
  subject: string;
  body: string;
  /** 本日 KPI（同样逐日荒谬化） */
  kpi: string;
}

/** 一笔成交（收工日报用） */
export interface DailySaleRecord {
  npcId: string;
  npcName: string;
  productId: string;
  productName: string;
  emoji: string;
  price: number;
  commission: number;
  bonus: number;
}

/** 每日 KPI（真实任务：入账达标才算过） */
export interface DailyKpi {
  /** 今日入账目标（随天数递增） */
  quota: number;
  /** 目前已入账（佣金+奖金） */
  earned: number;
}

/** 收工评分（按入账/KPI 完成度） */
export interface KpiResult extends DailyKpi {
  met: boolean;
  /** S/A/B/C/D */
  score: "S" | "A" | "B" | "C" | "D";
  /** 一句话评语（喜剧化） */
  note: string;
}

/** 收工日报（PHASE 17 Day Loop：POST /api/day/end 的返回） */
export interface DailyReport {
  /** 刚收工的是第几天 */
  day: number;
  /** 明天是第几天 */
  nextDay: number;
  sales: DailySaleRecord[];
  /** 今日总入账（佣金+奖金） */
  earned: number;
  /** 收工时总资产 */
  money: number;
  /** 今日 KPI 结算 + 评分 */
  kpi: KpiResult;
  /** 今日街区新闻（喜剧层） */
  news: string;
  /** 明早公司邮件（喜剧层 + 次日任务预告） */
  email: CompanyEmail;
}

/** 下发给客户端的游戏状态快照（NPC 已脱敏；商品无秘密，全量下发） */
export interface GameStatePublic {
  day: number;
  player: PlayerState;
  npcs: Record<string, NPCPublicView>;
  products: Record<string, Product>;
  /** 今天的特殊任务（随机荒诞商品） */
  task: TaskAssignment;
  /** 今早公司邮件（喜剧层，同 day 确定性生成） */
  email: CompanyEmail;
  /** 今日 KPI 进度（HUD 显示） */
  kpi: DailyKpi;
}

export type MessageRole = "player" | "npc";

export interface ConversationMessage {
  role: MessageRole;
  text: string;
  timestamp: number;
}

/** GLM 单次输出的结构（LLM_PROTOCOL.md §8），必须经过 Zod 验证 */
export interface LLMResponse {
  dialogue: string;
  emotion: Emotion;
  intent: NpcIntent;
  /** 系统推断的玩家意图，仅作记录，不等于 NPC 知道的真相 */
  playerIntent: string;
  topics: string[];
  /** 有限效果集合，禁止任意数值 */
  effects: EffectId[];
  awarenessChanges: Array<{ needId: string; delta: number }>;
  memoryCandidates: Array<{
    type: string;
    summary: string;
    importance: number;
    emotionalWeight: number;
  }>;
  /** 本回合回复里「我亲口说出口的私事」的 FactItem id（SALES_DESIGN A9；服务器白名单校验后记账） */
  revealed: string[];
  /** 玩家行为触发的成交条件 id（SALES_DESIGN A4；仅白名单内有效，服务器做双重确认） */
  conditionHints: string[];
}

/** 一次对话请求返回给客户端的完整结果 */
export interface ConversationResult {
  npcId: string;
  reply: {
    text: string;
    emotion: Emotion;
    intent: NpcIntent;
  };
  /** 效果结算后的 NPC 心理数值快照 */
  vitals: NPCVitals;
  /** 实际生效的效果（去重后） */
  effectsApplied: EffectId[];
  /** 本次成交的结算信息（未成交则无此字段） */
  purchase?: PurchaseSettlement;
  debug: LLMDebugInfo;
}

/** Debug Mode 数据（AGENTS.md §13，开发期保留） */
export interface LLMDebugInfo {
  /** true 表示本次回复来自 Safe Response 降级，而非真实 LLM */
  fallback: boolean;
  model: string;
  attempts: number;
  latencyMs: number;
  raw: string | null;
  error: string | null;
}
