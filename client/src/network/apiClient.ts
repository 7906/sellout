import type {
  ConversationMessage,
  ConversationResult,
  DailyReport,
  GameStatePublic,
  NPCPublicView,
  SaleAdvice,
} from "@sellup/shared";

// 子路径部署时请求统一带前缀（BASE_URL 由 vite base 注入；开发/直连部署为 "/"）
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // 只在有请求体时声明 JSON 头：POST 无 body 带 JSON 头会被 Fastify 判空 body 400
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + url, { ...init, headers });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export function fetchGameState(): Promise<GameStatePublic> {
  return request<GameStatePublic>("/api/game");
}

export interface ServerMeta {
  glmOnline: boolean;
  model: string;
}

export function fetchMeta(): Promise<ServerMeta> {
  return request<ServerMeta>("/api/meta");
}

/** 首次引导：保存用户的 GLM API Key（写 server/.env，热生效） */
export function saveApiKey(key: string): Promise<{ ok: boolean; glmOnline: boolean; model: string }> {
  return request("/api/config/apikey", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export function fetchNPC(id: string): Promise<NPCPublicView> {
  return request<NPCPublicView>(`/api/npc/${id}`);
}

/** 实时攻略：当前 NPC 的成交闸门诊断 + 推荐主攻商品 */
export function fetchAdvice(id: string): Promise<SaleAdvice> {
  return request<SaleAdvice>(`/api/npc/${id}/advice`);
}

export function fetchConversationHistory(
  id: string,
): Promise<{ npcId: string; history: ConversationMessage[] }> {
  return request(`/api/npc/${id}/conversation`);
}

export function sendPlayerMessage(
  npcId: string,
  message: string,
): Promise<ConversationResult> {
  return request<ConversationResult>("/api/conversation", {
    method: "POST",
    body: JSON.stringify({ npcId, message }),
  });
}

export interface SaleAttemptResponse {
  settlement?: ConversationResult["purchase"];
  rejected?: { reason: string };
  /** NPC 对这次递合同的反应台词（服务器按上下文裁决后由 LLM 演绎） */
  npcLine?: { text: string; emotion: ConversationResult["reply"]["emotion"] };
  vitals: ConversationResult["vitals"];
  effectsApplied: string[];
}

export function attemptSale(
  npcId: string,
  productId: string,
): Promise<SaleAttemptResponse> {
  return request<SaleAttemptResponse>(`/api/sale/${npcId}`, {
    method: "POST",
    body: JSON.stringify({ productId }),
  });
}

export function resetConversation(npcId: string): Promise<void> {
  return request<{ ok: boolean }>(`/api/conversation/${npcId}/reset`, {
    method: "POST",
  }).then(() => undefined);
}

/** 收工（PHASE 17 Day Loop）：服务器出日报并推进到新的一天 */
export function endDay(): Promise<DailyReport> {
  return request<DailyReport>("/api/day/end", { method: "POST" });
}

/** 新游戏：清空全部进度并覆盖存档，返回重置后的游戏状态 */
export function resetGame(): Promise<GameStatePublic> {
  return request<GameStatePublic>("/api/game/reset", { method: "POST" });
}
