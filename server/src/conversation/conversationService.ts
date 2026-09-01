import type {
  ConversationMessage,
  ConversationResult,
  FactItem,
  Product,
  PurchaseSettlement,
  SaleAdvice,
  SaleAdviceItem,
} from "@sellup/shared";
import type { LLMProvider } from "../llm/provider";
import type { NPCService } from "../npc/npcService";
import type { PlayerService } from "../game/playerService";
import type { ProductCatalog } from "../game/productData";
import type { Persistence } from "../game/persistence";
import type { DayService } from "../game/dayService";
import { evaluatePurchase, interestGateFor, trustGateFor, REJECT_EFFECTS } from "../sales/salesService";
import { logTurn, logSaleAttempt } from "../debug/logger";
import type { EffectId, Emotion, NPCState } from "@sellup/shared";

/** 情绪→信任的微结算：LLM 的 effects 对暖场偏吝啬，用 NPC 表现出的情绪补偿 */
const WARM_EMOTIONS: readonly Emotion[] = ["friendly", "amused", "excited"];
const HOSTILE_EMOTIONS: readonly Emotion[] = ["angry", "annoyed"];
/** 「让 TA 真心笑」条件的情绪双重确认（SALES_DESIGN A4） */
const LAUGH_EMOTIONS: readonly Emotion[] = ["amused", "excited"];

/** noInstall 关键词（李老师「这辈子不欠账」；服务器判定，LLM 只负责演） */
const INSTALL_RE = /(分期|0首付|零首付|月供|贷款)/;
/** 抢报价检测（钱大叔反向条件）：玩家消息里带两位数以上的价格 */
const PRICE_RE = /\d{2,5}\s*(元|块|¥)/;

export interface SaleAttemptResult {
  settlement?: PurchaseSettlement;
  rejected?: { reason: string };
  /** NPC 对这次递合同的反应台词（LLM 按裁决结果 + 对话上下文生成；LLM 不可用时是兜底罐头） */
  npcLine?: { text: string; emotion: Emotion };
  vitals: ConversationResult["vitals"];
  effectsApplied: string[];
}

interface SessionState {
  sessionId: string;
  turn: number;
  lastSaleTurn?: number;
  /** 最近一次明确拒绝/送客的回合号（npc_refusing 软消气用：隔几回合自动翻篇） */
  lastRefuseTurn?: number;
  /** 披露账本（SALES_DESIGN A9）：NPC 本会话亲口说出的 FactItem id */
  disclosed: Set<string>;
}

function tagHit(message: string, tags: string[]): boolean {
  return tags.some((t) => message.includes(t));
}

function allFacts(npc: NPCState): FactItem[] {
  return [...npc.knowledge, ...npc.worries];
}

/**
 * 会话管线（ARCHITECTURE.md §9 / SALES_DESIGN A4/A9）：
 * Player Input → Context Builder（含披露账本）→ LLM Adapter → Zod Validation
 * → 白名单过滤（revealed/conditionHints）→ 披露记账 → tag 效果闸门
 * → 条件认定（双重确认/服务器判定）→ Effect 结算 → 销售闸门 → 成交结算 → NPC Response
 */
export class ConversationService {
  /** 内存态会话历史，key = npcId（Phase 12/16 接入 SQLite） */
  private histories = new Map<string, ConversationMessage[]>();
  /** NPC 最近一次 intent（接住异议判定 / 递合同软条件用） */
  private lastIntents = new Map<string, string>();
  /** 复盘用会话标识 + 披露账本：npcId → 会话状态 */
  private sessions = new Map<string, SessionState>();
  /** 成交后必须再聊满几回合才能递下一份合同（防连点清背包） */
  private static SALE_COOLDOWN_TURNS = 2;
  /** 递合同前至少要聊过几句（防「敲门就塞货」，也让成交显得有来有回） */
  private static MIN_EXCHANGES = 2;
  /** 明确拒绝后，隔这么多回合就不再算「不想听你说话」（软消气，防死档感） */
  private static REFUSE_COOLDOWN_TURNS = 3;

