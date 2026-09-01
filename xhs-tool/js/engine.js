/* 销售规则引擎（与正式版同构：五道闸 / 隐藏条件 / 披露账本 / KPI） */
"use strict";

var SAVE_KEY = "sellout_xhs_save_v1";
var S = null;

function product(id) {
  var i, p;
  for (i = 0; i < PRODUCTS.length; i++) { p = PRODUCTS[i]; if (p.id === id) return p; }
  for (i = 0; i < SPECIALS.length; i++) { p = SPECIALS[i]; if (p.id === id) return p; }
  return null;
}

function pickTask(day) {
  var maxDiff = day <= 2 ? 2 : (day <= 4 ? 3 : 4);
  var pool = [];
  for (var i = 0; i < SPECIALS.length; i++) if (SPECIALS[i].difficulty <= maxDiff) pool.push(SPECIALS[i]);
  var p = pool[(day * 7 + 3) % pool.length];
  return { productId: p.id, bonus: Math.round((p.price * 0.25) / 10) * 10 };
}

function taskProduct() { return product(S.task.productId); }

function carriedIds() {
  var ids = [];
  for (var i = 0; i < PRODUCTS.length; i++) ids.push(PRODUCTS[i].id);
  if (!S.taskDone) ids.push(S.task.productId);
  return ids;
}

function freshState() {
  var npcs = {};
  for (var i = 0; i < NPCS.length; i++) {
    var n = NPCS[i];
    npcs[n.id] = { trust: Math.round(45 / n.gullible), interest: 15, suspicion: 15, patience: 100, purchased: [], flags: {}, turn: 0, revealed: [], refusedAt: -9, lastSaleTurn: -9, askedPrice: 0, compliments: 0 };
  }
  return { day: 1, money: 0, taskDone: false, task: pickTask(1), todaySales: [], npcs: npcs };
}

