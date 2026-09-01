import type { NPCState, Product } from "@sellup/shared";

/**
 * 销售闸门（ARCHITECTURE.md §12 / SALES_DESIGN A5）。
 *
 * 成交由玩家「递合同」发起，服务器按事实条件裁决：
 * 已购 → 反向条件（当日雷区）→ 正向条件 → 信任 → 怀疑 → 兴趣 → 预算。
 * LLM 负责把 NPC 演成「人」并把行为认定打标（conditionHints），
 * 但打标要过白名单 + 双重确认；服务器永远不能被对话文本凭空说服。
 */

export const SALE_THRESHOLD = {
  /** 基准信任线，实际门槛 = 基准 ÷ gullible（耳根软的更容易被说服） */
  baseTrust: 45,
  suspicionMax: 50,
} as const;

/** 信任门槛随已购件数递增：卖给同一个人越多，越难再卖（防一次过线清空背包） */
export const TRUST_GATE_STEP_PER_PURCHASE = 5;

/** 兴趣门槛（SALES_DESIGN A7）：越贵的货越要「TA 自己动了念头」 */
export function interestGateFor(product: Product): number {
  if (product.price >= 1000) return 40;
  if (product.price >= 250) return 25;
  return 0;
}

/** 该 NPC 的当前信任门槛（gullible 缩放 + 已购件数递增） */
export function trustGateFor(npc: NPCState): number {
  const base = Math.round(SALE_THRESHOLD.baseTrust / npc.gullible);
  return base + npc.purchased.length * TRUST_GATE_STEP_PER_PURCHASE;
}

/** 递合同被拒的代价 */
export const REJECT_EFFECTS = ["patience_down_small", "suspicion_up_small"] as const;

export interface SaleGateResult {
  passed: boolean;
  /** 未通过原因（下发客户端映射为提示） */
  reason?: string;
}

/**
 * 成交条件账本检查（SALES_DESIGN A3-A6）：
 * 先查全部反向条件（踩雷 > 一切——雷区当天判死），再查正向（count 达标 / flag 存在）；
 * 正向跨天保留，反向每天由 resetDaily 清空。
 */
export function evaluateConditions(npc: NPCState): SaleGateResult {
  for (const cond of npc.dealConditions) {
    if (!cond.negative) continue;
    if (npc.conditionFlags[cond.flag]) return { passed: false, reason: "condition_failed" };
  }
  for (const cond of npc.dealConditions) {
    if (cond.negative) continue;
    const record = npc.conditionFlags[cond.flag];
    if (cond.count) {
      if ((record?.count ?? 0) < cond.count) {
        return { passed: false, reason: "condition_not_met" };
      }
    } else if (!record) {
      return { passed: false, reason: "condition_not_met" };
    }
  }
  return { passed: true };
}

export function evaluatePurchase(npc: NPCState, product: Product): SaleGateResult {
  if (npc.purchased.some((p) => p.productId === product.id)) {
    return { passed: false, reason: "already_owned" };
  }
  const conditions = evaluateConditions(npc);
  if (!conditions.passed) return conditions;
  if (npc.vitals.trust < trustGateFor(npc)) {
    return { passed: false, reason: "trust_low" };
  }
  if (npc.vitals.suspicion >= SALE_THRESHOLD.suspicionMax) {
    return { passed: false, reason: "suspicion_high" };
  }
  if (npc.vitals.interest < interestGateFor(product)) {
    return { passed: false, reason: "interest_low" };
  }
  if (npc.budget.savings < product.price) {
    return { passed: false, reason: "cannot_afford" };
  }
  return { passed: true };
}