  constructor(
    private readonly npcService: NPCService,
    private readonly llm: LLMProvider,
    private readonly catalog: ProductCatalog,
    private readonly player: PlayerService,
    private readonly persistence: Persistence,
    private readonly dayService: DayService,
  ) {}

  getHistory(npcId: string): ConversationMessage[] {
    return this.histories.get(npcId) ?? [];
  }

  reset(npcId: string): void {
    this.histories.delete(npcId);
    this.lastIntents.delete(npcId);
    this.sessions.delete(npcId);
    this.npcService.reset(npcId);
    this.persistence.markDirty();
  }

  /** 跨天（PHASE 17）：新的一天重新敲门——旧对话线程/披露账本清掉，购买记忆仍在 prompt 里 */
  resetForNewDay(): void {
    this.histories.clear();
    this.lastIntents.clear();
    this.sessions.clear();
  }

  /** 会话种子：首次对话时生成 sessionId（复盘 LOG 用） */
  private ensureSession(npcId: string): SessionState {
    let session = this.sessions.get(npcId);
    if (!session) {
      session = {
        sessionId: `${npcId}_${new Date().toISOString().replace(/[:.]/g, "-")}`,
        turn: 0,
        disclosed: new Set<string>(),
      };
      this.sessions.set(npcId, session);
    }
    return session;
  }

