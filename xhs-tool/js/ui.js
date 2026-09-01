/* 界面：街区 / 聊天 / HUD / 开始页 / 教程 / 日报 */
"use strict";

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function byId(id) { return document.getElementById(id); }

var currentNpc = null;

/* ---------- 街区 ---------- */

function renderStreet() {
  var layer = byId("npc-layer");
  layer.innerHTML = "";
  for (var i = 0; i < NPCS.length; i++) {
    (function (n) {
      var card = el("div", "npc-card");
      card.style.left = n.x + "%";
      var img = el("img", "npc-img");
      img.src = n.img;
      img.alt = n.name;
      var st = S.npcs[n.id];
      var mood = st.suspicion >= 50 ? "😠" : (st.trust >= 60 ? "😊" : (st.trust >= 40 ? "😐" : "🤨"));
      var moodEl = el("div", "npc-mood", mood);
      var dot = el("div", "npc-dot");
      dot.appendChild(moodEl);
      card.appendChild(img);
      card.appendChild(dot);
      card.appendChild(el("div", "npc-name", n.emoji + " " + n.name));
      card.addEventListener("click", function () { openChat(n.id); });
      layer.appendChild(card);
    })(NPCS[i]);
  }
}

/* ---------- HUD ---------- */

function renderHud() {
  var root = byId("hud-root");
  root.innerHTML = "";
  var bar = el("div", "hud-bar");
  bar.appendChild(el("span", "hud-chip", "☀️ 第 " + S.day + " 天"));
  bar.appendChild(el("span", "hud-chip gold", "💰 ¥" + S.money));
  var quota = kpiQuota(S.day);
  var earned = earnedToday();
  bar.appendChild(el("span", "hud-chip" + (earned >= quota ? " met" : ""), "📋 KPI ¥" + earned + "/¥" + quota));
  var bagBtn = el("button", "hud-btn", "🎒 货品包");
  bagBtn.addEventListener("click", toggleBag);
  var helpBtn = el("button", "hud-btn", "❓");
  helpBtn.addEventListener("click", function () { showTutorial(); });
  var endBtn = el("button", "hud-btn end", "🌙 收工");
  endBtn.addEventListener("click", endDay);
  bar.appendChild(bagBtn); bar.appendChild(helpBtn); bar.appendChild(endBtn);
  root.appendChild(bar);
}

function toggleBag() {
  var old = byId("bag-panel");
  if (old) { old.remove(); return; }
  var panel = el("div", "bag-panel");
  panel.id = "bag-panel";
  panel.appendChild(el("div", "bag-title", "今天公司发的货 · 特殊任务只有一件"));
  var tp = taskProduct();
  panel.appendChild(el("div", "bag-task" + (S.taskDone ? " done" : ""), S.taskDone ? "✅ 任务完成，奖金已入账" : "📋 特殊任务：清掉「" + tp.name + "」的库存（奖金 ¥" + S.task.bonus + "）"));
  for (var i = 0; i < PRODUCTS.length; i++) {
    var p = PRODUCTS[i];
    panel.appendChild(el("div", "bag-item", p.emoji + " " + p.name + "（¥" + p.price + " · 佣 ¥" + p.commission + "）· " + p.tag));
  }
  var close = el("button", "bag-close", "收起");
  close.addEventListener("click", function () { panel.remove(); });
  panel.appendChild(close);
  byId("overlay-root").appendChild(panel);
}

/* ---------- 聊天 ---------- */