function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ } }
function loadSave() {
  try { var raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}

function kpiQuota(day) { return 50 + (day - 1) * 25; }
function earnedToday() {
  var sum = 0;
  for (var i = 0; i < S.todaySales.length; i++) sum += S.todaySales[i].gain;
  return sum;
}
function gradeKpi(earned, quota) {
  var ratio = quota > 0 ? earned / quota : 0;
  if (earned <= 0) return { score: "D", note: "保安记住了你的脸。", met: false };
  if (ratio >= 2) return { score: "S", note: "公司为你单开了一个部门（暂时只有你一个人）。", met: true };
  if (ratio >= 1) return { score: "A", note: "主管把你的照片挂上了荣誉墙（用的是入职模板照）。", met: true };
  if (ratio >= 0.6) return { score: "B", note: "公司表示理解，但不表示满意。", met: false };
  return { score: "C", note: "你收到了一封没有骂人的邮件（这更可怕了）。", met: false };
}

function clamp(v) { return Math.max(0, Math.min(100, v)); }
function applyVitals(npcId, d) {
  var v = S.npcs[npcId];
  v.trust = clamp(v.trust + (d.trust || 0));
  v.interest = clamp(v.interest + (d.interest || 0));
  v.suspicion = clamp(v.suspicion + (d.suspicion || 0));
  v.patience = clamp(v.patience + (d.patience || 0));
}
function hasFlag(npcId, flag) { return !!S.npcs[npcId].flags[flag]; }
function setFlag(npcId, flag) { S.npcs[npcId].flags[flag] = (S.npcs[npcId].flags[flag] || 0) + 1; }
function trustGate(def, st) { return Math.round(45 / def.gullible) + st.purchased.length * 5; }
function interestGate(p) { return p.price >= 1000 ? 40 : (p.price >= 250 ? 25 : 0); }
function npcDef(id) { for (var i = 0; i < NPCS.length; i++) if (NPCS[i].id === id) return NPCS[i]; return null; }

function pickLine(def, st, topic) {
  var pool = def.lines[topic] || def.lines.nonsense;
  return pool[st.turn % pool.length];
}

/* 语义分类（顺序即优先级） */
function classify(text) {
  if (/分期|0首付|零首付|月供|贷款/.test(text)) return "install";
  if (/包治|根治|百分百|世界第一|绝对不|特效|神器|治风湿|永不过时|全球第一/.test(text)) return "oversell";
  if (/\d{2,5}\s*(元|块)|¥\d/.test(text)) return "priceQuote";
  if (/对不起|抱歉|道歉|对不住/.test(text)) return "apology";
  if (/哈哈|笑话|乐子|逗你|段子|好笑/.test(text)) return "laugh";
  if (/多少钱|什么价|价格|贵不|打几折/.test(text)) return "askPrice";
  if (/推销|卖东西|我是销售|干销售|我是卖|干推销/.test(text)) return "honest";
  for (var i = 0; i < PRODUCTS.length; i++) {
    var kws = PRODUCTS[i].kw;
    for (var k = 0; k < kws.length; k++) if (text.indexOf(kws[k]) !== -1) return "product";
  }
  if (/女儿|闺女|儿子|孩子|高三|高考|成绩/.test(text)) return "family";
  if (/狗|泰迪|豆豆|猫|宠物/.test(text)) return "pet";
  if (/老伴|爱人|老头子|家属/.test(text)) return "spouse";
  if (/漂亮|好看|真棒|厉害|仙女|美女|帅|嘴甜|最好/.test(text)) return "compliment";
  if (/你好|您好|在吗|找谁|打扰|邻居|搬来/.test(text)) return "greet";
  return "nonsense";
}

/** 一轮对话：返回 {line, emotion, system} */
function chatTurn(npcId, text) {
  var def = npcDef(npcId);
  var st = S.npcs[npcId];
  st.turn += 1;
  var topic = classify(text);
  var line, emotion = "neutral", system = null, warm = false;
  var i, k, t;

  if (topic === "install" && npcId === "teacher_li") {
    applyVitals(npcId, { trust: -10, suspicion: 15, patience: -10 });
    return { line: def.lines.install[0], emotion: "angry", system: "💥 李老师被「分期」激怒了（信任-10 怀疑+15）" };
  }
  if (topic === "oversell") {
    var hard = (npcId === "teacher_li" || npcId === "xiao_ai" || npcId === "lao_zhou");
    applyVitals(npcId, { suspicion: 15, patience: -5 });
    line = pickLine(def, st, "oversell");
    emotion = "suspicious";
    if (hard && st.suspicion > 25 && !hasFlag(npcId, "oversell")) {
      setFlag(npcId, "oversell");
      system = "⚠ 你的吹牛被当场识破，TA 记住了（今天没得谈了）";
    }
    return { line: line, emotion: emotion, system: system };
  }
  if (topic === "priceQuote" && npcId === "frugal_uncle" && !st.askedPrice && !hasFlag(npcId, "price_first")) {
    setFlag(npcId, "price_first");
    applyVitals(npcId, { suspicion: 10 });
    return { line: "哎哎，我还没问价呢你先报上了？做买卖不是这么做的。（冷下脸）", emotion: "skeptical", system: "⚠ 抢着报价踩了雷（今天他不谈了）" };
  }
  if (topic === "askPrice" || topic === "priceQuote") st.askedPrice = 1;

  // 私事 / 披露账本
  for (t = 0; t < def.privateTopics.length; t++) {
    var tp = def.privateTopics[t];
    var hit = false;
    for (k = 0; k < tp.kw.length; k++) { if (text.indexOf(tp.kw[k]) !== -1) { hit = true; break; } }
    if (!hit) continue;
    var revealed = st.revealed.indexOf(t) !== -1;
    if (!revealed) {
      st.revealed.push(t);
      applyVitals(npcId, { suspicion: 10 });
      return { line: tp.revealLine, emotion: "neutral", system: "🤨 你说了 TA 没提过的事（怀疑 +10）——先听 TA 自己说" };
    }
    applyVitals(npcId, { trust: 6, interest: 8, suspicion: -3 });
    warm = true;
    if ((npcId === "sister_zhang" || npcId === "lao_zhou") && !hasFlag(npcId, "family")) {
      for (i = 0; i < def.conds.length; i++) if (def.conds[i].id === "mention_family" && !def.conds[i].negative) { setFlag(npcId, "family"); system = "💗 聊到 TA 的家人了（条件达成）"; }
    }
    if (npcId === "grandma_chen" && tp.kw.indexOf("豆豆") !== -1 && !hasFlag(npcId, "pet")) {
      setFlag(npcId, "pet");
      system = "💗 聊到豆豆了（条件达成）";
    }
    return { line: tp.line, emotion: "friendly", system: system };
  }

  switch (topic) {
    case "apology":
      if (npcId === "da_liu" && !hasFlag(npcId, "apology")) {
        setFlag(npcId, "apology");
        applyVitals(npcId, { trust: 12, suspicion: -5 });
        line = "……哼。你倒是实诚。这话我爱听，就冲这句，再听你说两句。";
        emotion = "friendly";
      } else { line = pickLine(def, st, "compliment"); applyVitals(npcId, { trust: 2 }); }
      break;
    case "laugh":
      applyVitals(npcId, { trust: 5, suspicion: -4 });
      line = pickLine(def, st, "laugh");
      emotion = "amused";
      warm = true;
      for (i = 0; i < def.conds.length; i++) {
        if (def.conds[i].id === "make_laugh" && !hasFlag(npcId, "laughed")) { setFlag(npcId, "laughed"); system = "😄 TA 被逗笑了（条件达成）"; }
      }
      break;
    case "honest":
      applyVitals(npcId, { trust: 8, suspicion: -5 });
      line = pickLine(def, st, "honest");
      emotion = "friendly";
      warm = true;
      break;
    case "family": case "pet": case "spouse":
      line = pickLine(def, st, "nonsense");
      applyVitals(npcId, { suspicion: 4 });
      break;
    case "product": {
      var mentioned = null;
      for (i = 0; i < PRODUCTS.length; i++) {
        var kws = PRODUCTS[i].kw;
        for (k = 0; k < kws.length; k++) if (text.indexOf(kws[k]) !== -1) mentioned = PRODUCTS[i];
      }
      // 兴趣节奏（离线版没有 LLM 的高频反馈，一次给足）：对症商品 +15，普通 +8
      var fav = mentioned && def.favorite.indexOf(mentioned.id) !== -1;
      applyVitals(npcId, { interest: fav ? 15 : 8, trust: 2 });
      line = pickLine(def, st, "product");
      emotion = "curious";
      break;
    }
    case "askPrice": case "priceQuote":
      applyVitals(npcId, { interest: 8 });
      line = pickLine(def, st, "price");
      emotion = "curious";
      break;
    case "compliment":
      st.compliments += 1;
      if (st.compliments >= 3) {
        applyVitals(npcId, { suspicion: 8, patience: -8 });
        line = "……你翻来覆去就这几句，一句正事没有。我看你就是推销的吧？";
        emotion = "annoyed";
      } else {
        applyVitals(npcId, { trust: 3, suspicion: 2 });
        line = pickLine(def, st, "compliment");
      }
      break;
    case "greet":
      applyVitals(npcId, { trust: 1 });
      line = pickLine(def, st, "greet");
      break;
    default:
      applyVitals(npcId, { patience: -8, suspicion: 3 });
      line = pickLine(def, st, "nonsense");
      emotion = "confused";
      if (st.patience <= 20) system = "😠 TA 快没耐心了——说点 TA 关心的";
  }
  if (warm) applyVitals(npcId, { suspicion: -3 });
  return { line: line, emotion: emotion, system: system };
}

var REJECT_LINES = {
  too_early: "门都没聊热乎就想成交？先聊两句。",
  too_soon: "刚成交一件就掏下一件？缓缓。",
  npc_refusing: "说了今天不谈这个，你先回吧。",
  condition_failed: "（把门掩上一半）你之前那话我还记着呢，今天先到这儿。",
  condition_not_met: "先别急，咱还没聊到那份上。",
  trust_low: "东西我瞅了一眼……可咱才聊几句啊，就让我掏钱，我心里不踏实。",
  suspicion_high: "（往后退了半步）你先别急着往我手里塞，我这心里正犯嘀咕呢。",
  interest_low: "（没伸手）这玩意儿……我用不上吧。",
  cannot_afford: "（苦笑）好东西是好东西，可我这个月真拿不出这个钱。",
  already_owned: "这我可买过了，家里正用着呢。"
};

/** 递合同裁决（与正式版同构的闸门顺序） */
function attemptSale(npcId, productId) {
  var def = npcDef(npcId);
  var st = S.npcs[npcId];
  var p = product(productId);
  if (!p || carriedIds().indexOf(productId) === -1) return { rejected: { reason: "already_owned" } };
  if (st.purchased.indexOf(productId) !== -1) return { rejected: { reason: "already_owned" } };
  if (st.turn < 2) return { rejected: { reason: "too_early" } };
  if (st.lastSaleTurn >= 0 && st.turn - st.lastSaleTurn < 2) return { rejected: { reason: "too_soon" } };
  if (st.turn - st.refusedAt < 3) {
    applyVitals(npcId, { patience: -10, suspicion: 8 });
    return { rejected: { reason: "npc_refusing" } };
  }
  var i, cond, count;
  for (i = 0; i < def.conds.length; i++) {
    cond = def.conds[i];
    count = st.flags[cond.flag] || 0;
    if (cond.negative) {
      if (count > 0) { applyVitals(npcId, { patience: -10, suspicion: 8 }); st.refusedAt = st.turn; return { rejected: { reason: "condition_failed" } }; }
    } else if (cond.count) {
      if (count < cond.count) { applyVitals(npcId, { patience: -10, suspicion: 8 }); st.refusedAt = st.turn; return { rejected: { reason: "condition_not_met" } }; }
    } else if (count === 0) {
      applyVitals(npcId, { patience: -10, suspicion: 8 });
      st.refusedAt = st.turn;
      return { rejected: { reason: "condition_not_met" }, hint: cond.action };
    }
  }
  if (st.trust < trustGate(def, st)) { applyVitals(npcId, { patience: -10, suspicion: 8 }); st.refusedAt = st.turn; return { rejected: { reason: "trust_low" } }; }
  if (st.suspicion >= 50) { applyVitals(npcId, { patience: -10, suspicion: 8 }); st.refusedAt = st.turn; return { rejected: { reason: "suspicion_high" } }; }
  if (st.interest < interestGate(p)) { applyVitals(npcId, { patience: -10, suspicion: 8 }); st.refusedAt = st.turn; return { rejected: { reason: "interest_low" } }; }
  if (def.budget < p.price) { applyVitals(npcId, { patience: -10, suspicion: 8 }); st.refusedAt = st.turn; return { rejected: { reason: "cannot_afford" } }; }

  var bonus = 0;
  var isTask = productId === S.task.productId && !S.taskDone;
  if (isTask) bonus = S.task.bonus;
  S.money += p.commission + bonus;
  def.budget -= p.price;
  st.purchased.push(productId);
  st.lastSaleTurn = st.turn;
  if (isTask) S.taskDone = true;
  S.todaySales.push({ npc: def.name, product: p.emoji + " " + p.name, gain: p.commission + bonus });
  return { settlement: { product: p, commission: p.commission, bonus: bonus }, line: pickLine(def, st, "deal") };
}

/** 实时攻略（与正式版同构） */
function getAdvice(npcId) {
  var def = npcDef(npcId);
  var st = S.npcs[npcId];
  var items = [];
  var i, cond, count;
  if (st.turn < 2) items.push({ ok: false, text: "先聊热乎再递合同（还差 " + (2 - st.turn) + " 句）" });
  if (st.turn - st.refusedAt < 3 && st.refusedAt >= 0) items.push({ ok: false, text: "TA 刚送过客——换个话题聊几句，过几回合再谈" });
  for (i = 0; i < def.conds.length; i++) {
    cond = def.conds[i];
    count = st.flags[cond.flag] || 0;
    if (cond.negative) {
      items.push(count > 0 ? { ok: false, text: "你踩了 TA 的雷——今天没得谈了，明天消气" } : { ok: true, text: "没踩雷（保持住）" });
    } else if (cond.count) {
      var left = cond.count - count;
      items.push(left <= 0 ? { ok: true, text: "TA 的心结你已经解开了" } : { ok: false, text: (cond.action || "").replace("{n}", String(left)) });
    } else {
      items.push(count > 0 ? { ok: true, text: "好感条件已达成" } : { ok: false, text: cond.action || "再聊聊 TA 在意的事" });
    }
  }
  var gate = trustGate(def, st);
  items.push(st.trust >= gate ? { ok: true, text: "信任 " + st.trust + "（门槛 " + gate + "）已过" } : { ok: false, text: "信任 " + st.trust + "/" + gate + "——还差 " + (gate - st.trust) + "：坦白身份、聊 TA 心坎里的话都涨" });
  items.push(st.suspicion < 50 ? { ok: true, text: "怀疑 " + st.suspicion + "/50 正常" } : { ok: false, text: "怀疑爆表——聊点 TA 开心的泄压，别再踩敏感话题" });

  var best = null;
  var ids = carriedIds();
  for (i = 0; i < ids.length; i++) {
    if (st.purchased.indexOf(ids[i]) !== -1) continue;
    var pp = product(ids[i]);
    if (def.budget < pp.price) continue;
    if (st.interest < interestGate(pp)) continue;
    best = pp; break;
  }
  var canClose = best !== null && items.every(function (x) { return x.ok; });
  if (!best) {
    for (i = 0; i < ids.length; i++) {
      if (st.purchased.indexOf(ids[i]) !== -1) continue;
      var pj = product(ids[i]);
      if (def.budget >= pj.price) { best = pj; break; }
    }
  }
  if (best) {
    if (canClose) items.push({ ok: true, text: "现在就能成交：" + best.emoji + " " + best.name + "（¥" + best.price + "）——去递合同！" });
    else if (st.interest < interestGate(best)) items.push({ ok: false, text: best.emoji + " " + best.name + " 需要兴趣 ≥" + interestGate(best) + "（现在 " + st.interest + "）——先把 TA 聊动心" });
  } else {
    items.push({ ok: false, text: "TA 已经把你背包里买得起的都买了——广撒网去敲别家的门" });
  }
  var recommend = best ? { id: best.id, name: best.name, emoji: best.emoji, price: best.price } : null;
  return { items: items, canCloseNow: canClose, recommend: recommend };
}
