import Phaser from "phaser";
import type { NPCPublicView } from "@sellup/shared";
import { fetchGameState } from "../network/apiClient";
import { ChatOverlay } from "../ui/ChatOverlay";
import { HudOverlay } from "../ui/HudOverlay";
import { ReportOverlay } from "../ui/ReportOverlay";
import { StartOverlay } from "../ui/StartOverlay";
import { TutorialOverlay } from "../ui/TutorialOverlay";

const GAME_WIDTH = 960;
const GAME_HEIGHT = 600;
const PLAYER_SPEED = 260;

const OUTLINE = 0x2e2620;

/** NPC 驻点巡逻参数：每位 NPC 在自己的地点道具附近小范围踱步，散步停顿节奏不同。walk 单位 = px/s */
const NPC_PATROL: Record<
  string,
  { x: number; y: number; range: number; walk: number; pauseMin: number; pauseMax: number }
> = {
  // 钱大叔：咖啡店门口遮阳伞圆桌边
  frugal_uncle: { x: 96, y: 486, range: 26, walk: 50, pauseMin: 1800, pauseMax: 4200 },
  // 李老师：便利店门口纸箱促销堆旁
  teacher_li: { x: 269, y: 486, range: 30, walk: 41, pauseMin: 2400, pauseMax: 5200 },
  // 张姐：裁缝铺门口布匹架边
  sister_zhang: { x: 442, y: 486, range: 26, walk: 46, pauseMin: 2000, pauseMax: 4800 },
  // 陈奶奶：公园入口大树下石桌棋盘旁（豆豆守家，奶奶晒太阳）
  grandma_chen: { x: 624, y: 486, range: 20, walk: 31, pauseMin: 2800, pauseMax: 6000 },
  // 老周：公交站长椅边（等人也等机会）
  lao_zhou: { x: 816, y: 486, range: 34, walk: 55, pauseMin: 1600, pauseMax: 4000 },
  // 大刘：路口电线杆下抽烟瞪人
  da_liu: { x: 180, y: 566, range: 38, walk: 60, pauseMin: 1800, pauseMax: 4400 },
  // 小艾：树荫边抄本子（其实 headquarters 在耳机里）
  xiao_ai: { x: 700, y: 566, range: 40, walk: 65, pauseMin: 1200, pauseMax: 3600 },
};

const FALLBACK_PATROL = { x: GAME_WIDTH / 2, y: 470, range: 30, walk: 48, pauseMin: 1800, pauseMax: 4400 };

/** 按键交互距离：玩家中心与 NPC 中心小于该值时可按 F 交谈 */
const TALK_RANGE = 72;

interface ShopDef {
  x: number;
  color: number;
  label: string;
}

const SHOPS: ShopDef[] = [
  { x: 90, color: 0x8a5a33, label: "咖啡店" },
  { x: 250, color: 0x4a6fa5, label: "便利店" },
  { x: 410, color: 0x9a4a4a, label: "裁缝铺" },
  { x: 570, color: 0x5a7d4a, label: "公园入口" },
  { x: 730, color: 0x777777, label: "公交站" },
];

const NPC_BODY_COLORS = [
  0xa8763e, 0x7d6aa8, 0xa86a8a, 0x6a9aa8, 0x8a9a4a, 0xa85a4a, 0x4a8a7d,
];

/** NPC 心情徽章（数据来自服务器回复，客户端只做展示） */
const MOOD_EMOJI: Record<string, string> = {
  neutral: "😐",
  curious: "🤔",
  friendly: "😊",
  amused: "😄",
  skeptical: "🧐",
  suspicious: "🤨",
  annoyed: "😒",
  embarrassed: "😳",
  excited: "🤩",
  anxious: "😰",
  angry: "😠",
  confused: "😵",
};