  async handlePlayerMessage(npcId: string, message: string): Promise<ConversationResult> {
    const npc = this.npcService.getNPC(npcId);
    if (!npc) throw new Error(`NPC 不存在: ${npcId}`);
    const session = this.ensureSession(npcId);
    const vitalsBefore: ConversationResult["vitals"] = { ...npc.vitals };

    let history = this.histories.get(npcId);
    if (!history) {
      // 敲门状态：NPC 已经开过门并打了招呼，LLM 从历史知道这一点
      history = [
        { role: "npc", text: npc.hello[0] ?? "……", timestamp: Date.now() },
      ];
      this.histories.set(npcId, history);
    }

    const playerMessage: ConversationMessage = {
      role: "player",
      text: message,
      timestamp: Date.now(),
    };
    history.push(playerMessage);

    const mentionedProducts = this.catalog.detectMentioned(message);

    // noInstall 关键词（服务器判定，A4 通道3）：本回合 NPS 怒 + 效果惩罚 + 禁止成交
    const installRage = npc.flags.noInstall === true && INSTALL_RE.test(message);

    const { response, debug } = await this.llm.generateNPCResponse({
      npc,
      history: history.slice(0, -1), // 最新一句单独作为最终 user 消息
      playerMessage: message,
      mentionedProducts,
      productNames: this.catalog.productNames(),
      disclosedFacts: allFacts(npc).filter((f) => session.disclosed.has(f.id)),
    });

    // ===== 白名单过滤（A4/A9：LLM 只能引用注入过的 id，幻觉 id 静默丢弃）=====
    const factIds = new Set(allFacts(npc).map((f) => f.id));
    const conditionIds = new Set(npc.dealConditions.map((c) => c.id));
    const revealedIds = response.revealed.filter((id) => factIds.has(id));
    const hintIds = response.conditionHints.filter((id) => conditionIds.has(id));

    // 披露记账（状态，不随历史截断丢失）
    for (const id of revealedIds) session.disclosed.add(id);

    // ===== tag 效果闸门（A9.1-5 防御纵深）=====
    // 玩家在接 NPC 自己说过的话（且没踩未披露雷区）→ 丢弃 LLM 给的怀疑效果
    const disclosedTags = new Set(
      allFacts(npc)
        .filter((f) => session.disclosed.has(f.id))
        .flatMap((f) => f.tags),
    );
    const hitCoveredWorry = npc.worries.some(
      (w) =>
        tagHit(message, w.tags) &&
        (session.disclosed.has(w.id) || w.tags.some((t) => disclosedTags.has(t))),
    );
    const hitUncoveredWorry = npc.worries.some(
      (w) =>
        tagHit(message, w.tags) &&
        !session.disclosed.has(w.id) &&
        !w.tags.some((t) => disclosedTags.has(t)),
    );
    const suspicionSuppressed = hitCoveredWorry && !hitUncoveredWorry;
    let effects: EffectId[] = suspicionSuppressed
      ? response.effects.filter(
          (e) => e !== "suspicion_up_small" && e !== "suspicion_up_medium",
        )
      : [...response.effects];

    // noInstall 惩罚效果（服务器直加，绕过 LLM）
    if (installRage) {
      effects = [
        ...new Set<EffectId>([
          ...effects,
          "trust_down_medium",
          "suspicion_up_medium",
          "patience_down_small",
        ]),
      ];
    }

    // ===== Server Authority：效果结算只在这里发生 =====
    const appliedVitals = this.npcService.applyNPCEffect(npcId, effects);
    if (!appliedVitals) throw new Error(`NPC 效果结算失败: ${npcId}`);
    this.npcService.setMood(npcId, installRage ? "angry" : response.emotion);

    // 情绪微结算：聊得开心=信任小升+怀疑泄压；被惹怒=信任小降。
    // noInstall 激怒回合跳过（否则 warm 泄压会抵消惩罚）
    if (!installRage) {
      if (WARM_EMOTIONS.includes(response.emotion)) {
        this.npcService.applyNPCEffect(npcId, ["trust_up_small", "suspicion_down_small"]);
      } else if (HOSTILE_EMOTIONS.includes(response.emotion)) {
        this.npcService.applyNPCEffect(npcId, ["trust_down_small"]);
      }
    }

    const latestVitals = this.npcService.getNPC(npcId)!.vitals;
    const day = this.dayService.currentDay;

    // ===== 条件认定（A4：双重确认 + 服务器判定）=====
    const appliedFlags: string[] = [];
    for (const hintId of hintIds) {
      const cond = npc.dealConditions.find((c) => c.id === hintId);
      if (!cond) continue;
      if (cond.count) continue; // count 型走服务器判定，不收 hint
      if (cond.flag === "price_first_by_player") continue; // 抢报价只认正则权威判定，hint 不可信（实测模型会误标）
      if (cond.negative) {
        // 反向条件双重确认（都要满足）：NPC 明确表现出怀疑/拒绝，**且**怀疑值本回合真的上升。
        // 只看 intent 会误伤——最难缠的 NPC 听谁推销都摆怀疑脸，不等于玩家在吹牛。
        const confirmed =
          (response.intent === "show_suspicion" || response.intent === "refuse") &&
          latestVitals.suspicion > vitalsBefore.suspicion;
        if (confirmed) {
          this.npcService.setConditionFlag(npcId, cond.flag, day);
          appliedFlags.push(cond.flag);
        }
      } else {
        // 正向条件：make_laugh 需要 amused/excited 情绪佐证，其余采信 hint
        if (cond.id === "make_laugh" && !LAUGH_EMOTIONS.includes(response.emotion)) continue;
        this.npcService.setConditionFlag(npcId, cond.flag, day);
        appliedFlags.push(cond.flag);
      }
    }

    // 服务器侧旁证（SALES_DESIGN A4 tags 一鱼两吃）：带 confirmTags 的正向条件，
    // 玩家消息命中关键词即记账——LLM 漏打标也救得回来（实测：把人聊红眼圈了模型也未必打标）
    for (const cond of npc.dealConditions) {
      if (cond.negative || cond.count || !cond.confirmTags) continue;
      if (npc.conditionFlags[cond.flag]) continue;
      if (tagHit(message, cond.confirmTags)) {
        this.npcService.setConditionFlag(npcId, cond.flag, day);
        appliedFlags.push(`${cond.flag}(tag)`);
      }
    }

    // 接住异议（count 型，纯服务器判定）：上一回合 NPC 拒绝/还价，
    // 本回合聊完信任没有再降 → 计一次「接住」
    const prevIntent = this.lastIntents.get(npcId);
    if (prevIntent === "refuse" || prevIntent === "counter_offer") {
      const objectionsCond = npc.dealConditions.find((c) => c.count && !c.negative);
      if (objectionsCond && latestVitals.trust >= vitalsBefore.trust) {
        this.npcService.setConditionFlag(npcId, objectionsCond.flag, day, true);
        appliedFlags.push(`${objectionsCond.flag}(${npc.conditionFlags[objectionsCond.flag]?.count ?? 1})`);
      }
    }

    // 抢报价反向条件（正则判定，A4 通道1）
    const priceCond = npc.dealConditions.find((c) => c.flag === "price_first_by_player");
    if (priceCond && PRICE_RE.test(message)) {
      this.npcService.setConditionFlag(npcId, priceCond.flag, day);
      appliedFlags.push(priceCond.flag);
    }

    // ===== 销售闸门（自动通道）：noInstall 激怒回合禁止成交 =====
    const purchase = installRage
      ? undefined
      : this.trySettlePurchase(npcId, mentionedProducts, response.intent);
    this.lastIntents.set(npcId, response.intent);

    const npcMessage: ConversationMessage = {
      role: "npc",
      text: response.dialogue,
      timestamp: Date.now(),
    };
    history.push(npcMessage);
    session.turn += 1;

    // 记录明确拒绝/送客的回合（attemptSale 的 npc_refusing 在冷却回合数后自动过期）
    if (response.intent === "refuse" || response.intent === "end_conversation") {
      session.lastRefuseTurn = session.turn;
    }

    logTurn({
      type: "turn",
      time: new Date().toISOString(),
      sessionId: session.sessionId,
      npcId,
      turn: session.turn,
      playerMessage: message,
      npcReply: response.dialogue,
      emotion: response.emotion,
      intent: response.intent,
      playerIntent: response.playerIntent,
      vitalsBefore,
      vitalsAfter: latestVitals,
      effectsApplied: effects,
      purchase: purchase
        ? `${purchase.productName} 佣金+${purchase.commission}${purchase.bonus ? ` 奖金+${purchase.bonus}` : ""}`
        : undefined,
      moneyAfter: this.player.getMoney(),
      raw: debug.raw,
      fallback: debug.fallback,
      error: debug.error,
      latencyMs: debug.latencyMs,
      revealed: revealedIds,
      conditionFlags: appliedFlags.length > 0 ? appliedFlags : undefined,
      suspicionSuppressed: suspicionSuppressed || undefined,
      installRage: installRage || undefined,
    });

    return {
      npcId,
      reply: {
        text: response.dialogue,
        emotion: response.emotion,
        intent: response.intent,
      },
      vitals: latestVitals,
      effectsApplied: effects,
      ...(purchase ? { purchase } : {}),
      debug,
    };
  }

