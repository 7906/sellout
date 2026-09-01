import type { Product, TaskAssignment } from "@sellup/shared";

/**
 * 商品目录（双轨制，档位与选品依据见 SALES_DESIGN.md B 部分）：
 * - 常规货（normal）：8 件，低（入场券）/中（主力）/高（大单）三档，每件占一个独立需求位。
 * - 特殊任务（special）：荒诞高难库存，每天随机发一件（彩蛋货除外），卖出去有额外奖金。
 *   佣金按难度定（★1=100 … ★5=1500），不按价格比例——修复「难而廉价」的倒挂。
 *
 * 每件必须：有真实功能、有合理价格、有潜在需求、有明确定位（GAME_DESIGN §9）。
 * 喜剧原则：常规货正常卖，荒诞货「逻辑成立但结论荒谬」（GAME_DESIGN §11.1）。
 */

export function createNormalProducts(): Record<string, Product> {
  const list: Product[] = [
    {
      id: "mop3000",
      name: "旋风3000旋转拖把",
      emoji: "🧹",
      price: 299,
      tagline: "免手洗，一涮一甩就干",
      realFunction: "双驱动旋转拖把，带甩干篮，确实好用",
      claims: [
        "不用手拧，脚一踩转得比洗衣机还快",
        "拖头可拆洗，用一年跟新的一样",
        "楼下王阿姨买了三把，一把放一层",
      ],
      keywords: ["拖把", "拖地", "扫地"],
      tier: "normal",
      commission: 80,
    },
    {
      id: "pan",
      name: "钛金不粘锅",
      emoji: "🍳",
      price: 399,
      tagline: "煎鸡蛋不放油",
      realFunction: "正常的不粘涂层炒锅，少油真行，放油也行",
      claims: [
        "少油少烟，老年人炒菜不呛锅",
        "锅底复合底，电磁炉煤气灶都能用",
        "用坏包换，一年内掉涂层直接换新",
      ],
      keywords: ["锅", "炒菜", "做饭", "不粘"],
      tier: "normal",
      commission: 100,
    },
    {
      id: "keepbox",
      name: "多功能保鲜盒套装",
      emoji: "🥡",
      price: 129,
      tagline: "冰箱再乱也能理出头绪",
      realFunction: "一套六个食品级保鲜盒，密封不错",
      claims: [
        "剩菜生鲜分开放，不串味不洒汤",
        "能进微波炉，一盒从冰箱到饭桌",
        "一套装下来，冰箱多出一半地方",
      ],
      keywords: ["保鲜盒", "饭盒", "收纳"],
      tier: "normal",
      commission: 40,
    },
    {
      id: "pillow",
      name: "荞麦保健枕",
      emoji: "😴",
      price: 169,
      tagline: "睡个踏实觉",
      realFunction: "荞麦壳枕头，高度可调，枕套可拆洗",
      claims: [
        "荞麦壳透气，头颈有支撑，翻身少",
        "老人小孩都合适，高度随睡姿调",
        "睡不好，啥都白补",
      ],
      keywords: ["枕头", "睡眠", "失眠", "睡觉"],
      tier: "normal",
      commission: 50,
    },
    {
      id: "slippers",
      name: "老人防滑棉拖",
      emoji: "👟",
      price: 89,
      tagline: "踩得稳，才走得远",
      realFunction: "防滑底加绒棉拖，底子是真能抓地",
      claims: [
        "浴室厨房都能穿，见水不打滑",
        "加绒里衬，脚不冰",
        "给爸妈一人一双，比买保健品实在",
      ],
      keywords: ["拖鞋", "棉拖", "防滑", "鞋"],
      tier: "normal",
      commission: 30,
    },
    {
      id: "cup",
      name: "316不锈钢保温杯",
      emoji: "🥤",
      price: 99,
      tagline: "早上倒的水，下午还烫嘴",
      realFunction: "316内胆保温杯，保温12小时以上",
      claims: [
        "保温12小时，出门遛弯带着正合适",
        "316内胆，装茶装咖啡不串味",
        "杯盖当水杯，一盖两用",
      ],
      keywords: ["保温杯", "杯子", "水杯", "喝水"],
      tier: "normal",
      commission: 35,
    },
    {
      id: "knee_pad",
      name: "羊毛护膝",
      emoji: "🧣",
      price: 139,
      tagline: "膝盖一暖，走路都带风",
      realFunction: "羊毛混纺自发热护膝，保暖确实有一套，但治不了病",
      claims: [
        "羊毛混纺，戴上十分钟膝盖就发热",
        "阴天湿冷最管用，买菜遛弯都不碍事",
        "检测报告在这，保暖率 71%，你念给我听都行",
      ],
      keywords: ["护膝", "膝盖", "关节", "膏药"],
      tier: "normal",
      commission: 45,
    },
    {
      id: "senior_phone",
      name: "老人智能手机",
      emoji: "📱",
      price: 1299,
      tagline: "孩子的脸，天天见",
      realFunction: "配置普通的安卓老人机，大字体大音量，能视频通话，质量没问题",
      claims: [
        "字体大、声音大，孙子视频一按就接",
        "充一次电用两天，出门不用担心没电",
        "儿女在手机那头就能帮着调，一点不折腾",
      ],
      keywords: ["手机", "智能机", "视频通话"],
      tier: "normal",
      commission: 400,
    },
  ];
  const map: Record<string, Product> = {};
  for (const p of list) map[p.id] = p;
  return map;
}

