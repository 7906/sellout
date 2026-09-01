/**
 * 销售规则 + 日循环 冒烟测试：
 * 不起 HTTP、不调真 LLM，用可编程 FakeLLM 驱动完整管线。
 * 覆盖 SALES_DESIGN A10 验收断言 1-12 + PHASE 17 日循环回归。
 * 运行：npm run check:dayloop -w server
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  EffectId,
  LLMDebugInfo,
  LLMResponse,
  NPCState,
} from "@sellup/shared";
import type { LLMCallResult, LLMProvider, NPCContext, SaleLineContext } from "../src/llm/provider";
import { buildMessages } from "../src/llm/promptBuilder";
import { NPCService } from "../src/npc/npcService";
import { ProductCatalog } from "../src/game/productData";
import { PlayerService } from "../src/game/playerService";
import { DayService, kpiQuotaFor, gradeKpi } from "../src/game/dayService";
import { getGameState } from "../src/game/gameState";
import { Persistence } from "../src/game/persistence";
import { ConversationService } from "../src/conversation/conversationService";
import { trustGateFor, interestGateFor } from "../src/sales/salesService";

let failed = 0;
function check(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

const debug: LLMDebugInfo = {
  fallback: true,
  model: "fake",
  attempts: 1,
  latencyMs: 0,
  raw: null,
  error: null,
};

interface ScriptedReply {
  dialogue?: string;
  emotion?: LLMResponse["emotion"];
  intent?: LLMResponse["intent"];
  effects?: EffectId[];
  revealed?: string[];
  conditionHints?: string[];
}

/** 可编程假 LLM：按脚本逐回合出牌（最后一条重复使用），并抓取最近一次收到的上下文 */
class FakeLLM implements LLMProvider {
  lastContext: NPCContext | null = null;
  lastSaleVerdict: SaleLineContext | null = null;
  constructor(
    private script: ScriptedReply[],
    private fallbackReply: ScriptedReply = { emotion: "friendly", effects: ["trust_up_medium"] },
  ) {}
  async generateSaleLine(context: SaleLineContext): Promise<{ dialogue: string; emotion: LLMResponse["emotion"] }> {
    this.lastSaleVerdict = context;
    return context.verdict.passed
      ? { dialogue: "（假台词）行，就按你说的，我要了。", emotion: "friendly" }
      : { dialogue: `（假台词）先不算了（${context.verdict.reason ?? "unknown"}）。`, emotion: "skeptical" };
  }
  async generateNPCResponse(context: NPCContext): Promise<LLMCallResult> {
    this.lastContext = context;
    const step =
      this.script.length > 1 ? this.script.shift()! : (this.script[0] ?? this.fallbackReply);
    const response: LLMResponse = {
      dialogue: step.dialogue ?? "（假回复）",
      emotion: step.emotion ?? "neutral",
      intent: step.intent ?? "answer",
      playerIntent: "small_talk",
      topics: [],
      effects: step.effects ?? [],
      awarenessChanges: [],
      memoryCandidates: [],
      revealed: step.revealed ?? [],
      conditionHints: step.conditionHints ?? [],
    };
    return { response, debug };
  }
}

interface World {
  npcService: NPCService;
  catalog: ProductCatalog;
  player: PlayerService;
  dayService: DayService;
  conversation: ConversationService;
}

function makeWorld(llm: LLMProvider, dir: string): World {
  const npcService = new NPCService();
  const catalog = new ProductCatalog();
  const player = new PlayerService(catalog);
  const persistence = new Persistence(path.join(dir, "save.json"));
  const dayService = new DayService(catalog, player, npcService, persistence);
  const conversation = new ConversationService(
    npcService,
    llm,
    catalog,
    player,
    persistence,
    dayService,
  );
  return { npcService, catalog, player, dayService, conversation };
}

function fetchStateFor(world: World) {
  return getGameState(world.npcService, world.catalog, world.player, world.dayService);
}