  /**
   * 自动成交通道：聊天中 LLM 给出 intent=agree 时尝试结算。
   */
  private trySettlePurchase(
    npcId: string,
    mentionedProducts: ReturnType<ProductCatalog["detectMentioned"]>,
    intent: string,
  ): PurchaseSettlement | undefined {
    if (intent !== "agree") return undefined;
    for (const product of mentionedProducts) {
      const settlement = this.settleIfGatePassed(npcId, product);
      if (settlement) return settlement;
    }
    return undefined;
  }

  /**
   * 手动成交通道（递合同）：玩家对 NPC 推某件商品，服务器按事实闸门裁决。
   * 被拒有代价：耐心↓ 怀疑↑。
   * 裁决之后由 LLM 把结果演成贴合当前对话的台词（成败是事实，台词是演绎）。
   */
  async attemptSale(npcId: string, productId: string): Promise<SaleAttemptResult> {
    const npc = this.npcService.getNPC(npcId);
    const product = this.catalog.all[productId];
    if (!npc || !product) {
      throw new Error(`递合同参数错误: npc=${npcId} product=${productId}`);
    }
    const vitalsBefore: ConversationResult["vitals"] = { ...npc.vitals };

    const playerTurns = (this.histories.get(npcId) ?? []).filter(
      (m) => m.role === "player",
    ).length;
    if (playerTurns < ConversationService.MIN_EXCHANGES) {
      return {
        rejected: { reason: "too_early" },
        vitals: npc.vitals,
        effectsApplied: [],
      };
    }

    // 成交冷却：刚成交一件必须再聊几回合才能递下一份（防连点清背包）
    const session = this.ensureSession(npcId);
    if (
      session.lastSaleTurn !== undefined &&
      session.turn - session.lastSaleTurn < ConversationService.SALE_COOLDOWN_TURNS
    ) {
      return {
        rejected: { reason: "too_soon" },
        vitals: npc.vitals,
        effectsApplied: [],
      };
    }

    const gate = evaluatePurchase(npc, product);
    if (!gate.passed && gate.reason !== undefined) {
      // 冷却中的拒绝（3 回合内明确送过客）覆盖拒绝原因文案，但不改变闸门本身的 reason
      const refusingCooldown =
        session.lastRefuseTurn !== undefined &&
        session.turn - session.lastRefuseTurn < ConversationService.REFUSE_COOLDOWN_TURNS;
      // 已购过的商品重复递不算冒犯，不扣代价
      let effectsApplied: string[] = [];
      if (gate.reason !== "already_owned") {
        this.npcService.applyNPCEffect(npcId, REJECT_EFFECTS);
        effectsApplied = [...REJECT_EFFECTS];
      }
      const vitalsAfter = this.npcService.getNPC(npcId)!.vitals;
      const reason = refusingCooldown ? "npc_refusing" : gate.reason;
      const npcLine = await this.saleLine(npcId, product, false, reason);
      logSaleAttempt({
        type: "sale",
        time: new Date().toISOString(),
        sessionId: this.ensureSession(npcId).sessionId,
        npcId,
        productId: product.id,
        productName: product.name,
        passed: false,
        reason,
        vitalsBefore,
        vitalsAfter,
        effectsApplied,
      });
      return {
        rejected: { reason },
        npcLine,
        vitals: vitalsAfter,
        effectsApplied,
      };
    }

    const settlement = this.settleIfGatePassed(npcId, product);
    if (!settlement) {
      // 理论不可达（gate 已通过），防御性返回
      return {
        rejected: { reason: "unknown" },
        vitals: this.npcService.getNPC(npcId)!.vitals,
        effectsApplied: [],
      };
    }
    const npcLine = await this.saleLine(npcId, product, true);
    return {
      settlement,
      npcLine,
      vitals: this.npcService.getNPC(npcId)!.vitals,
      effectsApplied: [],
    };
  }