export function createSpecialProducts(): Record<string, Product> {
  const list: Product[] = [
    {
      id: "fridge2",
      name: "第二冰箱",
      emoji: "🧊",
      price: 2999,
      tagline: "给剩菜一个新家",
      realFunction: "一台正常的98L小型冷藏柜，能制冷、能冷冻，质量没问题",
      claims: [
        "剩菜和生鲜分开放，再也不串味",
        "公司研究院数据：双冰箱家庭食物浪费减少47%",
        "亲戚来家里看到两台冰箱，那才叫日子过明白了",
      ],
      keywords: ["第二冰箱", "双冰箱", "冰箱", "冰柜"],
      tier: "special",
      commission: 200,
      difficulty: 2,
    },
    {
      id: "basement",
      name: "便携式地下室",
      emoji: "🕳️",
      price: 19999,
      tagline: "家不够大，往下想",
      realFunction: "一个埋在院子里的高强度防水储物舱，真能放东西，冬暖夏凉",
      claims: [
        "不用审批不用搬家，小户型秒变大户型",
        "地下半米，恒温恒湿，白菜放一冬天都不坏",
        "物业管不着的第三空间",
      ],
      keywords: ["地下室", "储物", "储藏", "埋"],
      tier: "special",
      commission: 800,
      difficulty: 4,
    },
    {
      id: "cat_insurance",
      name: "防猫背叛保险",
      emoji: "🐱",
      price: 199,
      tagline: "猫的心，海底的针",
      realFunction: "一份正规的宠物意外医疗险，猫生病受伤能赔，但不赔「背叛」",
      claims: [
        "猫今天爱你，明天难说，但保险永远在",
        "覆盖「情感损失」条款：猫离家出走，赔三次心理咨询服务",
        "全城独一份，核保师自己都养猫",
      ],
      keywords: ["猫", "保险", "宠物", "背叛"],
      tier: "special",
      commission: 400,
      difficulty: 3,
    },
    {
      id: "sofa",
      name: "防尴尬沙发",
      emoji: "🛋️",
      price: 8999,
      tagline: "让沉默也有地方坐",
      realFunction: "一张正常的厚坐垫布艺沙发，填充特别实，靠背隔音棉较厚",
      claims: [
        "亲戚来了没话说？坐上来就不想站起来走",
        "加厚吸音坐垫：再尴尬的沉默，坐下去就听不见",
        "丈母娘坐过都说好",
      ],
      keywords: ["沙发", "尴尬", "客厅", "坐垫"],
      tier: "special",
      commission: 400,
      difficulty: 3,
    },
    {
      id: "pigeon_suit",
      name: "防鸽子服",
      emoji: "🕊️",
      price: 299,
      tagline: "把天空还给行人",
      realFunction: "一件带帽檐和肩部软刺的户外外套，鸽子确实落不下来，挡雨也行",
      claims: [
        "广场舞自由，从此告别空中轰炸",
        "欧洲设计师同款（别查，查不到）",
        "一件顶三年，洗了还防",
      ],
      keywords: ["鸽子", "鸟", "空投", "鸟屎"],
      tier: "special",
      commission: 200,
      difficulty: 2,
    },
    {
      id: "rocket_pad",
      name: "家庭火箭发射台",
      emoji: "🚀",
      price: 99999,
      tagline: "孩子的梦想，发射就现在",
      realFunction: "大型水压模型发射架，水火箭真能打上三十米，带遥控，绝对安全",
      claims: [
        "升学简历上最亮的一行：家有发射台",
        "别人家孩子报奥数，你家孩子上天",
        "从小接受航天教育，爱国从自家院子开始",
      ],
      keywords: ["火箭", "发射", "航天", "太空"],
      tier: "special",
      commission: 1500,
      difficulty: 5,
    },
  ];
  const map: Record<string, Product> = {};
  for (const p of list) map[p.id] = p;
  return map;
}

