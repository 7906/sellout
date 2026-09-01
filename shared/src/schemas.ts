import { z } from "zod";
import { EFFECT_IDS, EMOTIONS, NPC_INTENTS } from "./types";
import type { EffectId, Emotion, NpcIntent } from "./types";

/**
 * LLM 输出契约（LLM_PROTOCOL.md §8）。
 * LLM 的原始文本永远不能直接当成游戏事实，必须过这里。
 *
 * 容错策略（Safe Response 原则）：
 * 非法枚举值映射到安全默认值、非法效果直接过滤，
 * 保证单次输出的个别坏字段不会丢弃整段合法台词。
 */
const lowerTrim = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);

const toSafeEmotion = (v: unknown): unknown => {
  const s = lowerTrim(v);
  return EMOTIONS.includes(s as Emotion) ? s : "neutral";
};

const toSafeIntent = (v: unknown): unknown => {
  const s = lowerTrim(v);
  return NPC_INTENTS.includes(s as NpcIntent) ? s : "answer";
};

/** 服务器保留效果：由服务器规则结算，LLM 的输出中即使出现也要过滤掉 */
const SERVER_ONLY_EFFECTS: ReadonlySet<string> = new Set(["suspicion_down_small"]);

const filterValidEffects = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.filter((e) => EFFECT_IDS.includes(e as EffectId) && !SERVER_ONLY_EFFECTS.has(String(e)))
    : v;

const awarenessChangeSchema = z.object({
  needId: z.string().max(50),
  delta: z.number().min(-1).max(1),
});

const memoryCandidateSchema = z.object({
  type: z.string().max(50),
  summary: z.string().max(300),
  importance: z.coerce.number().min(0).max(10),
  emotionalWeight: z.coerce.number().min(0).max(10),
});

/** 次要字段只剔除非法条目，不让模型的一个坏字段丢掉整段合法台词 */
const filterValidItems = <T>(schema: z.ZodType<T>) => (v: unknown): unknown =>
  Array.isArray(v)
    ? v.filter((item) => schema.safeParse(item).success).slice(0, 5)
    : v;

/** id/字符串白名单过滤器：只保留白名单内的 id（防 LLM 幻觉，SALES_DESIGN A4/A9） */
const filterWhitelistedIds =
  (allowed: readonly string[]) => (v: unknown): unknown =>
    Array.isArray(v)
      ? [...new Set(v.filter((id) => typeof id === "string" && allowed.includes(id)))]
      : v;

export const llmResponseSchema = z.object({
  dialogue: z.string().min(1).max(1000),
  emotion: z.preprocess(toSafeEmotion, z.enum(EMOTIONS)),
  intent: z.preprocess(toSafeIntent, z.enum(NPC_INTENTS)),
  playerIntent: z.string().max(100).default("unknown"),
  topics: z.array(z.string().max(50)).max(8).default([]),
  effects: z.preprocess(filterValidEffects, z.array(z.enum(EFFECT_IDS)).max(3)).default([]),
  awarenessChanges: z
    .preprocess(
      filterValidItems(awarenessChangeSchema),
      z.array(awarenessChangeSchema).max(5),
    )
    .default([]),
  memoryCandidates: z
    .preprocess(
      filterValidItems(memoryCandidateSchema),
      z.array(memoryCandidateSchema).max(3),
    )
    .default([]),
  // 白名单在解析时不可知（按 NPC 注入），这里先放宽为字符串数组；
  // 服务器侧按 npc 的 fact/条件 id 二次过滤（ConversationService）
  revealed: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : v),
    z.array(z.string().max(20)).max(8),
  ).default([]),
  conditionHints: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : v),
    z.array(z.string().max(40)).max(5),
  ).default([]),
});

export type ValidatedLLMResponse = z.infer<typeof llmResponseSchema>;

/** 从 LLM 原始文本中尽力提取 JSON（容忍 markdown 代码块、前后废话） */
export function extractJsonBlock(text: string): string | null {
  const trimmed = text.trim();
  const direct = tryParse(trimmed);
  if (direct) return trimmed;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const inner = fenced[1].trim();
    if (tryParse(inner)) return inner;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    if (tryParse(slice)) return slice;
  }
  return null;
}

function tryParse(text: string): string | null {
  try {
    JSON.parse(text);
    return text;
  } catch {
    return null;
  }
}

export interface LLMValidationResult {
  ok: boolean;
  data?: ValidatedLLMResponse;
  error?: string;
}

export function validateLLMRawOutput(raw: string): LLMValidationResult {
  const json = extractJsonBlock(raw);
  if (!json) {
    return { ok: false, error: "LLM 输出中找不到合法 JSON" };
  }
  try {
    const parsed: unknown = JSON.parse(json);
    const result = llmResponseSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      return {
        ok: false,
        error: `Schema 校验失败: ${issue?.path.join(".") ?? "?"} — ${issue?.message ?? "unknown"}`,
      };
    }
    return { ok: true, data: result.data };
  } catch (e) {
    return { ok: false, error: `JSON 解析失败: ${String(e)}` };
  }
}