interface NpcEntry {
  id: string;
  body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  bubble: Phaser.GameObjects.Text;
  prompt: Phaser.GameObjects.Text;
  /** 脚下椭圆影子（跟随水平移动） */
  shadow: Phaser.GameObjects.Ellipse;
  /** 心情徽章（聊过天才有；位置跟随名字标签右侧） */
  moodBadge: Phaser.GameObjects.Text;
  patrol: typeof FALLBACK_PATROL;
  tween?: Phaser.Tweens.Tween;
  /** 巡逻状态（每帧在 update 里步进，避免定时器补偿连发） */
  walkTarget: number | null;
  pauseUntil: number;
}

/**
 * PHASE 1-2：社区场景。
 * 美术：手绘街道背景 + 角色 sprite（缺资产自动回退矩形占位），
 * 本轮视觉升级：脚下椭圆影子、玩家行走弹跳、NPC 走路摇摆、
 * 成交金币飘字、NPC 心情徽章、跨天 splash、标题显示真实天数。
 * 玩法呈现：玩家走近 NPC 按 F 交谈（也可点击）；NPC 在驻点附近踱步巡逻。
 * 游戏数值/成交/服务端交互全部保持原逻辑。
 */
export class TownScene extends Phaser.Scene {
  private chatOverlay!: ChatOverlay;
  private hud!: HudOverlay;
  private player!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private playerLabel!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private keyF!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private hint!: Phaser.GameObjects.Text;
  private npcs: NpcEntry[] = [];
  private facing = 1;
  /** 玩家逻辑坐标（渲染时叠加行走弹跳偏移，避免污染移动/边界逻辑） */
  private playerX = 480;
  private playerY = 0;
  private playerBobT = 0;
  /** 手机虚拟摇杆状态（触摸拖动移动，桌面鼠标拖动同样可用） */
  private joyPointerId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private joyBase!: Phaser.GameObjects.Arc;
  private joyThumb!: Phaser.GameObjects.Arc;
  private autoWalkNpc: NpcEntry | null = null;

  constructor() {
    super("TownScene");
  }

  create(): void {
    this.chatOverlay = new ChatOverlay("chat-root");
    const reportOverlay = new ReportOverlay("hud-root");
    this.hud = new HudOverlay("hud-root", reportOverlay);
    // 玩法教程：新档自动弹（StartOverlay 触发），HUD ❓ 随时重看
    new TutorialOverlay("hud-root");
    // 开始页盖在场景之上：继续=揭幕开玩；新的开始=清档重开
    new StartOverlay("start-root");
    this.npcs = [];
    this.drawStreet();
    this.spawnPlayer(480, 560);
    void this.loadNPCs();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      w: this.input.keyboard!.addKey("W"),
      a: this.input.keyboard!.addKey("A"),
      s: this.input.keyboard!.addKey("S"),
      d: this.input.keyboard!.addKey("D"),
    };
    this.keyF = this.input.keyboard!.addKey("F");
    this.keyE = this.input.keyboard!.addKey("E");
    this.keyEsc = this.input.keyboard!.addKey("ESC");

    this.setupTouchControls();
    this.setupFeedbackListeners();

