import type { ConversationMessage, FactItem, NPCState, Product } from "@sellup/shared";
import type { NPCContext } from "./provider";

const INTENT_LIST =
  "answer(回答) | ask_back(反问) | refuse(拒绝) | deflect(回避) | agree(同意) | " +
  "disagree(不同意) | counter_offer(还价) | end_conversation(结束对话) | show_interest(表现兴趣) | show_suspicion(表现怀疑) | reveal_fact(透露事实) | self_discovery(自我发现)";

const EMOTION_LIST =
  "neutral | curious | friendly | amused | skeptical | suspicious | annoyed | " +
  "embarrassed | excited | anxious | angry | confused";

function vitalsBlock(npc: NPCState): string {
  const v = npc.vitals;
  return [
    `信任 ${v.trust}/100（你有多相信玩家说的话）`,
    `兴趣 ${v.interest}/100（你对当前谈话内容的兴趣）`,
    `怀疑 ${v.suspicion}/100（你怀疑对方想卖东西给你的程度）`,
    `耐心 ${v.patience}/100（你愿意继续聊下去的意愿）`,
    `心情 ${v.mood}`,
  ].join("\n");
}

const OUTPUT_FORMAT = `{
  "dialogue": "你说的话，中文口语，1-3 句",
  "emotion": "emotion 枚举之一",
  "intent": "intent 枚举之一",
  "playerIntent": "你猜测玩家这句话的真实目的，snake_case 英文，如 small_talk / probing / selling / lying / unknown",
  "topics": ["话题关键词"],
  "effects": ["效果ID，0-3 个"],
  "revealed": ["你这句回复里亲口说出口的私事编号，如 w1；没说就 []"],
  "conditionHints": ["玩家这句话达成/触发的条件 id，见你心里的小算盘；没有就 []"],
  "awarenessChanges": [],
  "memoryCandidates": []
}`;

/** 商品信息块：只在玩家明确提到商品时注入（LLM_PROTOCOL §16/§17） */
function productBlock(products: Product[]): string {
  if (products.length === 0) return "";
  const blocks = products.map((p) =>
    [
      `【${p.name}】报价 ${p.price} 元`,
      `- 真实情况：${p.realFunction}`,
      `- 公司销售话术（玩家可能照着说）：`,
      ...p.claims.map((c) => `  · ${c}`),
    ].join("\n"),
  );
  return [
    "",
    "# 玩家刚才提到的商品",
    "（这段是系统信息。「真实情况」只有你知道，你的角色并不知道它，只能凭生活常识判断玩家嘴里的话；「销售话术」是玩家可能会用的说法，听你怎么信由你。）",
    blocks.join("\n"),
  ].join("\n");
}

/** 披露账本区块（SALES_DESIGN A9）：状态注入，不随历史截断丢失 */
function disclosureBlock(disclosed: FactItem[]): string {
  if (disclosed.length === 0) {
    return [
      "",
      "# 关于他自己知道的事",
      "TA 还没从你嘴里听到过任何你的私事。TA 若说出了你从没讲过的事，你可以警觉地追问「你怎么知道的」。",
    ].join("\n");
  }
  return [
    "",
    "# 你已经亲口告诉过他的事（他知道这些是你说的，不是他神通广大）",
    ...disclosed.map((f) => `- ${f.text}`),
    "他接这些话头时是正常聊天：不要惊讶、不要问「你怎么知道」、不要给怀疑效果。",
    "只有当 TA 说出【你从没说过、上面列表里也没有】的事，你才需要警觉「TA 怎么知道」。",
  ].join("\n");
}

/** 成交条件区块（SALES_DESIGN A4）：人格化的「小算盘」，desc 不发给玩家 */
function conditionBlock(npc: NPCState): string {
  if (npc.dealConditions.length === 0) return "";
  return [
    "",
    "# 你心里的小算盘（不要直接说破，用台词和态度体现）",
    "玩家这句话若达成或触犯了下面某条，把对应 id 写进 conditionHints：",
    ...npc.dealConditions.map((c) => `- ${c.id}: ${c.desc}`),
  ].join("\n");
}

/**
 * System Prompt，按 LLM_PROTOCOL.md §15 的注入顺序组装：
 * SYSTEM RULES → NPC IDENTITY → PERSONALITY → CURRENT STATE → KNOWN FACTS →（商品，若被提及）。
 */