function openChat(npcId) {
  currentNpc = npcId;
  var def = npcDef(npcId);
  var root = byId("chat-root");
  root.innerHTML = "";
  var panel = el("div", "chat-panel");
  var head = el("div", "chat-head");
  head.appendChild(el("div", "chat-title", def.emoji + " " + def.name + "（" + def.identity + "）"));
  var btns = el("div", "chat-btns");
  var guideBtn = el("button", "chat-mini guide", "📖 攻略");
  guideBtn.addEventListener("click", toggleGuide);
  var closeBtn = el("button", "chat-mini", "✕");
  closeBtn.addEventListener("click", closeChat);
  btns.appendChild(guideBtn); btns.appendChild(closeBtn);
  head.appendChild(btns);
  panel.appendChild(head);

  var guide = el("div", "chat-guide");
  guide.id = "chat-guide";
  guide.style.display = "none";
  panel.appendChild(guide);

  var msgs = el("div", "chat-msgs");
  msgs.id = "chat-msgs";
  panel.appendChild(msgs);

  var saleRow = el("div", "sale-row");
  saleRow.id = "sale-row";
  saleRow.style.display = "none";
  var select = el("select", "sale-select");
  select.id = "sale-select";
  var confirmSale = el("button", "chat-mini primary", "🤝 推这个");
  confirmSale.addEventListener("click", function () { doSale(select.value); });
  var cancelSale = el("button", "chat-mini", "取消");
  cancelSale.addEventListener("click", function () { saleRow.style.display = "none"; });
  saleRow.appendChild(select); saleRow.appendChild(confirmSale); saleRow.appendChild(cancelSale);
  panel.appendChild(saleRow);

  var inputRow = el("div", "input-row");
  var saleBtn = el("button", "chat-mini", "🤝 递合同");
  saleBtn.addEventListener("click", function () {
    if (saleRow.style.display === "flex") { saleRow.style.display = "none"; return; }
    select.innerHTML = "";
    var ids = carriedIds();
    var owned = S.npcs[currentNpc].purchased;
    var any = false;
    for (var i = 0; i < ids.length; i++) {
      if (owned.indexOf(ids[i]) !== -1) continue;
      var p = product(ids[i]);
      var opt = el("option");
      opt.value = p.id;
      opt.textContent = p.emoji + " " + p.name + "（¥" + p.price + "）";
      select.appendChild(opt);
      any = true;
    }
    if (!any) appendMsg("system", "背包里没有能推给 TA 的商品了。");
    else saleRow.style.display = "flex";
  });
  var input = el("input", "chat-input");
  input.maxLength = 200;
  input.placeholder = "说点什么……（回车发送）";
  input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") sendChat(input); });
  var sendBtn = el("button", "chat-mini primary", "发送");
  sendBtn.addEventListener("click", function () { sendChat(input); });
  inputRow.appendChild(saleBtn); inputRow.appendChild(input); inputRow.appendChild(sendBtn);
  panel.appendChild(inputRow);
  root.appendChild(panel);
  appendMsg("system", "咚咚咚——你敲响了" + def.name + "家的门，门开了。");
  appendMsg("npc", def.hello);
}

function closeChat() {
  currentNpc = null;
  byId("chat-root").innerHTML = "";
  renderStreet();
}