  /** 递合同反应台词（成败已裁决，LLM 只做演绎；失败走 adapter 内的兜底罐头） */
  private async saleLine(
    npcId: string,
    product: NonNullable<ReturnType<ProductCatalog["detectMentioned"]>[number]>,
    passed: boolean,
    reason?: string,
  ): Promise<SaleAttemptResult["npcLine"]> {
    try {
      const line = await this.llm.generateSaleLine({
        npc: this.npcService.getNPC(npcId)!,
        history: this.histories.get(npcId) ?? [],
        product,
        verdict: { passed, reason },
      });
      return { text: line.dialogue, emotion: line.emotion };
    } catch {
      return undefined;
    }
  }

  /** 正向条件的「怎么补」行动提示（按条件 id 给人话，不泄露判定细节） */
  private static CONDITION_ACTIONS: Record<string, string> = {
    make_laugh: "先想办法把 TA 逗笑（聊点开心的、接 TA 的玩笑）",
    mention_family: "真诚聊聊 TA 的家人——聊到具体的人和事才算数",
    mention_pet: "聊聊 TA 家的宠物，这是 TA 的话匣子",
    sincere_apology: "替坑过 TA 的同行真诚道个歉",
    handle_objections_2: "TA 拒绝过你——稳住，别让 TA 更生气，接住质疑就行",
  };