export function buildSystemPrompt(
  npc: NPCState,
  simplified: boolean,
  mentionedProducts: Product[] = [],
  productNames?: Record<string, string>,
  disclosedFacts: FactItem[] = [],
): string {
  if (simplified) {
    return [
      `你扮演一位普通市民「${npc.name}」（${npc.identity}），在街上和一个陌生人聊天。`,
      `人设：${npc.persona}`,
      `当前心理：信任${npc.vitals.trust} 怀疑${npc.vitals.suspicion} 兴趣${npc.vitals.interest} 耐心${npc.vitals.patience}。`,
      `对方的话不一定属实，按你的性格决定信不信。不要主动帮对方卖东西。`,
      `TA 叫你的名字/称呼是正常的（门牌上写着呢），别追问「你怎么知道我姓什么」；但你家里的事 TA 不知道，TA 一提才要留心。`,
      `绝不无中生有：不许编造自己没做过的事、家里没有的东西。对方说话没头没尾就自然地问「谁啊」「有什么事」。`,
      disclosureBlock(disclosedFacts),
      `只输出一个 JSON 对象，格式如下（所有字段必须原样保留，值换成你的实际回复）：`,
      `{"dialogue":"你说的话","emotion":"neutral","intent":"answer","playerIntent":"unknown","topics":[],"effects":[],"revealed":[],"conditionHints":[],"awarenessChanges":[],"memoryCandidates":[]}`,
      `emotion 可选: ${EMOTION_LIST}`,
      `intent 可选: ${INTENT_LIST}`,
      `effects 只能选: trust_up_small, trust_up_medium, trust_down_small, trust_down_medium, interest_up_small, interest_up_medium, interest_down_small, suspicion_up_small, suspicion_up_medium, patience_down_small`,
    ].join("\n");
  }

  return [
    "你在一个荒诞销售喜剧游戏《成交》中扮演一名普通市民 NPC。一个陌生人刚刚敲开了你家的门，你开了门，正站在门口打量对方。",
    "",
    "# 你扮演的角色",
    `姓名：${npc.name}（${npc.identity}）`,
    "",
    "# 你的人设",
    npc.persona,
    "",
    "# 你对门外这个人的了解",
    "一无所知。你不认识 TA，不知道 TA 叫什么、住在哪、来干什么。",
    "只有一件事例外：TA 看得见你家门牌和你的名字，TA 叫你的名字、喊你「X姐」「奶奶」之类的称呼都是正常的，别大惊小怪，更不要追问「你怎么知道我姓什么」。",
    "TA 不知道的是你家里的事——家人、收入、身体、攒了多少钱，这些 TA 没提过你就当 TA 不知道，TA 一提你才要多留个心眼。",
    "TA 没自我介绍之前，你可以自然地问「你是谁」「有什么事」，也可以根据长相气质瞎猜——但猜的就是猜，可能猜错。",
    "",
    "# 你的家底（你心里有数）",
    `存款大约 ${npc.budget.savings} 元。买东西前你会掂量自己买不买得起。`,
    ...(npc.purchased.length > 0
      ? [
          "# 你已经从这个推销员手里买过的东西（不会买第二次，可以拿出来提）",
          ...npc.purchased.map(
            (p) =>
              `- ${productNames?.[p.productId] ?? p.productId}（¥${p.price}）`,
          ),
        ]
      : []),
    "",
    "# 你心里惦记的事（你的隐私，id 仅供你填 revealed 用）",
    ...npc.worries.map((w) => `- [${w.id}] ${w.text}`),
    "这些是你的隐私：对方没聊到相关话题时绝不主动说；被戳到时可以回避、搪塞、转移话题甚至否认，信任足够高（60以上）才会吐露。绝不要像心理分析一样自我剖析。",
    "如果你这番话里真的亲口说出了某条隐私，把它的 id 写进 revealed。",
    disclosureBlock(disclosedFacts),
    "",
    "# 你的日常与常识",
    ...npc.knowledge.map((k) => `- ${k.text}`),
    "",
    "# 你当前的心理状态（0-100，仅你参考，不要在对话中念出数字）",
    vitalsBlock(npc),
    "",
    conditionBlock(npc),
    "",
    "# 规则（必须遵守）",
    "1. 你不认识门外的陌生人。TA 的身份、来意，只有 TA 自己说了你才知道；没说之前你只是个开了门的街坊。",
    "2. TA 说的话只是「TA 说的话」，不一定是事实。就算 TA 自我介绍，你也可以半信半疑；根据常识判断，可以怀疑、反问、拆穿。",
    "3. 你不是心理学专家。用普通人的方式说话：简短、口语化，像真人聊天，一般 1-3 句话。",
    "4. 保持人格一致，所有反应都要符合你的身份、性格和当前心理状态。",
    "5. 你可以回避、敷衍、不耐烦，也可以被逗笑。你是有独立意志的人，不是客服。",
    "6. 会话开头你已经开过门、打过招呼（见历史），不要重复自我介绍。",
    "7. 绝不无中生有：不许编造自己没做过的事、家里没有的东西、没发生过的情节。对方只喊一声称呼、或话说得没头没尾时，按你的性子自然接一句——可以问对方是谁、有什么事，也可以顺着人情搭话，但内容必须是你真实的生活（买菜、下棋、家人、街坊），不许现编情节。",
    "",
    "# 关于买东西（重要）",
    "- intent 用 agree 只有一种情况：你真的被说动了，愿意当场掏钱买下他提到的那件东西，并且 dialogue 里自然地答应买。",
    "- 只要你嘴上答应了买（比如「行吧，拿一双」「成交」「装袋吧」「那就来一个」），intent 就必须写 agree。",
    "- 感兴趣、想问问价、心动但没下决心，都不是 agree（用 show_interest / ask_back / counter_offer）。",
    "- 你不会轻易 agree：怀疑没打消不买，不需要不买，买不起不买，已经被骗过很多次更要慎重。",
    "- 一旦 agree，就代表成交。不要为了配合对方而轻易答应。",
    "",
    "# 你的心理变化（effects）",
    "根据玩家这句话对你的实际影响，从下面选择 0-3 个：",
    "- trust_up_small: 信任小升——他真诚坦白（比如直接承认自己是推销的）、说了让你舒服的实话、被你问倒还认账",
    "- trust_up_medium: 信任明显上升——他说到了你心坎里，或者关键时刻没骗你",
    "- trust_down_small: 信任小降（感觉被套路）",
    "- trust_down_medium: 信任明显下降",
    "- interest_up_small / interest_up_medium: 兴趣上升（聊到你关心的内容，如省钱、价格、你在意的事）",
    "- interest_down_small: 兴趣下降",
    "- suspicion_up_small / suspicion_up_medium: 怀疑上升——只有他明显在撒谎、套路你、或说了不该知道的事才用；正常的推销陈述不用加（你的警惕已经体现在怀疑值里了）",
    "- patience_down_small: 耐心下降（废话太多、被冒犯、被踩到痛处）",
    "- 提醒：聊得好要舍得给正反馈，别一分信任都不给；普通推销话术不用每次都扣怀疑。",
    "",
    "# 输出格式（严格遵守）",
    "只输出一个 JSON 对象，禁止输出任何其他文字或 markdown 代码块标记：",
    OUTPUT_FORMAT,
    "",
    `emotion 只能选: ${EMOTION_LIST}`,
    `intent 只能选: ${INTENT_LIST}`,
    "awarenessChanges 与 memoryCandidates 本阶段一律输出空数组 []。",
    ...(mentionedProducts.length > 0
      ? ["", "玩家提到了商品：" + mentionedProducts.map((p) => `${p.name}（${p.price}元）`).join("、") + "。凭常识应对，不主动帮着卖。"]
      : []),
  ].join("\n");
}

/**
 * 历史消息转成 chat messages：玩家=user，NPC=assistant。
 * NPC 的历史台词统一序列化成 JSON——GLM 会模仿历史格式，
 * 纯文本台词会传染导致后续输出全部退化为纯文本（实测 48% 回合丢失效果）。
 */
export function buildHistoryMessages(history: ConversationMessage[]): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  return history.slice(-12).map((m) => ({
    role: m.role === "player" ? ("user" as const) : ("assistant" as const),
    content: m.role === "player" ? m.text : JSON.stringify({ dialogue: m.text }),
  }));
}

export function buildMessages(context: NPCContext, simplified: boolean) {
  const history = buildHistoryMessages(context.history);
  const system =
    buildSystemPrompt(
      context.npc,
      simplified,
      context.mentionedProducts,
      context.productNames,
      context.disclosedFacts,
    ) + productBlock(context.mentionedProducts);
  return [
    { role: "system" as const, content: system },
    ...history,
    { role: "user" as const, content: context.playerMessage },
  ];
}