async function main(): Promise<void> {
  // 测试日志隔离：chdir 到临时目录，避免测试回合污染真实对局日志（logs/conversations.jsonl）
  process.chdir(fs.mkdtempSync(path.join(os.tmpdir(), "sellup-test-cwd-")));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sellup-test-"));

  console.log("== A1 正向条件未达成 → condition_not_met ==");
  {
    const world = makeWorld(new FakeLLM([]), tmpDir);
    const npc = world.npcService.getNPC("grandma_chen")!;
    await world.conversation.handlePlayerMessage("grandma_chen", "奶奶您好，晒太阳呢？");
    await world.conversation.handlePlayerMessage("grandma_chen", "天好，出来转转。");
    const sale = await world.conversation.attemptSale("grandma_chen", "slippers");
    check("信任/怀疑都过线仍被条件拦下", sale.rejected?.reason === "condition_not_met", `reason=${sale.rejected?.reason}`);
    check("兴趣门槛：¥89 棉拖不要求兴趣", interestGateFor(world.catalog.all["slippers"]!) === 0);
  }

  console.log("== A2 幻觉 id 静默丢弃 ==");
  {
    const llm = new FakeLLM([{ conditionHints: ["make_fortune"], revealed: ["w99"] }]);
    const world = makeWorld(llm, tmpDir);
    await world.conversation.handlePlayerMessage("grandma_chen", "奶奶您好呀。");
    check("白名单外的 conditionHint 未记账", Object.keys(world.npcService.getNPC("grandma_chen")!.conditionFlags).length === 0);
    check("白名单外的 revealed 未入账本", (llm.lastContext?.disclosedFacts.length ?? 1) === 0);
  }

  console.log("== A3 make_laugh 双重确认（需要 amused/excited 情绪佐证）==");
  {
    const llm = new FakeLLM([
      { emotion: "neutral", conditionHints: ["make_laugh"] },
      { emotion: "amused", conditionHints: ["make_laugh"] },
    ]);
    const world = makeWorld(llm, tmpDir);
    const npc = world.npcService.getNPC("grandma_chen")!;
    await world.conversation.handlePlayerMessage("grandma_chen", "奶奶讲讲过去的事呗。");
    check("情绪不配合 → 不记账", npc.conditionFlags["laughed"] === undefined);
    await world.conversation.handlePlayerMessage("grandma_chen", "哈哈豆豆也太逗了。");
    check("amused 佐证 → 记账", npc.conditionFlags["laughed"]?.count === 1);
  }

  console.log("== A3b 抢报价只认正则权威判定（hint 不可信，实测模型会误标）==");
  {
    // 模型对着一句没有任何价格的话误标 no_price_first，且伴随怀疑上升——都不该记账
    const llm = new FakeLLM([
      { intent: "ask_back", emotion: "skeptical", effects: ["suspicion_up_small"], conditionHints: ["no_price_first"] },
    ]);
    const world = makeWorld(llm, tmpDir);
    const npc = world.npcService.getNPC("frugal_uncle")!;
    await world.conversation.handlePlayerMessage("frugal_uncle", "叔");
    check("hint 误标不记账", npc.conditionFlags["price_first_by_player"] === undefined);
    await world.conversation.handlePlayerMessage("frugal_uncle", "这拖把只要299块！");
    check("正则命中真报价 → 记账", npc.conditionFlags["price_first_by_player"]?.count === 1);
  }

  console.log("== A4 noInstall 关键词激怒（李老师）==");
  {
    const world = makeWorld(new FakeLLM([{ emotion: "friendly", effects: [] }]), tmpDir);
    const npc = world.npcService.getNPC("teacher_li")!;
    await world.conversation.handlePlayerMessage("teacher_li", "老师您好，来看看您。");
    await world.conversation.handlePlayerMessage("teacher_li", "您膝盖还疼吗？");
    const before = { ...npc.vitals };
    const rage = await world.conversation.handlePlayerMessage("teacher_li", "咱这个可以分期付款，0首付！");
    check("信任大挫", rage.vitals.trust <= before.trust - 8, `trust ${before.trust}→${rage.vitals.trust}`);
    check("怀疑上升", rage.vitals.suspicion > before.suspicion);
    check("耐心下降", rage.vitals.patience < before.patience);
    check("心情愤怒", rage.vitals.mood === "angry");
    check("激怒回合 agree 也不成交", rage.purchase === undefined);
    const sale = await world.conversation.attemptSale("teacher_li", "knee_pad");
    check("递合同被拒（信任崩塌）", !!sale.rejected, `reason=${sale.rejected?.reason}`);
  }

  console.log("== A5 oversell 反向条件：当日判死，隔夜清除 ==");
  {
    const world = makeWorld(
      new FakeLLM([
        { intent: "show_suspicion", effects: ["suspicion_up_small"], conditionHints: ["no_oversell"] },
      ]),
      tmpDir,
    );
    const npc = world.npcService.getNPC("teacher_li")!;
    const suspicionBefore = npc.vitals.suspicion;
    await world.conversation.handlePlayerMessage("teacher_li", "这护膝能治风湿！");
    await world.conversation.handlePlayerMessage("teacher_li", "真的，包治！");
    await world.conversation.handlePlayerMessage("teacher_li", "您听我说完嘛。");
    check("双重确认（intent+suspicion 上升）→ 记雷", npc.conditionFlags["oversell_detected"]?.count === 1);
    const sale = await world.conversation.attemptSale("teacher_li", "knee_pad");
    check("当日递合同 → condition_failed", sale.rejected?.reason === "condition_failed", `reason=${sale.rejected?.reason}`);
    check("怀疑代价不回退", npc.vitals.suspicion > suspicionBefore);
    world.dayService.endDay();
    world.conversation.resetForNewDay();
    check("隔夜反向条件清除", npc.conditionFlags["oversell_detected"] === undefined);
    check("隔夜怀疑保留", npc.vitals.suspicion > suspicionBefore);
  }

  console.log("== A6 objections_handled 计数（接住异议，纯服务器判定）==");
  {
    const llm = new FakeLLM([
      { intent: "refuse", emotion: "annoyed", effects: [] }, // 拒绝 1（信任不降）
      { intent: "answer", emotion: "friendly", effects: ["trust_up_small"], conditionHints: ["sincere_apology"] }, // 接住 1 + 道歉
      { intent: "refuse", emotion: "annoyed", effects: [] }, // 拒绝 2
      { intent: "answer", emotion: "friendly", effects: ["trust_up_small"] }, // 接住 2
      { emotion: "friendly", effects: ["trust_up_small"] },
    ]);
    const world = makeWorld(llm, tmpDir);
    const npc = world.npcService.getNPC("da_liu")!;
    await world.conversation.handlePlayerMessage("da_liu", "刘哥，消消气。");
    await world.conversation.handlePlayerMessage("da_liu", "上一行的同行坑了您，我替他们道歉，是真的对不住。");
    check("道歉记账", npc.conditionFlags["apology_sincere"]?.count === 1);
    check("拒绝后接住 → 计数 1", npc.conditionFlags["objections_handled"]?.count === 1);
    await world.conversation.handlePlayerMessage("da_liu", "这参数您不满意直说。");
    await world.conversation.handlePlayerMessage("da_liu", "您说的在理，我记下了。");
    check("两次接住 → 计数 2", npc.conditionFlags["objections_handled"]?.count === 2);
    // 信任刷到门槛（大刘 gate=45）
    for (let i = 0; i < 3; i++) {
      await world.conversation.handlePlayerMessage("da_liu", "跟您唠会儿。");
    }
    const sale = await world.conversation.attemptSale("da_liu", "pillow");
    check("条件齐 + 信任过线 → 成交", !!sale.settlement, `reason=${sale.rejected?.reason}`);
  }

  console.log("== A7 interest 门槛（¥299 拖把需要兴趣 ≥25）==");
  {
    const llm = new FakeLLM([
      { emotion: "amused", effects: ["trust_up_medium"], conditionHints: ["make_laugh"] },
      { emotion: "neutral", effects: [] },
      { emotion: "friendly", effects: ["interest_up_medium"] },
    ]);
    const world = makeWorld(llm, tmpDir);
    const npc = world.npcService.getNPC("frugal_uncle")!;
    await world.conversation.handlePlayerMessage("frugal_uncle", "大叔您这棋下得妙啊。");
    check("兴趣门槛值：¥299→25", interestGateFor(world.catalog.all["mop3000"]!) === 25);
    await world.conversation.handlePlayerMessage("frugal_uncle", "跟您唠会儿。");
    const early = await world.conversation.attemptSale("frugal_uncle", "mop3000");
    check("兴趣不足 → interest_low", early.rejected?.reason === "interest_low", `reason=${early.rejected?.reason}`);
    await world.conversation.handlePlayerMessage("frugal_uncle", "您看这拖把，涮一涮就干。");
    const ok = await world.conversation.attemptSale("frugal_uncle", "mop3000");
    check("兴趣上来 + 逗笑 + 信任够 → 成交", !!ok.settlement, `reason=${ok.rejected?.reason}`);
    check("高档货兴趣门槛：¥1299→40", interestGateFor(world.catalog.all["senior_phone"]!) === 40);
  }

  console.log("== A8 条件账本：存档往返 + 跨天（正向留/反向清）==");
  {
    const dir = path.join(tmpDir, "a8");
    fs.mkdirSync(dir, { recursive: true });
    const llm = new FakeLLM([{ emotion: "amused", effects: [], conditionHints: ["make_laugh"] }]);
    const world = makeWorld(llm, dir);
    const npc = world.npcService.getNPC("grandma_chen")!;
    await world.conversation.handlePlayerMessage("grandma_chen", "奶奶好。");
    const persistence = new Persistence(path.join(dir, "save.json"));
    persistence.bind(() => ({
      version: 3 as const,
      savedAt: new Date().toISOString(),
      money: world.player.getMoney(),
      inventory: world.player.getInventory(),
      taskCompleted: world.catalog.taskCompleted,
      day: world.dayService.currentDay,
      task: { productId: world.catalog.task.productId, bonus: world.catalog.task.bonus },
      todaySales: [...world.dayService.sales],
      npcs: Object.fromEntries(
        world.npcService.listNPCs().map((n) => [
          n.id,
          { vitals: n.vitals, purchased: n.purchased, budget: n.budget, conditionFlags: n.conditionFlags },
        ]),
      ),
    }));
    persistence.flush(true);
    const saved = persistence.read();
    check("存档 v3 含条件账本", !!saved?.npcs["grandma_chen"]?.conditionFlags?.laughed);

    const world2 = makeWorld(new FakeLLM([]), dir);
    if (saved) {
      const s = saved.npcs["grandma_chen"];
      world2.npcService.importState({ grandma_chen: s });
    }
    check("重启后正向条件保留", world2.npcService.getNPC("grandma_chen")!.conditionFlags["laughed"]?.count === 1);
    // 李老师反向条件跨天清除
    const li = world2.npcService.getNPC("teacher_li")!;
    world2.npcService.setConditionFlag("teacher_li", "oversell_detected", 1);
    world2.dayService.endDay();
    check("跨天后反向条件清除", li.conditionFlags["oversell_detected"] === undefined);
    check("跨天后正向条件保留", npc.conditionFlags["laughed"]?.count === 1);
  }

  console.log("== A9/A10 账本：披露记账 + 注入 + tag 效果闸门（张姐）==");
  {
    const llm = new FakeLLM(
      [
        { emotion: "friendly", effects: [], revealed: ["k1"] }, // 亲口说女儿高三
        { emotion: "neutral", effects: ["suspicion_up_small"] }, // 玩家接「女儿」话头 → 应被闸掉
        { emotion: "neutral", effects: ["suspicion_up_small"] }, // 玩家踩「丈夫」雷 → 保留
      ],
      { emotion: "neutral", effects: [] },
    );
    const world = makeWorld(llm, tmpDir);
    const npc = world.npcService.getNPC("sister_zhang")!;

    await world.conversation.handlePlayerMessage("sister_zhang", "张姐您好，路过看看您。");
    await world.conversation.handlePlayerMessage("sister_zhang", "您女儿高考压力很大吧？");
    // t2 的上下文里应已包含 t1 的披露（账本注入下一回合）
    check("披露入账本并注入下一回合", (llm.lastContext?.disclosedFacts.map((f) => f.id) ?? []).includes("k1"));
    // t1 的 friendly 情绪微结算泄了 8 点怀疑（20→12）；t2 怀疑效果被闸 → 仍是 12
    check("接自己说过的话 → 怀疑效果被丢弃", npc.vitals.suspicion === 12, `suspicion=${npc.vitals.suspicion}`);

    const before = npc.vitals.suspicion;
    await world.conversation.handlePlayerMessage("sister_zhang", "听说您家那口子失业了？");
    check("踩未披露雷区 → 怀疑照常上升", npc.vitals.suspicion > before, `suspicion=${before}→${npc.vitals.suspicion}`);

    // 长对话：历史窗口（12 条）截断后账本仍在（状态不随历史丢）
    for (let i = 0; i < 8; i++) {
      await world.conversation.handlePlayerMessage("sister_zhang", "今天天气不错啊。");
    }
    const disclosed = llm.lastContext?.disclosedFacts.map((f) => f.id) ?? [];
    check("17 回合后账本仍在", disclosed.includes("k1"), `disclosed=${disclosed.join(",")}`);
    const systemPrompt = buildMessages(
      {
        npc,
        history: [],
        playerMessage: "x",
        mentionedProducts: [],
        disclosedFacts: llm.lastContext?.disclosedFacts ?? [],
      },
      false,
    )[0]?.content ?? "";
    check("prompt 含披露账本区块", systemPrompt.includes("你已经亲口告诉过他的事"));
    check("prompt 含已披露原文", systemPrompt.includes("女儿高三"));
  }

  console.log("== A12 账本：非法 id 不污染（非张姐 w1 之外的东西）==");
  {
    const llm = new FakeLLM([
      { revealed: ["k1"] },
      { revealed: ["wX"] }, // 非法
    ]);
    const world = makeWorld(llm, tmpDir);
    await world.conversation.handlePlayerMessage("sister_zhang", "您好。");
    await world.conversation.handlePlayerMessage("sister_zhang", "再来一句。");
    const disclosed = llm.lastContext?.disclosedFacts.map((f) => f.id) ?? [];
    check("只记合法 id", disclosed.includes("k1") && !disclosed.includes("wX"), `disclosed=${disclosed.join(",")}`);
  }

  console.log("== A5b oversell 收紧：怀疑没真涨就不算识破 ==");
  {
    // 李老师听谁推销都摆怀疑脸——intent=show_suspicion 但怀疑值没动，不等于玩家在吹牛
    const llm = new FakeLLM([
      { intent: "show_suspicion", emotion: "skeptical", effects: [], conditionHints: ["no_oversell"] },
    ]);
    const world = makeWorld(llm, tmpDir);
    const npc = world.npcService.getNPC("teacher_li")!;
    await world.conversation.handlePlayerMessage("teacher_li", "老师您好，这是护膝的检测报告，保暖率71%，您过目。");
    await world.conversation.handlePlayerMessage("teacher_li", "数据都在这，您慢慢核。");
    check("摆怀疑脸但怀疑没涨 → 不记雷", npc.conditionFlags["oversell_detected"] === undefined);
  }

  console.log("== A5c 拒绝软消气：3 回合后不再 npc_refusing ==");
  {
    const llm = new FakeLLM([
      { emotion: "friendly", effects: ["trust_up_small"] },
      { emotion: "friendly", effects: ["trust_up_small"] },
      { intent: "refuse", emotion: "annoyed", effects: [] },
      { emotion: "friendly", effects: ["trust_up_small"] },
      { emotion: "friendly", effects: ["trust_up_small"] },
      { emotion: "friendly", effects: ["trust_up_small"] },
    ]);
    const world = makeWorld(llm, tmpDir);
    await world.conversation.handlePlayerMessage("lao_zhou", "周哥您好，来看看您。");
    await world.conversation.handlePlayerMessage("lao_zhou", "您儿子成绩真好。");
    await world.conversation.handlePlayerMessage("lao_zhou", "我不想买您东西，就聊聊。");
    const rightAfter = await world.conversation.attemptSale("lao_zhou", "slippers");
    check("刚被明确拒绝 → npc_refusing", rightAfter.rejected?.reason === "npc_refusing", `reason=${rightAfter.rejected?.reason}`);
    for (let i = 0; i < 3; i++) {
      await world.conversation.handlePlayerMessage("lao_zhou", "再唠两句。");
    }
    const later = await world.conversation.attemptSale("lao_zhou", "slippers");
    // confirmTags 旁证让「儿子」话题直接达成 family_mentioned，消气后条件/信任都过 → 成交
    check("3 回合后消气 → 正常成交（不再 npc_refusing）", !!later.settlement, `reason=${later.rejected?.reason}`);
  }

  console.log("== KPI：每日定额（渐进难度）+ 评分 ==");
  {
    check("定额渐进：第1天50 第3天100 第9天250", kpiQuotaFor(1) === 50 && kpiQuotaFor(3) === 100 && kpiQuotaFor(9) === 250);
    const g = (e: number) => gradeKpi(e, 100).score;
    check("评分档位：0→D 50→C 70→B 100→A 250→S", g(0) === "D" && g(50) === "C" && g(70) === "B" && g(100) === "A" && g(250) === "S");

    const llm = new FakeLLM([
      { emotion: "amused", effects: ["trust_up_medium", "interest_up_medium"], conditionHints: ["make_laugh"] },
    ]);
    const dir = path.join(tmpDir, "kpi");
    fs.mkdirSync(dir, { recursive: true });
    const world = makeWorld(llm, dir);
    const state = await fetchStateFor(world);
    check("GameState 下发 KPI 进度", state.kpi.quota === 50 && state.kpi.earned === 0);
    check("公开视图带攻略提示", (state.npcs["frugal_uncle"]?.strategyHints?.length ?? 0) >= 3);
    await world.conversation.handlePlayerMessage("frugal_uncle", "大叔您好，看看您。");
    await world.conversation.handlePlayerMessage("frugal_uncle", "您身体真硬朗。");
    await world.conversation.attemptSale("frugal_uncle", "mop3000");
    const report = world.dayService.endDay();
    check("日报含 KPI 结算", report.kpi.quota === 50 && report.kpi.earned === 80 && report.kpi.met === true);
    check("完成度 160% → A 评分", report.kpi.score === "A", `score=${report.kpi.score}`);
    check("评语非空", report.kpi.note.length > 4);
  }

  console.log("== 任务难度逐步解锁 ==");
  {
    const catalog = new ProductCatalog();
    check("第 1 天任务难度 ≤★2", (catalog.all[catalog.task.productId]?.difficulty ?? 9) <= 2);
    let sawHard = false;
    for (let i = 0; i < 100; i++) {
      catalog.rollNewDay(); // 摇到第 101 天，★4 应该会出现
      if (catalog.task.productId === "basement") sawHard = true;
    }
    check("后期（100 天）能摇出 ★4 地下室", sawHard);
  }

  {
    const llm = new FakeLLM([
      { emotion: "amused", effects: ["trust_up_medium", "interest_up_medium"], conditionHints: ["make_laugh"] },
    ]);
    const dir = path.join(tmpDir, "regress");
    fs.mkdirSync(dir, { recursive: true });
    const world = makeWorld(llm, dir);
    const npc = world.npcService.getNPC("frugal_uncle")!;

    await world.conversation.handlePlayerMessage("frugal_uncle", "大叔您好，看看您。");
    await world.conversation.handlePlayerMessage("frugal_uncle", "您身体真硬朗。");
    check("逗笑+信任+兴趣到位", npc.vitals.trust >= trustGateFor(npc) && npc.vitals.interest >= 25);
    const sale = await world.conversation.attemptSale("frugal_uncle", "mop3000");
    check("递合同成交", !!sale.settlement, sale.rejected ? `reason=${sale.rejected.reason}` : "");
    check("佣金入账（拖把 ¥80）", world.player.getMoney() === 80, `money=${world.player.getMoney()}`);
    check("成交日记为真实天数", npc.purchased[0]?.day === 1);
    check("日报记了这一单", world.dayService.sales.length === 1);

    const report = world.dayService.endDay();
    world.conversation.resetForNewDay();
    check("跨天推进", report.day === 1 && report.nextDay === 2 && world.dayService.currentDay === 2);
    check("跨天后购买记忆保留", npc.purchased.length === 1);
    check("跨天后正向条件保留", npc.conditionFlags["laughed"]?.count === 1);
    check("跨天后会话清空", world.conversation.getHistory("frugal_uncle").length === 0);
    check("新任务货入背包", world.player.getInventory().includes(world.catalog.task.productId));

    // 第 2 天重复递已购商品
    await world.conversation.handlePlayerMessage("frugal_uncle", "大叔又见啦。");
    await world.conversation.handlePlayerMessage("frugal_uncle", "还记得我不？");
    const repeat = await world.conversation.attemptSale("frugal_uncle", "mop3000");
    check("重复递已购商品 → already_owned", repeat.rejected?.reason === "already_owned");
    check("重复递不扣代价", world.dayService.sales.length === 0);
  }

  console.log("== 回归：商品目录（B5 修订：不粘锅回归）==");
  {
    const catalog = new ProductCatalog();
    check("常规货 8 件", Object.keys(catalog.normal).length === 8, `n=${Object.keys(catalog.normal).length}`);
    check("新商品就位：护膝+老人手机+不粘锅", !!catalog.all["knee_pad"] && !!catalog.all["senior_phone"] && !!catalog.all["pan"]);
    check("特殊货佣金按难度：★3=400", catalog.all["cat_insurance"]?.commission === 400);
    check("任务池排除彩蛋货（5 件可摇）", (() => {
      // 摇 200 次，不应出现 rocket_pad
      const c = new ProductCatalog();
      for (let i = 0; i < 200; i++) {
        c.rollNewDay();
        if (c.task.productId === "rocket_pad") return false;
      }
      return true;
    })());
  }

  console.log("== A4b confirmTags 旁证：LLM 漏打标也救得回来（张姐聊女儿）==");
  {
    // 实测场景：把张姐聊到红眼圈，模型没打 mention_family 的标，条件没达成
    const llm = new FakeLLM([
      { emotion: "neutral", effects: [] }, // 玩家提到闺女高三，无 hint、无 revealed
    ]);
    const world = makeWorld(llm, tmpDir);
    const npc = world.npcService.getNPC("sister_zhang")!;
    await world.conversation.handlePlayerMessage("sister_zhang", "张姐，闺女高三了吧，这阵子辛苦了。");
    check("tag 命中 → family_mentioned 记账", npc.conditionFlags["family_mentioned"]?.count === 1, `flags=${JSON.stringify(npc.conditionFlags)}`);
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log(failed === 0 ? "\n🎉 全部通过" : `\n💥 ${failed} 项失败`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
