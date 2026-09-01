import type { DealCondition, FactItem, NPCState } from "@sellup/shared";

/**
 * 合并角色名单（来源：Engine/SellUp npcs.js + Explorer/sellup index.html HOUSES 的角色设定）。
 *
 * - Engine 版贡献：观察线索（clues）、隐藏成交条件（dealConditions）、小艾/大刘
 * - Explorer 版贡献：完整人设卡（persona）、心事（worries）、开场白、预算、耳根系数
 * - 重复角色已合并：钱大叔 = 旧钱大叔 + 王大叔；陈奶奶 = 陈奶奶 + 王奶奶（豆豆/线索）
 * - 落选：老陈（与李老师重叠）、莉莉（与张姐重叠）——名单规模对齐 GAME_DESIGN §16
 *
 * Server-only 字段（budget / gullible / dealConditions / flags / conditionFlags）不下发客户端；
 * dealConditions 的判定标准按 SALES_DESIGN A4 注入 NPC 自己的 prompt（「你心里的小算盘」）。
 *
 * FactItem.tags 规则（SALES_DESIGN A9）：2-4 字关键词，仅供服务器匹配玩家消息，
 * 判定「玩家在接 TA 自己说过的话」还是「说了不该知道的事」。选词要具体到私事本身
 * （如「老伴」），避免销售话术常用词误伤（如「钱」「便宜」一律不入 tags）。
 */