function appendMsg(role, text) {
  var box = byId("chat-msgs");
  if (!box) return;
  var div = el("div", "msg " + role, text);
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function sendChat(input) {
  var text = input.value.trim();
  if (!text || !currentNpc) return;
  input.value = "";
  appendMsg("player", text);
  var r = chatTurn(currentNpc, text);
  appendMsg("npc", r.line);
  if (r.system) appendMsg("system", r.system);
  renderStreet();
  refreshGuideIfVisible();
}

function doSale(productId) {
  var row = byId("sale-row");
  if (row) row.style.display = "none";
  if (!currentNpc || !productId) return;
  var r = attemptSale(currentNpc, productId);
  if (r.line) appendMsg("npc", r.line);
  if (r.settlement) {
    var s = r.settlement;
    var bonusTxt = s.bonus > 0 ? " + 奖金 ¥" + s.bonus : "";
    appendMsg("system", "🎉 成交！" + s.product.emoji + " " + s.product.name + "（¥" + s.product.price + "）→ 佣金 +¥" + s.commission + bonusTxt + " ｜ 资产 ¥" + S.money);
  } else if (r.rejected) {
    var reasonMap = { too_early: "门都没聊热乎", too_soon: "刚成交先缓缓", npc_refusing: "TA 正在气头上", condition_failed: "你踩了 TA 的雷", condition_not_met: "TA 心里还有个坎", trust_low: "TA 还不够信你", suspicion_high: "TA 的怀疑太高", interest_low: "TA 对这个还没动心思", cannot_afford: "TA 买不起", already_owned: "TA 已经买过了" };
    var text = "❌ " + (reasonMap[r.rejected.reason] || "被拒绝了") + "（耐心↓ 怀疑↑）";
    if (r.hint) text += " · 提示：" + r.hint;
    appendMsg("system", text);
  }
  renderHud();
  renderStreet();
  refreshGuideIfVisible();
  save();
}

/* ---------- 实时攻略 ---------- */

function toggleGuide() {
  var guide = byId("chat-guide");
  if (!guide) return;
  var visible = guide.style.display === "none";
  guide.style.display = visible ? "block" : "none";
  if (visible) fillGuide(guide);
}

function refreshGuideIfVisible() {
  var guide = byId("chat-guide");
  if (guide && guide.style.display !== "none") fillGuide(guide);
}

function fillGuide(guide) {
  if (!currentNpc) return;
  guide.innerHTML = "";
  var a = getAdvice(currentNpc);
  if (a.canCloseNow) guide.appendChild(el("div", "guide-now", "🔥 现在就能成交——去点「🤝 递合同」！"));
  for (var i = 0; i < a.items.length; i++) {
    var it = a.items[i];
    guide.appendChild(el("div", "guide-line", (it.ok ? "✅ " : "⭕ ") + it.text));
  }
  var def = npcDef(currentNpc);
  var stat = el("div", "guide-static");
  for (var h = 0; h < def.hints.length; h++) stat.appendChild(el("div", "guide-line", "💡 " + def.hints[h]));
  guide.appendChild(stat);
}

/* ---------- 覆盖层 ---------- */

function showStart() {
  var root = byId("overlay-root");
  root.innerHTML = "";
  var ov = el("div", "overlay start");
  var panel = el("div", "panel");
  panel.appendChild(el("div", "logo", "SELL OUT"));
  panel.appendChild(el("div", "cn", "成 交"));
  panel.appendChild(el("div", "sub", "荒诞销售喜剧 · 离线试玩版（NPC 由本地规则引擎扮演）"));
  var btns = el("div", "start-btns");
  var hasProgress = S.day > 1 || S.money > 0 || S.todaySales.length > 0;
  var cont = el("button", "primary", hasProgress ? "☀️ 继续游戏 · 第 " + S.day + " 天（¥" + S.money + "）" : "☀️ 开始游戏");
  var newBtn = el("button", "", hasProgress ? "🆕 新的开始（清空进度）" : "🔄 重置存档");
  var armed = false;
  newBtn.addEventListener("click", function () {
    if (!armed) { armed = true; newBtn.textContent = "⚠ 再点一次：清空全部进度？"; newBtn.classList.add("armed"); return; }
    S = freshState();
    save();
    showStart();
  });
  cont.addEventListener("click", function () {
    ov.remove();
    renderStreet();
    renderHud();
    showTutorial();
  });
  btns.appendChild(cont); btns.appendChild(newBtn);
  panel.appendChild(btns);
  panel.appendChild(el("div", "hint", "点居民敲门聊天 · 🤝 递合同成交 · 🌙 收工结算 KPI · 进度自动保存在本机"));
  ov.appendChild(panel);
  root.appendChild(ov);
}

var TUT = [
  ["💼 你的工作", ["把背包里的货卖出去赚佣金，每天有 KPI 入账目标（第 1 天 ¥50，之后每天 +¥25）。", "货分三档：便宜货走量、中价货是主力、贵货要先把人聊动心才卖得掉。"]],
  ["🚪 敲门", ["点街上的居民即可开门聊天。名牌是公开信息，叫称呼不会有问题。", "TA 心里有心事——先听 TA 自己说，你再接话。"]],
  ["💬 聊天就是销售", ["TA 亲口说过的事你再提，不起疑；TA 没说的私事你先提，怀疑暴涨。", "承认是推销、真诚、把人逗笑 → 信任涨；吹牛、套话、抢报价 → 怀疑涨。", "卡住了点右上角「📖 攻略」看实时诊断：差哪道闸、怎么补。"]],
  ["🤝 递合同", ["聊到位就递合同！五道闸：没买过 → 没踩雷 → 信任够 → 怀疑低 → 对货动心 → 买得起。", "被拒不致命：隔几回合 TA 会消气。同一人买得越多，门槛越高。"]],
  ["🌙 收工", ["收工看日报：KPI 评分（S/A/B/C/D）+ 街区新闻 + 明天的任务预告。", "每天的荒诞任务货不同，卖出有额外奖金；跨天保留资产与好感。"]]
];

function showTutorial() {
  var root = byId("overlay-root");
  var step = 0;
  var ov = el("div", "overlay");
  ov.id = "tutorial";
  var panel = el("div", "panel");
  function render() {
    panel.innerHTML = "";
    var s = TUT[step];
    panel.appendChild(el("div", "tut-head", s[0]));
    var body = el("div", "tut-body");
    for (var i = 0; i < s[1].length; i++) body.appendChild(el("div", "tut-line", "· " + s[1][i]));
    panel.appendChild(body);
    var dots = el("div", "dots");
    for (var d = 0; d < TUT.length; d++) dots.appendChild(el("span", "dot" + (d === step ? " on" : ""), ""));
    panel.appendChild(dots);
    var btns = el("div", "tut-btns");
    if (step > 0) {
      var prev = el("button", "", "上一步");
      prev.addEventListener("click", function () { step -= 1; render(); });
      btns.appendChild(prev);
    }
    var next = el("button", "primary", step === TUT.length - 1 ? "☀️ 开始营业" : "下一步 →");
    next.addEventListener("click", function () { if (step === TUT.length - 1) ov.remove(); else { step += 1; render(); } });
    btns.appendChild(next);
    if (step < TUT.length - 1) {
      var skip = el("button", "", "跳过");
      skip.addEventListener("click", function () { ov.remove(); });
      btns.appendChild(skip);
    }
    panel.appendChild(btns);
  }
  render();
  ov.appendChild(panel);
  root.appendChild(ov);
}

function endDay() {
  var earned = earnedToday();
  var quota = kpiQuota(S.day);
  var kpi = gradeKpi(earned, quota);
  var report = {
    day: S.day, sales: S.todaySales.slice(), earned: earned, money: S.money, kpi: kpi,
    news: NEWS[(S.day - 1) % NEWS.length],
    email: EMAILS[S.day % EMAILS.length]
  };
  S.day += 1;
  S.todaySales = [];
  S.taskDone = false;
  S.task = pickTask(S.day);
  for (var id in S.npcs) {
    var st = S.npcs[id];
    st.patience = 100;
    st.turn = 0;
    st.refusedAt = -9;
    st.lastSaleTurn = -9;
    st.askedPrice = 0;
    st.compliments = 0;
    delete st.flags.oversell;
    delete st.flags.price_first;
  }
  save();
  renderHud();
  renderStreet();

  var root = byId("overlay-root");
  var ov = el("div", "overlay");
  var panel = el("div", "panel");
  panel.appendChild(el("div", "report-head", "🌙 第 " + report.day + " 天 · 收工日报"));
  var body = el("div", "report-body");
  var sec1 = el("div", "sec");
  sec1.appendChild(el("div", "sec-title", "今日战报（" + report.sales.length + " 单 · 入账 ¥" + report.earned + "）"));
  if (report.sales.length === 0) sec1.appendChild(el("div", "empty", "今天一单没开——门都白敲了。公司不会知道的（会）。"));
  for (var i = 0; i < report.sales.length; i++) {
    var s = report.sales[i];
    sec1.appendChild(el("div", "sale-row2", s.npc + " ← " + s.product + "　＋¥" + s.gain));
  }
  sec1.appendChild(el("div", "money", "💰 总资产 ¥" + report.money));
  body.appendChild(sec1);
  var kpiSec = el("div", "sec kpi " + (kpi.met ? "met" : "missed"));
  kpiSec.appendChild(el("div", "score", kpi.score));
  var kmain = el("div", "kmain");
  kmain.appendChild(el("div", "ktitle", "今日 KPI " + (kpi.met ? "达标" : "未达标") + "（¥" + earned + " / ¥" + quota + "）"));
  kmain.appendChild(el("div", "knote", kpi.note));
  kpiSec.appendChild(kmain);
  body.appendChild(kpiSec);
  body.appendChild(el("div", "sec-title", "📺 今晚街区新闻"));
  body.appendChild(el("div", "news", report.news));
  body.appendChild(el("div", "sec-title", "📧 明早公司邮件 · " + report.email.from));
  var email = el("div", "email");
  email.appendChild(el("div", "email-subject", "【邮件】" + report.email.subject));
  email.appendChild(el("div", "email-body", report.email.body));
  email.appendChild(el("div", "email-kpi", "📌 " + report.email.kpi));
  body.appendChild(email);
  panel.appendChild(body);
  var foot = el("div", "report-foot");
  var btn = el("button", "primary", "☀️ 开始第 " + S.day + " 天");
  btn.addEventListener("click", function () { ov.remove(); });
  foot.appendChild(btn);
  panel.appendChild(foot);
  ov.appendChild(panel);
  root.appendChild(ov);
}

/* ---------- 启动 ---------- */

(function boot() {
  S = loadSave() || freshState();
  save();
  showStart();
})();
