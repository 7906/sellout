import { applyEffects } from "@sellup/shared";
import { trustGateFor } from "../sales/salesService";
import type {
  EffectId,
  NPCBudget,
  Emotion,
  NPCPublicView,
  NPCState,
  NPCVitals,
  PurchasedItem,
} from "@sellup/shared";
import { createInitialNPCs } from "./npcData";

/**
 * NPC 状态的唯一权威入口（ARCHITECTURE.md §3 / §14）。
 * 所有 vitals 变化必须走 applyNPCEffect，禁止任何模块直接改数值。
 */
export class NPCService {
  private npcs: Record<string, NPCState>;
  /** 开场数值快照：跨天重置时恢复耐心用（信任/怀疑等沉淀数据不重置） */
  private readonly initialVitals: Record<string, NPCVitals>;

  constructor() {
    const fresh = createInitialNPCs();
    this.npcs = fresh;
    this.initialVitals = Object.fromEntries(
      Object.entries(fresh).map(([id, npc]) => [id, { ...npc.vitals }]),
    );
  }

  getNPC(id: string): NPCState | undefined {
    return this.npcs[id];
  }

  listNPCs(): NPCState[] {
    return Object.values(this.npcs);
  }

  /** 客户端脱敏视图：不下发 persona / budget / gullible / dealConditions / awareness */
  getPublicView(id: string): NPCPublicView | undefined {
    const npc = this.npcs[id];
    if (!npc) return undefined;
    return {
      id: npc.id,
      name: npc.name,
      emoji: npc.emoji,
      identity: npc.identity,
      hello: npc.hello,
      clues: npc.clues,
      strategyHints: npc.strategyHints,
      vitals: npc.vitals,
      saleTrustGate: trustGateFor(npc),
    };
  }

  listPublicViews(): NPCPublicView[] {
    return this.listNPCs()
      .map((npc) => this.getPublicView(npc.id))
      .filter((v): v is NPCPublicView => v !== undefined);
  }

  /** 统一的效果结算入口：LLM 只能通过有限效果集合影响 NPC */
  applyNPCEffect(id: string, effects: readonly EffectId[]): NPCVitals | undefined {
    const npc = this.npcs[id];
    if (!npc) return undefined;
    const { vitals } = applyEffects(npc.vitals, effects);
    npc.vitals = vitals;
    return vitals;
  }

  /** NPC 表达的情绪即当前心情 */
  setMood(id: string, mood: Emotion): void {
    const npc = this.npcs[id];
    if (npc) npc.vitals = { ...npc.vitals, mood };
  }

  /** 记录购买（成交结算的唯一入口，禁止其他模块直接改 purchased） */
  recordPurchase(id: string, productId: string, price: number, day: number): void {
    const npc = this.npcs[id];
    if (npc) npc.purchased.push({ productId, price, day });
  }

  /**
   * 成交条件记账（SALES_DESIGN A4-A6；唯一入口）：
   * - increment=true 用于 count 型条件（接住异议 +1）；
   * - 普通条件置 1（幂等，重复达成不覆盖首次 setAtDay）。
   */
  setConditionFlag(id: string, flag: string, day: number, increment = false): void {
    const npc = this.npcs[id];
    if (!npc) return;
    const prev = npc.conditionFlags[flag];
    npc.conditionFlags[flag] = {
      count: increment ? (prev?.count ?? 0) + 1 : (prev?.count ?? 0) || 1,
      setAtDay: prev?.setAtDay ?? day,
    };
  }

  /** 扣 NPC 存款（IMPLEMENTATION_PLAN PHASE 11：NPC Budget -= Price） */
  deductBudget(id: string, amount: number): void {
    const npc = this.npcs[id];
    if (npc) {
      npc.budget = { ...npc.budget, savings: Math.max(0, npc.budget.savings - amount) };
    }
  }

  reset(id: string): void {
    const fresh = createInitialNPCs()[id];
    if (fresh) this.npcs[id] = fresh;
  }

  /** 全部 NPC 回出厂（新游戏用）：心理数值/购买/条件账本全清 */
  resetAll(): void {
    this.npcs = createInitialNPCs();
  }

  /** 从存档恢复：心理数值 + 购买记录 + 条件账本（未知 id 忽略） */
  importState(
    data: Record<
      string,
      {
        vitals: NPCVitals;
        purchased: PurchasedItem[];
        budget: NPCBudget;
        conditionFlags?: NPCState["conditionFlags"];
      }
    >,
  ): void {
    for (const [id, snap] of Object.entries(data)) {
      const npc = this.npcs[id];
      if (!npc) continue;
      npc.vitals = { ...npc.vitals, ...snap.vitals };
      npc.purchased = Array.isArray(snap.purchased) ? snap.purchased : [];
      npc.conditionFlags = snap.conditionFlags ?? {};
      if (snap.budget) npc.budget = snap.budget;
    }
  }

  /**
   * NPC 过夜（PHASE 17 跨天）：耐心回满、心情归零、**反向条件清空**（雷区隔夜愿再给机会，
   * 但怀疑代价不退）；正向条件与购买记忆保留（SALES_DESIGN A6）。
   */
  resetDaily(): void {
    for (const npc of this.listNPCs()) {
      for (const cond of npc.dealConditions) {
        if (cond.negative) delete npc.conditionFlags[cond.flag];
      }
      const initial = this.initialVitals[npc.id];
      npc.vitals = {
        ...npc.vitals,
        patience: initial?.patience ?? 100,
        mood: "neutral",
      };
    }
  }
}