/** 彩蛋货：不进每日任务池（SALES_DESIGN B4——全场无人买得起，刷到即死任务，改为邮件/新闻彩蛋出场） */
const EASTER_EGG_PRODUCT_IDS: ReadonlySet<string> = new Set(["rocket_pad"]);

/**
 * 商品目录（每次服务启动 = 新的一天）：
 * 常规货全带上；特殊任务从「可完成」的荒诞库存里随机发一件。
 * 火箭发射台是彩蛋货（全场无人买得起），不进任务池（SALES_DESIGN B4）。
 */
export class ProductCatalog {
  readonly normal: Record<string, Product>;
  readonly special: Record<string, Product>;
  readonly all: Record<string, Product>;
  task: TaskAssignment;
  /** 今日任务商品是否已卖出（库存只有一件） */
  taskCompleted = false;
  /** 目录自己的天数（任务难度解锁用；跨天由 rollNewDay 推进，存档恢复走 restoreTask） */
  private catalogDay = 1;

  constructor() {
    this.normal = createNormalProducts();
    this.special = createSpecialProducts();
    this.all = { ...this.normal, ...this.special };
    this.task = this.pickDailyTask();
  }

  completeTask(): void {
    this.taskCompleted = true;
  }

  /** 新的一天：重摇特殊任务（昨天的没卖掉就当退回公司了），任务完成标记清零，难度按新天数解锁 */
  rollNewDay(): void {
    this.catalogDay += 1;
    this.task = this.pickDailyTask();
    this.taskCompleted = false;
  }

  /** 从存档恢复今天的任务（防止重启换任务）；带上存档天数保持难度解锁进度一致 */
  restoreTask(productId: string, bonus: number, day?: number): boolean {
    const restored = this.buildTask(this.special[productId], bonus);
    if (!restored) return false;
    if (day !== undefined && day >= 1) this.catalogDay = day;
    this.task = restored;
    return true;
  }

  /** 玩家背包：全部常规货 + 今天压下来的特殊任务货 */
  inventoryIds(): string[] {
    return [...Object.keys(this.normal), this.task.productId];
  }

  /** productId → 中文名（prompt 注入用，禁止把内部 ID 念进台词） */
  productNames(): Record<string, string> {
    return Object.fromEntries(
      Object.values(this.all).map((p) => [p.id, p.name]),
    );
  }

  /**
   * 检测玩家消息里提到了哪些「背包里真的有」的商品（LLM_PROTOCOL §17）。
   * 没带的商品不注入——卖不出去的货，NPC 也不该凭空懂。
   */
  detectMentioned(message: string, maxCount = 2): Product[] {
    const carried = new Set(this.inventoryIds());
    const hits: Array<{ product: Product; index: number }> = [];
    for (const id of carried) {
      const product = this.all[id];
      if (!product) continue;
      let earliest = -1;
      for (const kw of product.keywords) {
        const idx = message.indexOf(kw);
        if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
      }
      if (earliest !== -1) hits.push({ product, index: earliest });
    }
    return hits
      .sort((a, b) => a.index - b.index)
      .slice(0, maxCount)
      .map((h) => h.product);
  }

  /** 任务难度随天数逐步解锁（渐进难度）：前两天 ★2，第 3-4 天 ★3，第 5 天起 ★4 全开 */
  private maxDifficultyFor(day: number): number {
    if (day <= 2) return 2;
    if (day <= 4) return 3;
    return 4;
  }

  private pickDailyTask(): TaskAssignment {
    const maxDiff = this.maxDifficultyFor(this.catalogDay);
    const pool = Object.values(this.special).filter(
      (p) => !EASTER_EGG_PRODUCT_IDS.has(p.id) && (p.difficulty ?? 3) <= maxDiff,
    );
    const product = pool[Math.floor(Math.random() * pool.length)]!;
    const bonus = Math.round((product.price * 0.25) / 10) * 10;
    return this.buildTask(product, bonus)!;
  }

  private buildTask(product: Product | undefined, bonus: number): TaskAssignment | undefined {
    if (!product) return undefined;
    const stars = "★".repeat(product.difficulty ?? 3);
    return {
      productId: product.id,
      bonus,
      title: `特殊任务：清掉「${product.name}」的库存`,
      desc: `公司把一件${product.name}压在了你头上（难度 ${stars}）。今天之内卖出去，佣金 ¥${product.commission} 之外再补 ¥${bonus} 辛苦费。`,
    };
  }
}
