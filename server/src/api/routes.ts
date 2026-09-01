import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ConversationService } from "../conversation/conversationService";
import type { NPCService } from "../npc/npcService";
import type { AppConfig } from "../config";
import type { ProductCatalog } from "../game/productData";
import type { PlayerService } from "../game/playerService";
import { getGameState } from "../game/gameState";
import type { DayService } from "../game/dayService";
import type { Persistence } from "../game/persistence";
import { readLogEntries } from "../debug/logger";

const conversationBodySchema = z.object({
  npcId: z.string().min(1),
  message: z.string().min(1).max(500),
});

export function registerRoutes(
  app: FastifyInstance,
  npcService: NPCService,
  conversationService: ConversationService,
  config: AppConfig,
  catalog: ProductCatalog,
  playerService: PlayerService,
  dayService: DayService,
  persistence: Persistence,
): void {
  // GET /api/meta — GLM 在线状态（客户端 Debug 条用）
  app.get("/api/meta", async () => {
    return { glmOnline: !!config.glmApiKey, model: config.glmModel };
  });

  // GET /api/game — 全量游戏状态快照（NPC 脱敏 + 商品目录 + 今日任务 + 玩家账户）
  app.get("/api/game", async () => {
    return getGameState(npcService, catalog, playerService, dayService);
  });

  // POST /api/day/end — 收工：出日报 → 天数推进 → 任务重摇 → NPC 过夜 → 会话清空
  app.post("/api/day/end", async () => {
    const report = dayService.endDay();
    conversationService.resetForNewDay();
    return report;
  });

  // POST /api/game/reset — 新游戏：全部状态回出厂并覆盖存档（开始页「新的开始」用）
  app.post("/api/game/reset", async () => {
    npcService.resetAll();
    catalog.rollNewDay();
    playerService.reset(catalog);
    dayService.reset();
    conversationService.resetForNewDay();
    persistence.markDirty();
    persistence.flush(true);
    console.log("🔄 新游戏：存档已重置");
    return getGameState(npcService, catalog, playerService, dayService);
  });

  // GET /api/npc/:id — 单个 NPC 脱敏视图（不含 Server-only 字段）
  app.get("/api/npc/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const npc = npcService.getPublicView(id);
    if (!npc) {
      return reply.code(404).send({ error: `NPC 不存在: ${id}` });
    }
    return npc;
  });

  // GET /api/debug/npc/:id — 完整 NPC 状态（Debug Mode 专用，含 Server-only 字段）
  app.get("/api/debug/npc/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const npc = npcService.getNPC(id);
    if (!npc) {
      return reply.code(404).send({ error: `NPC 不存在: ${id}` });
    }
    return npc;
  });

  // GET /api/npc/:id/advice — 实时攻略：成交闸门诊断 + 推荐主攻商品
  app.get("/api/npc/:id/advice", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (!npcService.getNPC(id)) {
      return reply.code(404).send({ error: `NPC 不存在: ${id}` });
    }
    return conversationService.getAdvice(id);
  });

  // GET /api/npc/:id/conversation — 会话历史（Debug 用）
  app.get("/api/npc/:id/conversation", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (!npcService.getNPC(id)) {
      return reply.code(404).send({ error: `NPC 不存在: ${id}` });
    }
    return { npcId: id, history: conversationService.getHistory(id) };
  });

  // POST /api/conversation — 玩家说话 → NPC 回复
  app.post("/api/conversation", async (req, reply) => {
    const parsed = conversationBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "请求格式错误",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const { npcId, message } = parsed.data;
    if (!npcService.getNPC(npcId)) {
      return reply.code(404).send({ error: `NPC 不存在: ${npcId}` });
    }

    try {
      return await conversationService.handlePlayerMessage(npcId, message);
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({
        error: "服务器内部错误",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // GET /api/debug/logs — 复盘日志（结构化回合 + 递合同事件）
  app.get("/api/debug/logs", async () => {
    return { entries: readLogEntries().filter((e) => e.type === "turn" || e.type === "sale") };
  });

  // POST /api/sale/:npcId — 递合同：玩家对 NPC 推某件商品，服务器裁决
  app.post("/api/sale/:npcId", async (req, reply) => {
    const { npcId } = z.object({ npcId: z.string() }).parse(req.params);
    const parsed = z.object({ productId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "请求格式错误" });
    }
    if (!npcService.getNPC(npcId)) {
      return reply.code(404).send({ error: `NPC 不存在: ${npcId}` });
    }
    return conversationService.attemptSale(npcId, parsed.data.productId);
  });

  // POST /api/conversation/:npcId/reset — 重置会话与 NPC 状态（开发用）
  app.post("/api/conversation/:npcId/reset", async (req, reply) => {
    const { npcId } = z.object({ npcId: z.string() }).parse(req.params);
    if (!npcService.getNPC(npcId)) {
      return reply.code(404).send({ error: `NPC 不存在: ${npcId}` });
    }
    conversationService.reset(npcId);
    return { ok: true };
  });
}
