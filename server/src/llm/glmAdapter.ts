import type { Emotion, LLMDebugInfo, LLMResponse, NPCState } from "@sellup/shared";
import { EMOTIONS, NPC_INTENTS, extractJsonBlock, validateLLMRawOutput } from "@sellup/shared";
import type { AppConfig } from "../config";
import type { LLMCallResult, LLMProvider, NPCContext, SaleLineContext } from "./provider";
import { buildMessages } from "./promptBuilder";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

const SAFE_DIALOGUES = [
  "嗯……我不知道该说啥。",
  "啊？你再说一遍？",
  "我还有事，先这样吧。",
];

/** 递合同反应的兜底台词（GLM 挂掉/超时/输出非法时用；按裁决原因给一句还算贴的话） */
const SALE_FALLBACK_LINES: Record<string, { dialogue: string; emotion: Emotion }> = {
  pass: { dialogue: "（接过来看了看）行吧，就按你说的，我要了。", emotion: "neutral" },
  trust_low: { dialogue: "（犹豫）东西我瞅了一眼……可咱才聊几句啊，就让我掏钱，我心里不踏实。", emotion: "skeptical" },
  suspicion_high: { dialogue: "（往后退了半步）你先别急着往我手里塞，我这心里正犯嘀咕呢。", emotion: "suspicious" },
  interest_low: { dialogue: "（没伸手）这玩意儿……我用不上吧。", emotion: "confused" },
  cannot_afford: { dialogue: "（苦笑）好东西是好东西，可我这个月真拿不出这个钱。", emotion: "embarrassed" },
  already_owned: { dialogue: "这我可买过了，家里正用着呢。", emotion: "neutral" },
  condition_not_met: { dialogue: "（摆手）先别急，咱还没聊到那份上。", emotion: "neutral" },
  condition_failed: { dialogue: "（把门掩上一半）你这话我不爱听，今天先到这儿吧。", emotion: "annoyed" },
  npc_refusing: { dialogue: "（门只留一条缝）说了今天不谈这个。", emotion: "annoyed" },
  unknown: { dialogue: "（摆摆手）先这样吧。", emotion: "neutral" },
};

const SALE_REASON_HINTS: Record<string, string> = {
  trust_low: "TA 还不够信任你（东西有点心动，但觉得你们还不熟）",
  suspicion_high: "TA 的疑心太重（对你这个人还犯嘀咕）",
  interest_low: "TA 对这件东西还没动心（用不上/没需求）",
  cannot_afford: "TA 买不起（钱不够）",
  already_owned: "TA 已经买过一件了",
  condition_not_met: "TA 心里还有个坎没过去（你还没说到 TA 心坎里）",
  condition_failed: "你之前踩了 TA 的雷（TA 还在气头上/记着仇）",
  npc_refusing: "TA 刚明确送过客，还不想谈",
};

/**
 * GLM Adapter（ARCHITECTURE.md §10 / §19）。
 * 降级链：完整 Prompt → 简化 Prompt → Safe Response，LLM 挂掉不影响游戏继续。
 */
export class GLMAdapter implements LLMProvider {
  constructor(private readonly config: AppConfig) {}

  async generateNPCResponse(context: NPCContext): Promise<LLMCallResult> {
    const startedAt = Date.now();

    if (!this.config.glmApiKey) {
      return this.safeFallback(context, startedAt, {
        fallback: true,
        attempts: 0,
        error: "GLM_API_KEY 未配置（在 server/.env 中填写后重启）",
        model: this.config.glmModel,
      });
    }

    // 第 1 次：完整 Prompt；第 2 次：简化 Prompt（ARCHITECTURE.md §19）
    for (let attempt = 1; attempt <= 2; attempt++) {
      const simplified = attempt === 2;
      try {
        const raw = await this.callChatCompletions(context, simplified);
        const validated = validateLLMRawOutput(raw);
        if (validated.ok && validated.data) {
          return {
            response: validated.data as LLMResponse,
            debug: {
              fallback: false,
              model: this.config.glmModel,
              attempts: attempt,
              latencyMs: Date.now() - startedAt,
              raw,
              error: null,
            },
          };
        }
        console.warn(`[glm] 第 ${attempt} 次输出无效: ${validated.error}`);
        if (attempt === 1) continue;
        // 校验失败但模型确实说了话 → 抢救为纯文本对话（零效果，状态不动）
        return this.salvagePlainText(raw, startedAt, attempt, validated.error);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(`[glm] 第 ${attempt} 次调用失败: ${message}`);
        if (attempt === 1) continue;
        return this.safeFallback(context, startedAt, {
          fallback: true,
          attempts: attempt,
          error: message,
          model: this.config.glmModel,
        });
      }
    }

    return this.safeFallback(context, startedAt, {
      fallback: true,
      attempts: 2,
      error: "unreachable",
      model: this.config.glmModel,
    });
  }

