import type {
  ConversationMessage,
  Emotion,
  FactItem,
  LLMDebugInfo,
  LLMResponse,
  NPCState,
  Product,
} from "@sellup/shared";

/** 传给 LLM 的完整上下文（LLM_PROTOCOL.md §15 的注入顺序在这里组装） */
export interface NPCContext {
  npc: NPCState;
  history: ConversationMessage[];
  /** 玩家最新一句话 */
  playerMessage: string;
  /** 玩家这句话提到的商品（没提到则为空；LLM_PROTOCOL §17） */
  mentionedProducts: Product[];
  /** productId → 展示名。prompt 一律用中文名，禁止把内部 ID 念进台词 */
  productNames?: Record<string, string>;
  /** 本会话 NPC 已亲口向玩家披露过的私事（SALES_DESIGN A9 披露账本；服务器记账，不随历史截断丢失） */
  disclosedFacts: FactItem[];
}

/** 递合同的台词生成上下文：裁决已由服务器做出，LLM 只负责把它演出来 */
export interface SaleLineContext {
  npc: NPCState;
  history: ConversationMessage[];
  product: Product;
  verdict: { passed: boolean; reason?: string };
}

export interface LLMCallResult {
  response: LLMResponse;
  debug: LLMDebugInfo;
}

/**
 * LLM 抽象接口（ARCHITECTURE.md §10）。
 * 未来替换 Claude / OpenAI / 本地模型时，不修改 Game Logic。
 */
export interface LLMProvider {
  generateNPCResponse(context: NPCContext): Promise<LLMCallResult>;
  /** 递合同反应台词：成败已定（Server Authority），LLM 只给符合人设与上下文的一句话 */
  generateSaleLine(context: SaleLineContext): Promise<{ dialogue: string; emotion: Emotion }>;
}
