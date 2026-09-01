import type { EffectId, NPCVitals } from "./types";

/**
 * 有限效果系统（ARCHITECTURE.md §15）。
 * LLM 只能选择效果名，永远不能产生任意数值；
 * 所有 NPC 状态变化必须经由这里结算（ARCHITECTURE.md §14）。
 */
export const EFFECT_DELTAS: Record<EffectId, Partial<NPCVitals>> = {
  trust_up_small: { trust: 5 },
  trust_up_medium: { trust: 10 },
  trust_down_small: { trust: -5 },
  trust_down_medium: { trust: -10 },
  interest_up_small: { interest: 5 },
  interest_up_medium: { interest: 10 },
  interest_down_small: { interest: -5 },
  suspicion_up_small: { suspicion: 8 },
  suspicion_up_medium: { suspicion: 15 },
  /** 服务器保留效果：聊暖泄压用，LLM 不可选择（schemas.ts 里被过滤） */
  suspicion_down_small: { suspicion: -8 },
  patience_down_small: { patience: -10 },
};

export const VITALS_MIN = 0;
export const VITALS_MAX = 100;

const VITAL_KEYS: Array<keyof Omit<NPCVitals, "mood">> = [
  "trust",
  "interest",
  "suspicion",
  "patience",
];

function clamp(value: number): number {
  return Math.max(VITALS_MIN, Math.min(VITALS_MAX, value));
}

export interface EffectApplyResult {
  vitals: NPCVitals;
  /** 去重后实际生效的效果 */
  applied: EffectId[];
}

/**
 * 把一组效果结算到心理数值上，返回新的 vitals（不修改入参）。
 */
export function applyEffects(
  current: NPCVitals,
  effectIds: readonly EffectId[],
): EffectApplyResult {
  const vitals: NPCVitals = { ...current };
  const applied: EffectId[] = [];

  for (const id of effectIds) {
    if (applied.includes(id)) continue;
    applied.push(id);

    const deltas = EFFECT_DELTAS[id];
    for (const key of VITAL_KEYS) {
      const delta = deltas[key];
      if (typeof delta === "number") {
        vitals[key] = clamp(vitals[key] + delta);
      }
    }
  }

  return { vitals, applied };
}