  /**
   * 递合同反应台词：成败已由服务器裁决（Server Authority），LLM 只负责
   * 把裁决演成贴合当前对话的一句话。GLM 不可用/输出非法 → 按原因给兜底罐头。
   */
  async generateSaleLine(context: SaleLineContext): Promise<{ dialogue: string; emotion: Emotion }> {
    const fallback =
      SALE_FALLBACK_LINES[context.verdict.passed ? "pass" : (context.verdict.reason ?? "unknown")] ??
      SALE_FALLBACK_LINES.unknown!;
    if (!this.config.glmApiKey) return fallback;

    try {
      const recent = context.history
        .slice(-8)
        .map((m) => (m.role === "player" ? "他：" : "你：") + m.text)
        .join("\n");
      const verdictText = context.verdict.passed
        ? "【成交】你真的被说动了，决定买下它（台词要爽快答应）"
        : `【不买】你不买。真实原因（台词必须吻合，不能说出系统字眼）：${SALE_REASON_HINTS[context.verdict.reason ?? "unknown"] ?? "你就是不想买"}`;
      const prompt = [
        `你在扮演「${context.npc.name}」（${context.npc.identity}），正和一个上门推销的人聊到一半。`,
        `人设：${context.npc.persona}`,
        `当前心理：信任${context.npc.vitals.trust} 兴趣${context.npc.vitals.interest} 怀疑${context.npc.vitals.suspicion} 心情${context.npc.vitals.mood}。`,
        "",
        "刚才的对话：",
        recent,
        "",
        `他刚刚递过来一件商品：【${context.product.name}】，报价 ${context.product.price} 元。`,
        `系统裁决：${verdictText}`,
        "给一句你的反应台词：符合人设、贴合刚才聊的内容，口语 1-2 句。",
        '只输出 JSON：{"dialogue":"...","emotion":"emotion 枚举之一"}',
      ].join("\n");
      const raw = await this.rawChat([{ role: "user", content: prompt }]);
      const json = extractJsonBlock(raw);
      if (json) {
        const parsed = JSON.parse(json) as { dialogue?: unknown; emotion?: unknown };
        if (typeof parsed.dialogue === "string" && parsed.dialogue.trim()) {
          const rawEmotion = typeof parsed.emotion === "string" ? parsed.emotion.trim().toLowerCase() : "";
          const emotion = EMOTIONS.includes(rawEmotion as Emotion) ? (rawEmotion as Emotion) : fallback.emotion;
          return { dialogue: parsed.dialogue.trim().slice(0, 200), emotion };
        }
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * 抢救路径：模型输出了符合角色的内容但整体不是合法结构。
   * 优先从 JSON 里提取台词字段；失败则把纯文本当台词。
   * 两条路都不产生任何状态效果（Server Authority 不受影响）。
   */
  private salvagePlainText(
    raw: string,
    startedAt: number,
    attempts: number,
    validationError?: string,
  ): LLMCallResult {
    const json = extractJsonBlock(raw);
    let dialogue = "";
    let emotion: LLMResponse["emotion"] | null = null;
    let intent: LLMResponse["intent"] | null = null;

    if (json) {
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        if (typeof parsed.dialogue === "string" && parsed.dialogue.trim()) {
          dialogue = parsed.dialogue.trim().slice(0, 500);
          if (typeof parsed.emotion === "string") {
            const emo = parsed.emotion.trim().toLowerCase();
            if (EMOTIONS.includes(emo as LLMResponse["emotion"])) {
              emotion = emo as LLMResponse["emotion"];
            }
          }
          if (typeof parsed.intent === "string") {
            const it = parsed.intent.trim().toLowerCase();
            if (NPC_INTENTS.includes(it as LLMResponse["intent"])) {
              intent = it as LLMResponse["intent"];
            }
          }
        }
      } catch {
        // 不是对象 → 走纯文本
      }
    }
    if (!dialogue) {
      dialogue = raw.trim().replace(/\s+/g, " ").slice(0, 500);
    }
    console.warn(`[glm] JSON 校验失败，降级为纯文本对话（无状态效果）`);
    return {
      response: {
        dialogue,
        emotion: emotion ?? "neutral",
        intent: intent ?? "answer",
        playerIntent: "unknown",
        topics: [],
        effects: [],
        awarenessChanges: [],
        memoryCandidates: [],
        revealed: [],
        conditionHints: [],
      },
      debug: {
        fallback: false,
        model: this.config.glmModel,
        attempts,
        latencyMs: Date.now() - startedAt,
        raw,
        error: `salvaged: ${validationError ?? "非 JSON 输出"}`,
      },
    };
  }

  private safeFallback(
    context: NPCContext,
    startedAt: number,
    debug: Omit<LLMDebugInfo, "latencyMs" | "raw"> & { raw?: string | null },
  ): LLMCallResult {
    const npc: NPCState = context.npc;
    const dialogue =
      npc.vitals.patience < 30
        ? "行了行了，我还有事。"
        : SAFE_DIALOGUES[Math.floor(Math.random() * SAFE_DIALOGUES.length)]!;

    const response: LLMResponse = {
      dialogue,
      emotion: npc.vitals.suspicion > 50 ? "suspicious" : "confused",
      intent: "answer",
      playerIntent: "unknown",
      topics: [],
      effects: [],
      awarenessChanges: [],
      memoryCandidates: [],
      revealed: [],
      conditionHints: [],
    };

    return {
      response,
      debug: { ...debug, raw: debug.raw ?? null, latencyMs: Date.now() - startedAt },
    };
  }

  /** 底层对话请求（递合同台词等轻量调用用）；JSON 模式不被支持时自动去掉重试一次 */
  private async rawChat(messages: Array<{ role: string; content: string }>): Promise<string> {
    const url = `${this.config.glmBaseUrl}/chat/completions`;
    const base = {
      model: this.config.glmModel,
      messages,
      temperature: 0.7,
      max_tokens: 2000,
      thinking: { type: "disabled" },
    };
    for (const withJsonMode of [true, false]) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.glmApiKey}`,
          },
          body: JSON.stringify(
            withJsonMode ? { ...base, response_format: { type: "json_object" } } : base,
          ),
          signal: controller.signal,
        });
        const body = (await res.json()) as ChatCompletionResponse;
        if (!res.ok) {
          throw new Error(`GLM API ${res.status}: ${body.error?.message ?? res.statusText}`);
        }
        const content = body.choices?.[0]?.message?.content;
        if (!content) throw new Error("GLM 返回了空内容");
        return content;
      } catch (e) {
        if (withJsonMode && e instanceof Error && /response_format|json/i.test(e.message)) {
          continue; // 降级：不带 json 模式重试一次
        }
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error("unreachable");
  }

  private async callChatCompletions(
    context: NPCContext,
    simplified: boolean,
  ): Promise<string> {
    const url = `${this.config.glmBaseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.glmApiKey}`,
        },
        body: JSON.stringify({
          model: this.config.glmModel,
          messages: buildMessages(context, simplified),
          temperature: 0.7,
          // GLM-5.x 是推理模型：先思考再回答。max_tokens 必须 covering 思考开销，
          // thinking 关闭后 NPC 对话不需要推理（实测 2s vs 9s），也避免 JSON 被截断。
          max_tokens: 2000,
          thinking: { type: "disabled" },
          // 智谱 JSON 模式；个别模型不支持时服务端会报错 → 走简化重试链
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      const body = (await res.json()) as ChatCompletionResponse;
      if (!res.ok) {
        throw new Error(
          `GLM API ${res.status}: ${body.error?.message ?? res.statusText}`,
        );
      }
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("GLM 返回了空内容");
      return content;
    } catch (e) {
      // response_format 不被支持时整体重试一次（不带 json 模式）
      if (e instanceof Error && /response_format|json/i.test(e.message)) {
        const retry = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.glmApiKey}`,
          },
          body: JSON.stringify({
            model: this.config.glmModel,
            messages: buildMessages(context, simplified),
            temperature: 0.7,
            max_tokens: 2000,
            thinking: { type: "disabled" },
          }),
        });
        const body = (await retry.json()) as ChatCompletionResponse;
        if (!retry.ok) {
          throw new Error(
            `GLM API ${retry.status}: ${body.error?.message ?? retry.statusText}`,
          );
        }
        const content = body.choices?.[0]?.message?.content;
        if (!content) throw new Error("GLM 返回了空内容");
        return content;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
