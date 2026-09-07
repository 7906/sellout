import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import cors from "@fastify/cors";
import { z } from "zod";
import { loadConfig } from "./config";
import { registerRoutes } from "./api/routes";
import { gateHtml } from "./api/gate";
import { NPCService } from "./npc/npcService";
import { ConversationService } from "./conversation/conversationService";
import { GLMAdapter } from "./llm/glmAdapter";
import { ProductCatalog } from "./game/productData";
import { PlayerService } from "./game/playerService";
import { DayService } from "./game/dayService";
import { Persistence } from "./game/persistence";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  // ===== 子路径部署（PUBLIC_BASE_PATH，如 /sellout）：nginx 剥前缀回源，
  //      服务端发给浏览器的绝对路径 Location 统一补回前缀，避免跳到同域其他服务 =====
  const basePath = config.publicBasePath;
  if (basePath) {
    app.addHook("onSend", async (_req, reply, payload) => {
      const loc = reply.getHeader("location");
      if (typeof loc === "string" && loc.startsWith("/")) {
        reply.header("location", basePath + loc);
      }
      return payload;
    });
  }

  const npcService = new NPCService();
  const catalog = new ProductCatalog();
  const playerService = new PlayerService(catalog);

  // ===== 存档（JSON 落盘）：重启不清进度 =====
  const persistence = new Persistence(path.resolve(__dirname, "../data/save.json"));
  const dayService = new DayService(catalog, playerService, npcService, persistence);
  persistence.bind(() => ({
    version: 3,
    savedAt: new Date().toISOString(),
    money: playerService.getMoney(),
    inventory: playerService.getInventory(),
    taskCompleted: catalog.taskCompleted,
    day: dayService.currentDay,
    task: { productId: catalog.task.productId, bonus: catalog.task.bonus },
    todaySales: [...dayService.sales],
    npcs: Object.fromEntries(
      npcService.listNPCs().map((n) => [
        n.id,
        {
          vitals: n.vitals,
          purchased: n.purchased,
          budget: n.budget,
          conditionFlags: n.conditionFlags,
        },
      ]),
    ),
  }));
  const saved = persistence.read();
  if (saved) {
    playerService.restore(saved.money, saved.inventory);
    // 目录更新迁移：老存档缺的新常规货自动补进背包（本次加回了钛金不粘锅）
    playerService.ensureNormals(catalog);
    if (saved.taskCompleted) catalog.completeTask();
    // 恢复今天的任务；旧档没有任务信息或任务商品已下架时，把背包归位到新任务
    if (!saved.task || !catalog.restoreTask(saved.task.productId, saved.task.bonus, saved.day)) {
      playerService.resetDaily(catalog);
    }
    dayService.restore(saved.day ?? 1, saved.todaySales ?? []);
    npcService.importState(saved.npcs);
    console.log(`💾 存档已恢复: 第${dayService.currentDay}天 资产 ¥${saved.money}（存于 ${saved.savedAt}）`);
  }
  persistence.flush(true);
  setInterval(() => persistence.flush(), 10_000);

  const llm = new GLMAdapter(config);
  const conversationService = new ConversationService(
    npcService,
    llm,
    catalog,
    playerService,
    persistence,
    dayService,
  );

  // ===== 访客口令门：非本机访问需过口令（本机 127.0.0.1/::1 永远放行）=====
  app.addHook("onRequest", (req, reply, done) => {
    const ra = String(req.socket.remoteAddress ?? "");
    const isLocal = ra === "127.0.0.1" || ra === "::1" || ra === "::ffff:127.0.0.1";
    if (isLocal) return done();

    const url = new URL(req.url ?? "/", "http://gate.local");

    if (url.pathname === "/__gate" && url.searchParams.get("pass") === config.gatePass) {
      reply.header("Set-Cookie", `sellout_gate=${config.gatePass}; Path=${basePath || "/"}; Max-Age=604800; HttpOnly`);
      reply.code(302).header("Location", url.searchParams.get("to") || "/");
      return done();
    }

    const cookieOk = String(req.headers.cookie ?? "")
      .split(/;\s*/)
      .some((c) => c === `sellout_gate=${config.gatePass}`);
    if (cookieOk) return done();

    if (url.pathname === "/__gate") {
      const wrong = url.searchParams.has("pass") ? "口令不对，再试试？" : "";
      reply.code(200).type("text/html; charset=utf-8").send(gateHtml(wrong, basePath));
      return;
    }
    reply.code(302).header("Location", "/__gate?to=" + encodeURIComponent(url.pathname));
    return done();
  });

  registerRoutes(app, npcService, conversationService, config, catalog, playerService, dayService, persistence);

  // ===== 首次引导：填写 GLM API Key（写 server/.env + 热生效，无需重启）=====
  app.post("/api/config/apikey", async (req, reply) => {
    const parsed = z.object({ key: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "请求格式错误" });
    }
    const key = parsed.data.key.trim();
    // 消毒：只允许可见 ASCII、限长——既防手滑也防往 .env 里写别的东西
    if (!/^[\x21-\x7E]{20,120}$/.test(key)) {
      return reply.code(400).send({
        error: "Key 格式不对：应为 20-120 位连续字符（英文/数字/符号，不含空格和中文）",
      });
    }
    const envPath = path.resolve(__dirname, "../.env");
    let content = "";
    try {
      content = fs.readFileSync(envPath, "utf8");
    } catch {
      /* 文件不存在则新建 */
    }
    if (/^GLM_API_KEY=.*$/m.test(content)) {
      content = content.replace(/^GLM_API_KEY=.*$/m, `GLM_API_KEY=${key}`);
    } else {
      content = `GLM_API_KEY=${key}\n${content}`;
    }
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, content, "utf8");
    process.env.GLM_API_KEY = key;
    config.glmApiKey = key; // GLMAdapter 每次调用时读 config，热生效无需重启
    console.log("🔑 GLM API Key 已保存（热生效）");
    return { ok: true, glmOnline: true, model: config.glmModel };
  });

  // ===== 生产单进程：同端口托管游戏页面（client/dist）+ API =====
  const distDir = path.resolve(__dirname, "../../client/dist");
  if (fs.existsSync(path.join(distDir, "index.html"))) {
    await app.register(fastifyStatic, { root: distDir });
    app.setNotFoundHandler((req, reply) => {
      if ((req.url ?? "").startsWith("/api")) {
        return reply.code(404).send({ error: "Not Found" });
      }
      return reply.sendFile("index.html");
    });
    console.log("🌐 静态资源: " + distDir);
  } else {
    console.log("（未找到 client/dist —— npm run build -w client 后重启即同端口供网页）");
  }

  if (!config.glmApiKey) {
    console.warn(
      "⚠️  GLM_API_KEY 未配置：NPC 将返回离线降级回复。\n" +
        "   在 server/.env 中填写 Key 后重启即可启用真实 AI。",
    );
  } else {
    console.log(`✅ GLM 已配置: model=${config.glmModel} base=${config.glmBaseUrl}`);
  }

  console.log(`📦 今日特殊任务: ${catalog.task.title}（奖金 ¥${catalog.task.bonus}）`);

  // 退出时冲刷存档
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      persistence.flush(true);
      app.close().finally(() => process.exit(0));
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`🎮 SELL OUT server 运行中: http://${config.host === "0.0.0.0" ? "<本机IP>" : config.host}:${config.port}`);
    console.log("   接口: GET /api/game · GET /api/npc/:id · POST /api/conversation · POST /api/sale/:npcId");
  } catch (e) {
    app.log.error(e);
    process.exit(1);
  }
}

main();