  /**
   * 实时攻略（📖 面板）：按成交闸门顺序输出当前诊断——
   * 每道闸过没过、差多少、怎么补；并推荐背包里最接近成交的商品。
   * 数据全部来自服务器权威状态（hidden 条件只给行动提示，不泄露判定细节）。
   */
  getAdvice(npcId: string): SaleAdvice {
    const npc = this.npcService.getNPC(npcId);
    if (!npc) throw new Error(`NPC 不存在: ${npcId}`);
    const session = this.sessions.get(npcId);
    const turn = session?.turn ?? 0;
    const playerTurns = (this.histories.get(npcId) ?? []).filter((m) => m.role === "player").length;
    const items: SaleAdviceItem[] = [];
    const gate = trustGateFor(npc);

    // 0. 程序闸：先聊够 / 消气
    const tooEarly = playerTurns < ConversationService.MIN_EXCHANGES;
    if (tooEarly) {
      items.push({ ok: false, text: `先聊热乎再递合同（还差 ${ConversationService.MIN_EXCHANGES - playerTurns} 句）` });
    }
    const refusing =
      session?.lastRefuseTurn !== undefined &&
      turn - session.lastRefuseTurn < ConversationService.REFUSE_COOLDOWN_TURNS;
    if (refusing) {
      items.push({ ok: false, text: "TA 刚送过客还在气头上——换个话题聊几句，过几回合再谈" });
    }

    // 1. 隐藏条件
    for (const cond of npc.dealConditions) {
      const record = npc.conditionFlags[cond.flag];
      if (cond.negative) {
        items.push(
          record
            ? { ok: false, text: "你踩了 TA 的雷——今天没得谈了，明天 TA 会消气" }
            : { ok: true, text: "没踩雷（保持住）" },
        );
      } else if (cond.count) {
        const have = record?.count ?? 0;
        const need = cond.count;
        items.push(
          have >= need
            ? { ok: true, text: "TA 的心结你已经解开了" }
            : { ok: false, text: `${ConversationService.CONDITION_ACTIONS[cond.id] ?? "再聊聊 TA 在意的事"}（还差 ${need - have} 次）` },
        );
      } else {
        items.push(
          record
            ? { ok: true, text: "TA 对你的好感条件已达成" }
            : { ok: false, text: ConversationService.CONDITION_ACTIONS[cond.id] ?? "再聊聊 TA 在意的事" },
        );
      }
    }

    // 2. 信任
    items.push(
      npc.vitals.trust >= gate
        ? { ok: true, text: `信任 ${npc.vitals.trust}（门槛 ${gate}）已过` }
        : { ok: false, text: `信任 ${npc.vitals.trust}/${gate}——还差 ${gate - npc.vitals.trust}：坦白身份、说到心坎里、被问倒还认账都涨` },
    );

    // 3. 怀疑
    items.push(
      npc.vitals.suspicion < 50
        ? { ok: true, text: `怀疑 ${npc.vitals.suspicion}/50 正常` }
        : { ok: false, text: `怀疑 ${npc.vitals.suspicion}/50 爆表——聊点 TA 开心的（TA 表现开心就泄压），别再踩敏感话题` },
    );

    // 4. 商品匹配：挑背包里最接近成交的
    const carried = this.catalog.inventoryIds();
    const owned = new Set(npc.purchased.map((p) => p.productId));
    let best: { product: Product; blockers: number; reason?: string } | null = null;
    for (const id of carried) {
      const product = this.catalog.all[id];
      if (!product || owned.has(id)) continue;
      const r = evaluatePurchase(npc, product);
      if (r.passed) {
        best = { product, blockers: -1 };
        break;
      }
      // 排序权重：买不起最优先排除，其次兴趣，其余闸是共性的已单列
      const weight = r.reason === "cannot_afford" ? 2 : r.reason === "interest_low" ? 1 : 0;
      if (!best || weight < best.blockers) best = { product, blockers: weight, reason: r.reason };
    }

    let canCloseNow = false;
    if (best) {
      if (best.blockers === -1 && !tooEarly && !refusing) {
        canCloseNow = true;
        items.push({ ok: true, text: `现在就能成交：${best.product.emoji} ${best.product.name}（¥${best.product.price}）——去递合同！` });
      } else if (best.reason === "cannot_afford") {
        items.push({ ok: false, text: `TA 存款只有约 ¥${npc.budget.savings}——背包里只剩 ¥${best.product.price} 的 ${best.product.name}，TA 买不起，去别家看看` });
      } else if (best.reason === "interest_low") {
        items.push({ ok: false, text: `${best.product.emoji} ${best.product.name} 需要兴趣 ≥${interestGateFor(best.product)}（现在 ${npc.vitals.interest}）——先把 TA 聊动心` });
      }
    } else {
      const ownedNames = npc.purchased
        .map((p) => this.catalog.all[p.productId]?.name ?? p.productId)
        .join("、");
      items.push({ ok: false, text: `TA 已经把你背包里能买的都买了（${ownedNames}）——广撒网去敲别家的门` });
    }

    return {
      npcId,
      canCloseNow,
      recommend: best
        ? { productId: best.product.id, productName: best.product.name, emoji: best.product.emoji, price: best.product.price }
        : undefined,
      items,
    };
  }