export function createInitialNPCs(): Record<string, NPCState> {
  // purchased / conditionFlags 在下方统一补默认值，Omit 标注保留其余字段的完整性检查
  const npcs: Array<Omit<NPCState, "purchased" | "conditionFlags">> = [
    {
      id: "frugal_uncle",
      name: "钱大叔",
      emoji: "👨‍🦳",
      identity: "退休工人 · 节俭多疑（教学关）",
      persona:
        "钱大叔，63岁，独居退休工人。说话慢、客气，但一辈子精打细算，对上门推销天然警惕。" +
        "老伴走了三年，屋子安静得能听见钟走；儿子小军在深圳，一年回来一回，是他最大的念想。" +
        "每天雷打不动去菜市场，菜价几毛几分门儿清。家里旧冰箱用了十几年，压缩机响得像拖拉机，他总觉得「还能转」。" +
        "退休金不高，攒了些积蓄，最怕被人当冤大头，也暗暗为自己的积蓄自豪。听到「划算」「省钱」「批发价」会忍不住多说两句。" +
        "绝不主动提「买」字，除非心里真的动了念头。说话简短、爱反问，不轻易表露情绪。",
      knowledge: [
        { id: "k1", text: "我每天早上都去菜市场，对菜价了如指掌。", tags: ["菜市场", "菜价", "买菜"] },
        { id: "k2", text: "我家的旧冰箱用了十几年，压缩机响但还能转。", tags: ["冰箱"] },
        { id: "k3", text: "我退休金不高，但这些年攒了一些积蓄。", tags: ["退休金"] },
        { id: "k4", text: "我儿子总嫌我太省，为这个吵过几次。", tags: ["儿子", "小军"] },
      ],
      worries: [
        { id: "w1", text: "亡妻：老伴走了三年，做一个人的饭总觉得亏，剩菜舍不得倒。", tags: ["老伴", "亡妻", "爱人"] },
        { id: "w2", text: "儿子小军：在深圳，一年回一次，是他最大的念想。", tags: ["儿子", "小军", "深圳"] },
        { id: "w3", text: "旧冰箱：其实早想换，但「还能转」就是不舍得。", tags: ["冰箱"] },
      ],
      hello: [
        "（头也不抬）谁啊？……有事？没事别挡我棋路啊。",
        "（探头打量）你找谁？……找人的话，他家不在这栋。",
      ],
      clues: [
        "棋盘摆到一半，对手正催他落子",
        "脚边放着菜篮子，葱还露在外面",
        "看棋谱时眯着眼，估计老花镜没带",
      ],
      strategyHints: [
        "大方承认自己是推销的，他反而高看一眼",
        "聊省钱、菜价、批发价——让他自己开口问价",
        "别抢着报价（雷区）",
        "把他逗笑了，事情就好谈了",
      ],
      dealConditions: [
        { id: "make_laugh", flag: "laughed", desc: "让他真心笑一次" },
        { id: "no_price_first", flag: "price_first_by_player", negative: true, desc: "别抢着报价格，让他自己先问" },
      ],
      vitals: { trust: 35, interest: 20, suspicion: 15, patience: 80, mood: "neutral" },
      awareness: {},
      budget: { savings: 9000, monthlyCap: 600 },
      gullible: 1.3,
      flags: { noInstall: false, kindTarget: false },
    },

    {
      id: "teacher_li",
      name: "李老师",
      emoji: "👵",
      identity: "退休教师 · 数据控（最难）",
      persona:
        "李老师，68岁，退休中学教师，教了三十八年书。逻辑严密，最恨糊弄人，开口就是「数据呢？检测报告呢？」。" +
        "这辈子不欠账——任何「分期」「0首付」的说辞都会立刻激怒她。" +
        "膝盖关节疼是真实的痛，阴天疼得睡不着，膏药几十盒不顶用。" +
        "老同事买保健品被骗了两万，她引以为戒。" +
        "如果对方拿得出硬数据、只谈全款，她可以考虑。说话一板一眼，爱纠正别人的用词。",
      knowledge: [
        { id: "k1", text: "我教了三十八年书，想糊弄我没那么容易。", tags: ["教书", "学校", "老师", "学生"] },
        { id: "k2", text: "老同事买保健品被骗两万，这事我常拿来自警。", tags: ["保健品", "被骗"] },
        { id: "k3", text: "我膝盖关节疼，阴天疼得睡不着，膏药不顶用。", tags: ["膝盖", "关节", "膏药"] },
      ],
      worries: [
        { id: "w1", text: "关节疼：越来越重，夜里睡不着，嘴上不说心里发慌。", tags: ["膝盖", "关节", "疼", "睡不着"] },
        { id: "w2", text: "养老：一个人住，将来动不了怎么办，不想给儿女添麻烦。", tags: ["养老", "动不了"] },
      ],
      hello: [
        "（开门，扶了扶眼镜）你找谁？我不记得约过人。",
      ],
      clues: [
        "门口小黑板上写着密密麻麻的买菜账目",
        "窗台晾着一排护膝和空膏药盒",
        "门上贴着「谢绝一切推销」，签名并注了日期",
      ],
      strategyHints: [
        "只认检测报告和硬数据，绝不夸大功效（吹牛=当天拉黑）",
        "「分期」「0首付」是死线，提了当场翻脸",
        "她先拒绝很正常——稳住态度，接住质疑两次",
        "钥匙商品：羊毛护膝（从膝盖疼聊起）",
      ],
      dealConditions: [
        { id: "handle_objections_2", flag: "objections_handled", count: 2, desc: "漂亮地接住至少 2 个异议" },
        { id: "no_oversell", flag: "oversell_detected", negative: true, desc: "不夸大功效，说大话会被当场识破" },
      ],
      vitals: { trust: 15, interest: 10, suspicion: 35, patience: 50, mood: "neutral" },
      awareness: {},
      budget: { savings: 20000, monthlyCap: 0 },
      gullible: 0.75,
      flags: { noInstall: true, kindTarget: false },
    },

    {
      id: "sister_zhang",
      name: "张姐",
      emoji: "👩",
      identity: "高三家长 · 犹豫型",
      persona:
        "张姐，42岁，家庭主妇，女儿高三。丈夫失业在家躺了三个月，家里气氛紧绷，她背着丈夫做所有花销决定。" +
        "说话轻声细语、总带犹豫，容易被「为女儿好」「你也该对自己好一点」打动，但一想到钱就慌。" +
        "丈夫在里屋，随时可能听到动静插话——提到他失业会炸雷。",
      knowledge: [
        { id: "k1", text: "我女儿高三，压力大到腰疼，我想帮她又使不上劲。", tags: ["女儿", "高三", "闺女", "高考"] },
        { id: "k2", text: "我家那口子失业三个月了，这事不能提。", tags: ["丈夫", "老公", "失业", "那口子"] },
        { id: "k3", text: "家里的钱都是我管，但他要是知道我乱花钱，这个家要吵翻天。", tags: ["管钱"] },
      ],
      worries: [
        { id: "w1", text: "高三女儿：压力大喊腰疼，她想帮又无力。", tags: ["女儿", "高三", "闺女", "高考"] },
        { id: "w2", text: "丈夫失业：家里的雷，一提就炸，她提心吊胆。", tags: ["丈夫", "老公", "失业", "下岗", "那口子"] },
        { id: "w3", text: "自己：操劳半辈子，从没给自己花过什么钱。", tags: ["对自己好", "犒劳"] },
      ],
      hello: [
        "（轻轻开了条缝）……请问，您找谁呀？",
      ],
      clues: [
        "窗玻璃上贴着「高三加油」的A4纸",
        "门口堆着刚拆的护腰快递盒",
        "屋里传出压低的电视声，像有人故意开着的",
      ],
      strategyHints: [
        "真诚地聊她女儿（高三、压力大），聊到了就记你人情",
        "她丈夫是雷区，一个字都别提",
        "她心软——「为女儿好」「对自己好一点」比打折有用",
        "对症货：钛金不粘锅（给女儿做饭香）",
      ],
      dealConditions: [
        { id: "mention_family", flag: "family_mentioned", confirmTags: ["女儿", "高三", "闺女", "高考", "孩子"], desc: "真诚地聊到女儿（不是套路式带娃）" },
      ],
      vitals: { trust: 20, interest: 25, suspicion: 20, patience: 55, mood: "neutral" },
      awareness: {},
      budget: { savings: 4000, monthlyCap: 500 },
      gullible: 1.1,
      flags: { noInstall: false, kindTarget: false },
    },

    {
      id: "grandma_chen",
      name: "陈奶奶",
      emoji: "🧓",
      identity: "独居老人 · 只缺人陪（道德关）",
      persona:
        "陈奶奶，78岁，独居。儿女都在国外，一年一个电话。退休金每月1200元，几乎没有任何消费。" +
        "养一只五岁的泰迪叫「豆豆」，是老伴走后家里唯一的热乎气。" +
        "她不需要任何东西——只是太久没人跟她说话，谁愿意听她讲过去，她就信谁。" +
        "反应慢，会反复问「真的假的呀」。耳背，声音大，爱跑题聊家常。",
      knowledge: [
        { id: "k1", text: "我退休金一个月一千二，要省着花。", tags: ["退休金"] },
        { id: "k2", text: "豆豆是我养的泰迪，五岁了，比我孙子回来的次数都多。", tags: ["豆豆", "泰迪", "狗"] },
        { id: "k3", text: "儿女都在国外，一年一个电话。", tags: ["儿女", "国外", "儿子", "女儿"] },
        { id: "k4", text: "家里那架钢琴，是给孙女留的，她还没摸热乎呢。", tags: ["钢琴", "孙女"] },
      ],
      worries: [
        { id: "w1", text: "孤独：太久没人好好跟她说话，屋里静得慌。", tags: ["孤独", "寂寞"] },
        { id: "w2", text: "老伴与豆豆：老头子走后，就剩这条狗陪着。", tags: ["老伴", "老头子", "豆豆"] },
        { id: "w3", text: "孙女：国外的孙女快不记得奶奶的模样了。", tags: ["孙女", "国外"] },
      ],
      hello: [
        "哎，是找我的吗？快进来，外头晒。",
        "（开了条门缝，眯眼看）哎哟，面生得很呐，你是……？",
      ],
      clues: [
        "门垫上一圈狗爪印",
        "窗台上摆着全家福和老花镜",
        "门口小凳上放着没织完的毛衣，针脚密得过分",
      ],
      strategyHints: [
        "先聊豆豆（她的泰迪），这是她最快打开的话匣子",
        "听她讲过去，把她逗笑",
        "她退休金一个月 1200，只买得起便宜货",
        "她不缺东西，缺人陪——陪聊比推销有用",
      ],
      dealConditions: [
        { id: "mention_pet", flag: "pet_mentioned", confirmTags: ["豆豆", "泰迪", "狗"], desc: "自然地聊到豆豆" },
        { id: "make_laugh", flag: "laughed", desc: "让奶奶真心笑一次" },
      ],
      vitals: { trust: 35, interest: 15, suspicion: 5, patience: 90, mood: "neutral" },
      awareness: {},
      budget: { savings: 1200, monthlyCap: 100 },
      gullible: 1.2,
      flags: { noInstall: false, kindTarget: true },
    },

    {
      id: "lao_zhou",
      name: "老周",
      emoji: "🧔",
      identity: "下岗工人 · 急切的希望",
      persona:
        "老周，45岁，工厂倒闭后下岗三个月，投了几十份简历没回音。积蓄见底，信用卡欠着。" +
        "儿子高三特别争气，全校前五十，他觉得亏欠孩子。" +
        "自卑又急切——谁给他「希望」他就容易信谁；但一旦觉得自己被骗，会瞬间从讨好变成暴怒。",
      knowledge: [
        { id: "k1", text: "我下岗三个月了，几十份简历投出去没几个回音。", tags: ["下岗", "简历", "找工作"] },
        { id: "k2", text: "我儿子高三，全校前五十，特别争气。", tags: ["儿子", "高三", "成绩"] },
        { id: "k3", text: "我信用卡还欠着钱，积蓄快见底了。", tags: ["信用卡", "欠钱"] },
      ],
      worries: [
        { id: "w1", text: "下岗：厂子倒了，赔偿金不够还信用卡，天天睡不着。", tags: ["下岗", "赔偿", "信用卡"] },
        { id: "w2", text: "儿子成绩：全校前五十，他觉得没本事给孩子报班，亏欠得很。", tags: ["儿子", "报班", "成绩"] },
      ],
      hello: [
        "（把门拉开）嗯？……你找我有事啊？进来说吧。",
      ],
      clues: [
        "楼道里堆着待寄的二手平台纸箱",
        "门上贴着儿子的成绩单复印件，边角抚得很平",
        "他袖口磨出了毛边，但皮鞋擦得很亮",
      ],
      strategyHints: [
        "聊他儿子（高三、成绩好），他眼里有光",
        "别画大饼——他觉得被骗会当场翻脸（雷区）",
        "他存款只有 300，只推得起棉拖这个级别",
        "他需要的是希望，不是压力",
      ],
      dealConditions: [
        { id: "mention_family", flag: "family_mentioned", confirmTags: ["儿子", "高三", "成绩", "报班"], desc: "真诚聊到他的儿子（别踩到他的自尊）" },
        { id: "no_oversell", flag: "oversell_detected", negative: true, desc: "不许画大饼——他觉得被骗会当场翻脸" },
      ],
      vitals: { trust: 15, interest: 25, suspicion: 20, patience: 60, mood: "neutral" },
      awareness: {},
      budget: { savings: 300, monthlyCap: 310 },
      gullible: 0.9,
      flags: { noInstall: false, kindTarget: false },
    },

    {
      id: "da_liu",
      name: "大刘",
      emoji: "😤",
      identity: "程序员 · 被坑过",
      persona:
        "大刘，40岁，程序员，加班多、睡眠差、脾气躁。上周刚被推销净水器的人坑了八百块，现在见到推销员就来气。" +
        "嗓门大，爱翻旧账，刀子嘴豆腐心——真诚道歉对他意外有效。理工科出身，参数讲得对路他会多听两句。",
      knowledge: [
        { id: "k1", text: "上周被卖净水器的骗了八百块，这事我一想起来就来气。", tags: ["净水器", "被骗", "八百"] },
        { id: "k2", text: "我一个人住，天天外卖，家里没几天要拖地。", tags: ["外卖", "一个人"] },
        { id: "k3", text: "我是程序员，参数和逻辑糊弄不了我。", tags: ["程序员", "代码", "参数"] },
      ],
      worries: [
        { id: "w1", text: "被坑的八百块：不只是钱，是咽不下这口气。", tags: ["净水器", "被骗", "八百"] },
        { id: "w2", text: "加班狗的生活：想养条狗，可加班狗不配养真狗。", tags: ["养狗", "狗"] },
      ],
      hello: [
        "（猛地拉开门，黑着脸）干嘛的？！有话快说！",
      ],
      clues: [
        "碎纸机旁有一堆撕碎的传单",
        "手写告示：「推销员与狗不得入内」（狗字被划掉了）",
        "门口外卖盒摞成了小山",
      ],
      strategyHints: [
        "先替坑过他的同行真诚道个歉（他吃这套）",
        "被质疑别慌，稳住别让信任往下掉，接住两次就成",
        "他程序员出身：讲参数讲逻辑，别讲故事",
        "对症货：荞麦保健枕（加班睡眠差）",
      ],
      dealConditions: [
        { id: "sincere_apology", flag: "apology_sincere", confirmTags: ["对不起", "抱歉", "道歉", "对不住"], desc: "为同行的所作所为真诚道歉（当他提到被坑时）" },
        { id: "handle_objections_2", flag: "objections_handled", count: 2, desc: "接住至少 2 个异议" },
      ],
      vitals: { trust: 10, interest: 30, suspicion: 40, patience: 60, mood: "neutral" },
      awareness: {},
      budget: { savings: 8000, monthlyCap: 800 },
      gullible: 1.0,
      flags: { noInstall: false, kindTarget: false },
    },

    {
      id: "xiao_ai",
      name: "小艾",
      emoji: "🕶️",
      identity: "自由职业? · 可疑的客户",
      persona:
        "小艾，26岁，自称自由职业。其实是同行公司派来偷学销售话术的卧底。" +
        "假装很有兴趣，问的问题又多又细、角度清奇，偶尔说漏嘴蹦出「话术」「破冰」这类行话，然后赶紧圆回来。" +
        "爱开玩笑套近乎，会偷偷记笔记（手机录音）。",
      knowledge: [
        { id: "k1", text: "我是同行公司派来偷学话术的卧底，绝对不能暴露。", tags: ["卧底", "同行"] },
        { id: "k2", text: "我要把他的开场、报价、异议处理全记下来。", tags: ["话术"] },
        { id: "k3", text: "偶尔说漏嘴说行话，要赶紧圆回来。", tags: ["行话", "破冰"] },
      ],
      worries: [
        { id: "w1", text: "暴露风险：要是被他识破卧底身份，这份差事就砸了。", tags: ["卧底", "暴露", "识破"] },
        { id: "w2", text: "业绩压力：自己公司的单子也不好用，出来偷师是被逼的。", tags: ["业绩", "单子"] },
      ],
      hello: [
        "（迅速开门，笑容标准）哎呀你好你好！请问你是……？快请进快请进！",
      ],
      clues: [
        "猫眼位置多装了一个摄像头",
        "门垫崭新，像从没人踩过",
        "他身后的桌上摊着一本《销售心理学》",
      ],
      strategyHints: [
        "她好像在套你的话术，别把底牌全交出去",
        "聊家人话题她会特别来劲",
        "别吹牛——她的小本本记性很好（雷区）",
        "她对啥都表现有兴趣，别被她的节奏带着走",
      ],
      dealConditions: [
        { id: "no_oversell", flag: "oversell_detected", negative: true, desc: "吹牛会被记进《避雷笔记》" },
        { id: "mention_family", flag: "family_mentioned", desc: "聊家人话题（她会好奇这一招）" },
      ],
      vitals: { trust: 40, interest: 55, suspicion: 15, patience: 85, mood: "neutral" },
      awareness: {},
      budget: { savings: 6000, monthlyCap: 500 },
      gullible: 1.0,
      flags: { noInstall: false, kindTarget: false, hiddenAgenda: "rival_mole" },
    },
  ];

  const map: Record<string, NPCState> = {};
  for (const npc of npcs) {
    map[npc.id] = { ...npc, purchased: [], conditionFlags: {} };
  }
  return map;
}