    // 调试钩子（AGENTS.md §13）：控制台可直接读写场景状态
    (window as any).__sellup = this;

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 24, "←↑↓→ / WASD 或按住拖动移动 · 点 NPC 自动走近交谈", {
        fontSize: "14px",
        color: "#f5efdc",
        backgroundColor: "#2e2620cc",
        padding: { x: 12, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(50);
  }

  /**
   * 表现层反馈（全部由服务器权威数据驱动，客户端只做展示）：
   * - sellout:vitals → NPC 头顶心情徽章
   * - sellout:earn   → 玩家头顶金币飘字
   * - sellout:day-start → 跨天 splash + 标题更新
   */
  private setupFeedbackListeners(): void {
    window.addEventListener("sellout:vitals", ((ev: CustomEvent<{ npcId: string; mood: string }>) => {
      const entry = this.npcs.find((n) => n.id === ev.detail.npcId);
      const emoji = MOOD_EMOJI[ev.detail.mood];
      if (entry && emoji) {
        entry.moodBadge.setText(emoji).setVisible(true);
        this.placeMoodBadge(entry);
      }
    }) as EventListener);

    window.addEventListener("sellout:earn", ((ev: CustomEvent<{ amount: number; bonus: number }>) => {
      this.spawnEarnFloat(ev.detail.amount, ev.detail.bonus);
    }) as EventListener);

    window.addEventListener("sellout:day-start", ((ev: CustomEvent<number>) => {
      this.setTitleDay(ev.detail);
      this.playDaySplash(ev.detail);
    }) as EventListener);
  }

  private setTitleDay(day: number): void {
    this.titleText.setText(`SELL OUT / 成交 — 第 ${day} 天`);
  }

  /** 跨天过场：暗幕 + 「第 N 天」大字，1.6s 后掀开 */
  private playDaySplash(day: number): void {
    const veil = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2e2620, 0.86)
      .setDepth(80);
    const big = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 10, `☀️ 第 ${day} 天`, {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "56px",
        fontStyle: "bold",
        color: "#ffd960",
      })
      .setOrigin(0.5)
      .setStroke("#2e2620", 8)
      .setDepth(81)
      .setScale(0.6);
    const sub = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 52, "背包已整理好 · 街坊们也出门了", {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "16px",
        color: "#f5efdc",
      })
      .setOrigin(0.5)
      .setDepth(81);

    this.tweens.add({
      targets: big,
      scale: 1,
      duration: 320,
      ease: "Back.easeOut",
    });
    this.time.delayedCall(1500, () => {
      this.tweens.add({
        targets: [veil, big, sub],
        alpha: 0,
        duration: 420,
        ease: "Sine.easeIn",
        onComplete: () => {
          veil.destroy();
          big.destroy();
          sub.destroy();
        },
      });
    });
  }

  /** 成交飘字：玩家头顶金色「+¥N」上浮渐隐；有任务奖金时附一行小字 */
  private spawnEarnFloat(amount: number, bonus: number): void {
    const x = this.player.x;
    const y = this.playerY - 70;
    const main = this.add
      .text(x, y, `+¥${amount} 🎉`, {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "22px",
        fontStyle: "bold",
        color: "#ffd960",
      })
      .setOrigin(0.5)
      .setStroke("#2e2620", 6)
      .setDepth(60);
    const sub = bonus
      ? this.add
          .text(x, y + 24, `含任务奖金 ¥${bonus}`, {
            fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
            fontSize: "12px",
            color: "#ffe690",
          })
          .setOrigin(0.5)
          .setStroke("#2e2620", 5)
          .setDepth(60)
      : null;

    this.tweens.add({
      targets: sub ? [main, sub] : main,
      y: "-=44",
      alpha: 0,
      duration: 1500,
      ease: "Sine.easeOut",
      onComplete: () => {
        main.destroy();
        sub?.destroy();
      },
    });
  }

  private async loadNPCs(attempt = 1): Promise<void> {
    try {
      const state = await fetchGameState();
      this.setTitleDay(state.day);
      const npcs = Object.values(state.npcs);
      // 驻点按 id 匹配；未知 id 依次落到前景备用驻点，保证不重叠
      npcs.forEach((npc, i) => {
        const patrol = NPC_PATROL[npc.id] ?? {
          ...FALLBACK_PATROL,
          x: 130 + (i * (GAME_WIDTH - 260)) / Math.max(1, npcs.length - 1),
          y: 470,
        };
        this.spawnNPC(npc, patrol.x, patrol.y, patrol);
      });
    } catch (e) {
      // 首次走隧道/冷连接可能瞬时失败，自动重试
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 2000 * attempt));
        if (!this.scene.isActive("TownScene")) return;
        return this.loadNPCs(attempt + 1);
      }
      this.add
        .text(GAME_WIDTH / 2, 360, `⚠ 无法连接游戏服务器：${(e as Error).message}`, {
          fontSize: "14px",
          color: "#ff9a9a",
          backgroundColor: "#000000aa",
          padding: { x: 8, y: 4 },
        })
        .setOrigin(0.5)
        .setDepth(60);
    }
  }

  /**
   * 触摸控制（手机）：游戏区按下即出现虚拟摇杆，拖动方向=移动方向；
   * 点在 NPC 上不启摇杆（由 NPC 自己的 pointerdown 处理走近/开聊）。
   * 桌面鼠标拖动同样可用，不影响键盘。
   */
  private setupTouchControls(): void {
    this.input.addPointer(2);
    this.joyBase = this.add
      .circle(0, 0, 44, 0x000000, 0.22)
      .setStrokeStyle(2, 0xf5efdc, 0.5)
      .setDepth(40)
      .setVisible(false);
    this.joyThumb = this.add
      .circle(0, 0, 18, 0xf5efdc, 0.5)
      .setDepth(41)
      .setVisible(false);

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.chatOverlay.isOpen()) return;
      const hits = this.input.hitTestPointer(p);
      const hitNpc = hits.some((go) => this.npcs.some((n) => n.body === go));
      if (hitNpc) return;
      this.autoWalkNpc = null;
      this.joyPointerId = p.id;
      this.joyOrigin = { x: p.x, y: p.y };
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.setPosition(p.x, p.y).setVisible(true);
      this.joyThumb.setPosition(p.x, p.y).setVisible(true);
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.joyPointerId !== p.id || !p.isDown) return;
      const max = 56;
      let dx = p.x - this.joyOrigin.x;
      let dy = p.y - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
      }
      this.joyVec = { x: dx, y: dy };
      this.joyThumb.setPosition(this.joyOrigin.x + dx, this.joyOrigin.y + dy);
    });

    const joyEnd = (p: Phaser.Input.Pointer) => {
      if (this.joyPointerId !== p.id) return;
      this.joyPointerId = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.setVisible(false);
      this.joyThumb.setVisible(false);
    };
    this.input.on("pointerup", joyEnd);
    this.input.on("gameout", joyEnd);
  }

  private drawStreet(): void {
    if (this.textures.exists("bg_street")) {
      // 完整街道背景图（1920x1200 @2x → 960x600 显示）
      this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, "bg_street")
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setDepth(0);
    } else {
      // 回退：矩形占位
      this.add.rectangle(GAME_WIDTH / 2, 100, GAME_WIDTH, 200, 0x6f8f9f);
      this.add.rectangle(GAME_WIDTH / 2, 300, GAME_WIDTH, 110, 0x555555);
      for (let x = 40; x < GAME_WIDTH; x += 80) {
        this.add.rectangle(x, 300, 40, 4, 0xdddddd).setAlpha(0.7);
      }
      this.add.rectangle(GAME_WIDTH / 2, 420, GAME_WIDTH, 70, 0x9a917d);
      this.add.rectangle(GAME_WIDTH / 2, 452, GAME_WIDTH, 6, 0x7a7263);
    }

    if (!this.textures.exists("bg_street")) {
      // 回退时才绘制店铺占位（背景图已包含带招牌的店铺）
      for (const shop of SHOPS) {
        this.add.rectangle(shop.x, 160, 120, 130, shop.color).setStrokeStyle(3, OUTLINE);
        this.add
          .text(shop.x, 160, shop.label, {
            fontSize: "16px",
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0.5);
        this.add.rectangle(shop.x, 205, 70, 50, 0xf0e6c8).setStrokeStyle(2, OUTLINE);
      }
    }

    // 标题（天数等 loadNPCs 拿到服务器状态后补上）
    this.titleText = this.add
      .text(18, 14, "SELL OUT / 成交", {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "19px",
        color: "#2e2620",
        fontStyle: "bold",
      })
      .setStroke("#f5efdc", 5)
      .setDepth(5);
  }

  private spawnPlayer(x: number, y: number): void {
    this.playerX = x;
    this.playerY = y;
    this.playerShadow = this.add
      .ellipse(x, y + 40, 48, 13, 0x000000, 0.35)
      .setDepth(9);
    if (this.textures.exists("player")) {
      this.player = this.add
        .image(x, y, "player")
        .setDisplaySize(56, 84)
        .setDepth(10);
    } else {
      // 回退：矩形占位
      this.player = this.add.rectangle(x, y, 28, 44, 0x3d78d8).setStrokeStyle(2, 0x123).setDepth(10);
    }
    this.playerLabel = this.add
      .text(x, y - 54, "你", {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "13px",
        color: "#f5efdc",
        fontStyle: "bold",
      })
      .setStroke("#2e2620", 4)
      .setOrigin(0.5)
      .setDepth(10);
  }

  private spawnNPC(
    npc: NPCPublicView,
    x: number,
    y: number,
    patrol: typeof FALLBACK_PATROL,
  ): void {
    const texKey = `npc_${npc.id}`;
    const hasSprite = this.textures.exists(texKey);
    const shadow = this.add.ellipse(x, y + 46, 52, 13, 0x000000, 0.35).setDepth(9);
    const body: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle = hasSprite
      ? this.add
          .image(x, y, texKey)
          .setDisplaySize(64, 96)
          .setDepth(10)
          .setInteractive({ useHandCursor: true })
      : (() => {
          // 回退：彩色矩形占位（未知 id 同样走这里）
          const color = NPC_BODY_COLORS[Math.abs(hashId(npc.id)) % NPC_BODY_COLORS.length]!;
          const rect = this.add
            .rectangle(x, y, 30, 46, color)
            .setStrokeStyle(2, OUTLINE)
            .setDepth(10)
            .setInteractive({ useHandCursor: true });
          return rect;
        })();

    const label = this.add
      .text(x, y - 60, `${npc.emoji} ${npc.name}`, {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "13px",
        color: "#ffd9a0",
        fontStyle: "bold",
      })
      .setStroke("#2e2620", 4)
      .setOrigin(0.5)
      .setDepth(10);

    // 待机呼吸动画，让画面有一点生命力
    const tween = this.tweens.add({
      targets: [body, label],
      y: "-=4",
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Math.random() * 600,
    });

    // F 键交互提示
    const prompt = this.add
      .text(x, y - 80, "F 交谈", {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "11px",
        color: "#2e2620",
        backgroundColor: "#ffd960",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false);

    const bubble = this.add
      .text(x, y - 96, `💬 ${npc.identity}`, {
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        fontSize: "12px",
        color: "#2e2620",
        backgroundColor: "#f5efdc",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(11)
      .setVisible(false);

    // 心情徽章：聊过天之后才出现，挂名字右侧
    const moodBadge = this.add
      .text(x, y - 60, "", {
        fontSize: "15px",
        fontFamily: "Microsoft YaHei, PingFang SC, sans-serif",
        backgroundColor: "#f5efdcc8",
        color: "#2e2620",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0, 0.5)
      .setStroke("#2e2620", 2)
      .setDepth(10)
      .setVisible(false);

    const entry: NpcEntry = {
      id: npc.id,
      body,
      label,
      bubble,
      prompt,
      shadow,
      moodBadge,
      patrol,
      tween,
      walkTarget: null,
      // 开场各自先歇一会儿，避免所有人同时起步
      pauseUntil: this.time.now + Phaser.Math.Between(patrol.pauseMin, patrol.pauseMax),
    };
    this.npcs.push(entry);

    body.on("pointerdown", () => {
      // 范围内直接开聊；太远则自动走过去（手机点选主要交互）
      const d = Math.hypot(entry.body.x - this.player.x, entry.body.y - this.player.y);
      if (d <= TALK_RANGE) {
        this.chatOverlay.open(npc.id);
      } else {
        this.autoWalkNpc = entry;
      }
    });

    if (hasSprite) {
      body.on("pointerover", () => {
        (body as Phaser.GameObjects.Image).setTint(0xffe9c8);
        bubble.setVisible(true);
      });
      body.on("pointerout", () => {
        (body as Phaser.GameObjects.Image).clearTint();
        bubble.setVisible(false);
      });
    } else {
      body.on("pointerover", () => {
        (body as Phaser.GameObjects.Rectangle).setStrokeStyle(3, 0xffd960);
        bubble.setVisible(true);
      });
      body.on("pointerout", () => {
        (body as Phaser.GameObjects.Rectangle).setStrokeStyle(2, OUTLINE);
        bubble.setVisible(false);
      });
    }
  }

  /** 心情徽章挂在名字标签右侧（名字宽度可变，动态对齐） */
  private placeMoodBadge(entry: NpcEntry): void {
    entry.moodBadge.setPosition(entry.label.x + entry.label.width / 2 + 4, entry.label.y);
  }

  /**
   * NPC 驻点踱步：每帧步进一次（walk = px/s，帧率无关）。
   * 刻意不用 repeat 定时器——Phaser 时钟在帧耗时突增时会补偿性连发回调，
   * 导致 NPC 瞬移抽发；update 每帧最多走一步，结构上免疫该问题。
   */
  private stepPatrol(entry: NpcEntry, time: number, delta: number): void {
    const { x: cx, range, walk, pauseMin, pauseMax } = entry.patrol;

    if (entry.walkTarget == null) {
      if (time >= entry.pauseUntil) {
        entry.walkTarget = Phaser.Math.Clamp(
          cx + Phaser.Math.Between(-range, range),
          60,
          GAME_WIDTH - 60,
        );
      }
    } else {
      const dt = Math.min(delta, 100) / 1000;
      const dist = walk * dt;
      const dx = entry.walkTarget - entry.body.x;
      if (Math.abs(dx) <= dist) {
        entry.body.x = entry.walkTarget;
        entry.walkTarget = null;
        entry.pauseUntil = time + Phaser.Math.Between(pauseMin, pauseMax);
      } else {
        entry.body.x += Math.sign(dx) * dist;
      }
      // 走路摇摆（鸭子步）；sprite 才有朝向，占位矩形跳过
      if (entry.body instanceof Phaser.GameObjects.Image) {
        entry.body.setFlipX(dx < 0);
        entry.body.setAngle(entry.walkTarget == null ? 0 : Math.sin(time / 55) * 4);
      }
    }
    entry.shadow.x = entry.body.x;
    entry.label.x = entry.body.x;
    entry.prompt.x = entry.body.x;
    entry.bubble.x = entry.body.x;
    this.placeMoodBadge(entry);
  }

  /** 当前在交谈范围内的最近 NPC */
  private nearestNPC(): NpcEntry | null {
    let best: NpcEntry | null = null;
    let bestDist = Infinity;
    for (const entry of this.npcs) {
      const dx = entry.body.x - this.player.x;
      const dy = entry.body.y - this.playerY;
      const d = Math.hypot(dx, dy);
      if (d < TALK_RANGE && d < bestDist) {
        best = entry;
        bestDist = d;
      }
    }
    return best;
  }

  update(time: number, delta: number): void {
    // NPC 巡逻步进（每帧一次，walk = px/s）
    for (const entry of this.npcs) {
      this.stepPatrol(entry, time, delta);
    }

    const chatOpen = this.chatOverlay.isOpen();
    if (chatOpen) {
      // 聊天中：清掉自动走位与摇杆，保持原冻结行为
      this.autoWalkNpc = null;
      this.joyPointerId = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.setVisible(false);
      this.joyThumb.setVisible(false);
    }

    let moving = false;
    if (!chatOpen) {
      const speed = PLAYER_SPEED * (delta / 1000);
      let dx = 0;
      let dy = 0;
      if (this.cursors.left.isDown || this.wasd.a.isDown) dx -= speed;
      if (this.cursors.right.isDown || this.wasd.d.isDown) dx += speed;
      if (this.cursors.up.isDown || this.wasd.w.isDown) dy -= speed;
      if (this.cursors.down.isDown || this.wasd.s.isDown) dy += speed;

      // 虚拟摇杆（模拟量：拖得越短走得越慢）
      if (this.joyPointerId !== null) {
        const mag = Math.min(1, Math.hypot(this.joyVec.x, this.joyVec.y) / 56);
        if (mag > 0.12) {
          const ang = Math.atan2(this.joyVec.y, this.joyVec.x);
          dx += Math.cos(ang) * speed * mag;
          dy += Math.sin(ang) * speed * mag;
        }
      }

      // 点了远处 NPC：自动走过去
      if (!dx && !dy && this.autoWalkNpc) {
        const t = this.autoWalkNpc.body;
        const ddx = t.x - this.player.x;
        const ddy = t.y - this.playerY;
        const d = Math.hypot(ddx, ddy);
        if (d <= TALK_RANGE * 0.95) {
          const npc = this.autoWalkNpc;
          this.autoWalkNpc = null;
          if (npc.body instanceof Phaser.GameObjects.Image) {
            npc.body.setFlipX(this.player.x > npc.body.x ? false : true);
          }
          this.chatOverlay.open(npc.id);
        } else {
          dx += (ddx / d) * speed;
          dy += (ddy / d) * speed;
        }
      }

      if (dx !== 0 && this.player instanceof Phaser.GameObjects.Image) {
        this.facing = dx > 0 ? 1 : -1;
        this.player.setFlipX(this.facing < 0);
      }

      this.playerX = Phaser.Math.Clamp(this.player.x + dx, 20, GAME_WIDTH - 20);
      this.playerY = Phaser.Math.Clamp(this.playerY + dy, 380, GAME_HEIGHT - 20);
      moving = dx !== 0 || dy !== 0;
    }

    // 玩家行走弹跳：移动时小跳步 + 影子随高度缩放；停止时缓慢回正
    this.playerBobT = moving ? this.playerBobT + delta : 0;
    const bob = moving ? Math.abs(Math.sin(this.playerBobT / 85)) * 5 : 0;
    this.player.setPosition(this.playerX, this.playerY - bob);
    this.playerShadow.setPosition(this.playerX, this.playerY + 40);
    this.playerShadow.setScale(1 - bob / 18, 1);
    this.playerLabel.setPosition(this.playerX, this.playerY - bob - 54);

    // F 键交谈：范围内按 F 进入聊天；聊天中按 F/Esc 退出
    const near = this.nearestNPC();
    for (const entry of this.npcs) {
      entry.prompt.setVisible(entry === near && !chatOpen);
    }
    if (!chatOpen) {
      if (Phaser.Input.Keyboard.JustDown(this.keyF) && near) {
        // 面向玩家：按相对位置转向
        if (near.body instanceof Phaser.GameObjects.Image) {
          near.body.setFlipX(this.player.x > near.body.x ? false : true);
        }
        this.chatOverlay.open(near.id);
      }
    } else {
      // 聊天中：焦点在输入框（正在打字）时不响应快捷键，避免输入字母 f/e 误关聊天
      const active = document.activeElement as HTMLElement | null;
      const typing = !!active && (active.classList.contains("chat-input") || active.classList.contains("chat-sale-select"));
      if (
        !typing &&
        (Phaser.Input.Keyboard.JustDown(this.keyE) ||
          Phaser.Input.Keyboard.JustDown(this.keyF) ||
          Phaser.Input.Keyboard.JustDown(this.keyEsc))
      ) {
        this.chatOverlay.close();
      }
    }
  }
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return h;
}