  /** 递合同结算 + 复盘日志的公共出口 */
  private resolveSale(
    npcId: string,
    product: NonNullable<ReturnType<ProductCatalog["detectMentioned"]>[number]>,
  ): PurchaseSettlement {
    const npc = this.npcService.getNPC(npcId)!;
    const session = this.ensureSession(npcId);
    // 连续推销的社交代价：第 2 件起 NPC 会起疑（怀疑是棘轮，只涨不跌）
    if (npc.purchased.length >= 1) {
      this.npcService.applyNPCEffect(npcId, ["suspicion_up_small"]);
    }
    const isTaskProduct = product.id === this.catalog.task.productId;
    const bonus = isTaskProduct && !this.catalog.taskCompleted ? this.catalog.task.bonus : 0;
    this.player.addMoney(product.commission + bonus);
    if (isTaskProduct) {
      this.catalog.completeTask();
      this.player.removeProduct(product.id);
    }
    this.npcService.deductBudget(npcId, product.price);
    this.npcService.recordPurchase(npcId, product.id, product.price, this.dayService.currentDay);
    this.dayService.recordSale({
      npcId,
      npcName: npc.name,
      productId: product.id,
      productName: product.name,
      emoji: product.emoji,
      price: product.price,
      commission: product.commission,
      bonus,
    });
    session.lastSaleTurn = session.turn;
    this.persistence.markDirty();

    return {
      productId: product.id,
      productName: product.name,
      emoji: product.emoji,
      price: product.price,
      commission: product.commission,
      bonus,
      money: this.player.getMoney(),
      taskCompleted: isTaskProduct,
    };
  }

  /** 闸门通过 → 结算；并落盘递合同日志 */
  private settleIfGatePassed(
    npcId: string,
    product: NonNullable<ReturnType<ProductCatalog["detectMentioned"]>[number]>,
  ): PurchaseSettlement | undefined {
    const npc = this.npcService.getNPC(npcId)!;
    if (!evaluatePurchase(npc, product).passed) return undefined;
    const vitalsBefore: ConversationResult["vitals"] = { ...npc.vitals };
    const repeatSale = npc.purchased.length >= 1;
    const settlement = this.resolveSale(npcId, product);
    logSaleAttempt({
      type: "sale",
      time: new Date().toISOString(),
      sessionId: this.ensureSession(npcId).sessionId,
      npcId,
      productId: product.id,
      productName: product.name,
      passed: true,
      vitalsBefore,
      vitalsAfter: this.npcService.getNPC(npcId)!.vitals,
      effectsApplied: repeatSale ? ["suspicion_up_small"] : [],
      commission: product.commission,
      bonus: settlement.bonus,
      moneyAfter: settlement.money,
    });
    return settlement;
  }
}
