import type { ConversationResult, GameStatePublic, NPCPublicView } from "@sellup/shared";
import {
  attemptSale,
  fetchConversationHistory,
  fetchGameState,
  fetchMeta,
  fetchAdvice,
  fetchNPC,
  resetConversation,
  sendPlayerMessage,
} from "@network/apiClient";

const REJECT_REASONS: Record<string, string> = {
  too_early: "门都没聊热乎就想成交？先聊两句",
  too_soon: "刚成交一件就接着掏货，先聊两句缓缓",
  trust_low: "TA 还不够信你",
  suspicion_high: "TA 的怀疑太高了",
  interest_low: "TA 对这个还没动心思",
  cannot_afford: "TA 买不起这个",
  already_owned: "TA 已经买过了",
  condition_not_met: "TA 还没被打动到那个点",
  condition_failed: "你踩了 TA 的雷，TA 今天不想谈了",
  npc_refusing: "TA 现在根本不想听你说话",
  unknown: "被拒绝了",
};

/** 场景表现层事件（TownScene 监听）：心情徽章 / 成交飘字 */
function emitVitals(npcId: string, mood: string): void {
  window.dispatchEvent(new CustomEvent("sellout:vitals", { detail: { npcId, mood } }));
}

function emitEarn(amount: number, bonus: number): void {
  window.dispatchEvent(new CustomEvent("sellout:earn", { detail: { amount, bonus } }));
}

const EMOTION_LABELS: Record<string, string> = {
  neutral: "平静",
  curious: "好奇",
  friendly: "友好",
  amused: "觉得有趣",
  skeptical: "怀疑",
  suspicious: "警惕",
  annoyed: "烦躁",
  embarrassed: "尴尬",
  excited: "兴奋",
  anxious: "焦虑",
  angry: "生气",
  confused: "困惑",
};

/**
 * PHASE 2：最小聊天界面（HTML/CSS overlay），支持全部 NPC。
 * 打开时拉取脱敏视图 + 服务端会话历史（含 NPC 开场白种子）。
 * Debug 条显示 NPC 心理数值（AGENTS.md §13，开发期保留）。
 */
export class ChatOverlay {
  private root: HTMLElement;
  private panel!: HTMLDivElement;
  private titleEl!: HTMLSpanElement;
  private messagesEl!: HTMLDivElement;
  private debugEl!: HTMLDivElement;
  private inputEl!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private open_ = false;
  private busy = false;
  private npcId: string | null = null;
  private npcName = "";
  /** 客户端侧记录：每个 NPC 已买过什么（过滤递合同列表；服务器仍是裁决权威） */
  private ownedLocal = new Map<string, Set<string>>();
  /** 当前 NPC 的攻略提示（📖 切换显示，默认隐藏） */
  private guideHints: string[] = [];
  private lastGlmOnline = false;
  private lastGate: number | undefined;

  constructor(rootId: string) {
    this.root = document.getElementById(rootId)!;
    this.buildDom();
  }

  isOpen(): boolean {
    return this.open_;
  }

  async open(npcId: string): Promise<void> {
    if (this.open_) return;
    this.open_ = true;
    this.npcId = npcId;
    this.messagesEl.innerHTML = "";
    this.panel.style.display = "flex";
    this.inputEl.focus();

    try {
      const [view, meta, conv] = await Promise.all([
        fetchNPC(npcId),
        fetchMeta(),
        fetchConversationHistory(npcId),
      ]);
      this.npcName = view.name;
      this.guideHints = view.strategyHints ?? [];
      this.setGuideVisible(false);
      this.titleEl.innerHTML = `${view.emoji} ${view.name} <span class="chat-sub">（${view.identity}）</span>`;

      this.appendSystem(`咚咚咚——你敲响了${view.name}家的门，门开了。`);

      if (conv.history.length === 0) {
        this.appendMessage("npc", view.hello[0] ?? "……");
      } else {
        for (const m of conv.history) {
          this.appendMessage(m.role === "player" ? "player" : "npc", m.text);
        }
      }
      this.lastGate = view.saleTrustGate;
      this.setDebugBar(view.vitals, !meta.glmOnline, view.saleTrustGate);
      this.lastGlmOnline = meta.glmOnline;
      emitVitals(npcId, view.vitals.mood);
    } catch (e) {
      this.appendSystem(`⚠ 无法连接游戏服务器：${(e as Error).message}`);
    }
  }

  close(): void {
    this.open_ = false;
    this.npcId = null;
    this.panel.style.display = "none";
  }

  /** 📖 攻略：切换当前 NPC 的引导小字（默认隐藏） */
  private toggleGuide(): void {
    const box = this.panel.querySelector(".chat-guide") as HTMLElement;
    this.setGuideVisible(box.style.display === "none");
  }

  private setGuideVisible(visible: boolean): void {
    const box = this.panel.querySelector(".chat-guide") as HTMLElement | null;
    if (!box) return;
    box.style.display = visible ? "block" : "none";
    this.panel.querySelector(".chat-guide-btn")?.classList.toggle("on", visible);
    if (visible) void this.refreshGuide();
  }

  /** 拉取实时攻略（成交闸门诊断 + 推荐主攻），失败退回静态提示 */
  private async refreshGuide(): Promise<void> {
    const box = this.panel.querySelector(".chat-guide") as HTMLElement | null;
    if (!box || !this.npcId) return;
    let body = "";
    try {
      const advice = await fetchAdvice(this.npcId);
      const lines = advice.items.map(
        (i) => `<div class="chat-guide-line">${i.ok ? "✅" : "⭕"} ${i.text}</div>`,
      );
      if (advice.canCloseNow) {
        lines.unshift(`<div class="chat-guide-now">🔥 现在就能成交——去点「🤝 递合同」！</div>`);
      }
      body = lines.join("");
    } catch {
      body = "";
    }
    const staticLines = this.guideHints.map((h) => `<div class="chat-guide-line">💡 ${h}</div>`).join("");
    box.innerHTML = body + (staticLines ? `<div class="chat-guide-static">${staticLines}</div>` : "");
  }

  private refreshGuideIfVisible(): void {
    const box = this.panel.querySelector(".chat-guide") as HTMLElement | null;
    if (box && box.style.display !== "none") void this.refreshGuide();
  }

  private buildDom(): void {
    this.panel = document.createElement("div");
    this.panel.className = "chat-panel";
    this.panel.style.display = "none";
    this.panel.innerHTML = `
      <div class="chat-header">
        <div class="chat-title"><span class="chat-name"></span></div>
        <div class="chat-header-btns">
          <button class="chat-btn chat-guide-btn" title="攻略提示">📖 攻略</button>
          <button class="chat-btn chat-reset" title="重置会话与NPC状态">重置</button>
          <button class="chat-btn chat-close" title="关闭">✕</button>
        </div>
      </div>
      <div class="chat-guide" style="display:none"></div>
      <div class="chat-debug"></div>
      <div class="chat-messages"></div>
      <div class="chat-sale-row" style="display:none">
        <select class="chat-sale-select"></select>
        <button class="chat-btn chat-sale-confirm">🤝 推这个</button>
        <button class="chat-btn chat-sale-cancel">取消</button>
      </div>
      <div class="chat-input-row">
        <button class="chat-btn chat-sale" title="对TA递合同推销商品">🤝 递合同</button>
        <input class="chat-input" type="text" maxlength="500" placeholder="说点什么……（回车发送）" />
        <button class="chat-btn chat-send">发送</button>
      </div>
    `;
    this.root.appendChild(this.panel);

    this.titleEl = this.panel.querySelector(".chat-name")!;
    this.messagesEl = this.panel.querySelector(".chat-messages")!;
    this.debugEl = this.panel.querySelector(".chat-debug")!;
    this.inputEl = this.panel.querySelector(".chat-input")!;
    this.sendBtn = this.panel.querySelector(".chat-send")!;

    this.panel.querySelector(".chat-close")!.addEventListener("click", () => this.close());
    this.panel.querySelector(".chat-reset")!.addEventListener("click", () => void this.onReset());
    this.sendBtn.addEventListener("click", () => void this.onSend());
    this.inputEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") void this.onSend();
    });
    this.panel.querySelector(".chat-guide-btn")!.addEventListener("click", () => this.toggleGuide());
    this.panel.querySelector(".chat-sale")!.addEventListener("click", () => void this.toggleSaleRow());
    this.panel.querySelector(".chat-sale-cancel")!.addEventListener("click", () => this.hideSaleRow());
    this.panel.querySelector(".chat-sale-confirm")!.addEventListener("click", () => void this.onConfirmSale());

    // 跨天收工时由 HUD 通知关闭（服务器已清空会话线程）
    window.addEventListener("sellout:close-chat", () => this.close());
  }

  /** 打开递合同行：拉取背包，过滤该 NPC 已买过的商品 */
  private async toggleSaleRow(): Promise<void> {
    const row = this.panel.querySelector(".chat-sale-row") as HTMLElement;
    if (row.style.display !== "none") {
      this.hideSaleRow();
      return;
    }
    if (!this.npcId) return;
    try {
      const [state, conv] = await Promise.all([fetchGameState(), fetchConversationHistory(this.npcId)]);
      // 服务端 debug 视图才有 purchased；客户端按会话推断不可靠，直接全部列出，由服务器裁决
      void conv;
      const owned = this.ownedLocal.get(this.npcId) ?? new Set<string>();
      const options = state.player.inventory
        .map((id) => state.products[id])
        .filter((p): p is NonNullable<typeof p> => !!p && !owned.has(p.id));
      const select = row.querySelector(".chat-sale-select") as HTMLSelectElement;
      select.innerHTML = options
        .map((p) => `<option value="${p.id}">${p.emoji} ${p.name}（¥${p.price}）</option>`)
        .join("");
      if (options.length === 0) {
        this.appendSystem("背包里没有能推给 TA 的商品了。");
        return;
      }
      row.style.display = "flex";
    } catch (e) {
      this.appendSystem(`⚠ ${(e as Error).message}`);
    }
  }

  private hideSaleRow(): void {
    (this.panel.querySelector(".chat-sale-row") as HTMLElement).style.display = "none";
  }

  private async onConfirmSale(): Promise<void> {
    if (!this.npcId) return;
    const select = this.panel.querySelector(".chat-sale-select") as HTMLSelectElement;
    const productId = select.value;
    if (!productId) return;
    this.hideSaleRow();
    this.setBusy(true);
    try {
      const result = await attemptSale(this.npcId, productId);
      this.setDebugBar(result.vitals, this.lastGlmOnline, this.lastGate);
      // NPC 对这次递合同的反应台词：服务器已按上下文裁决，LLM 演绎（不再是罐头）
      if (result.npcLine) {
        this.appendMessage("npc", result.npcLine.text, { emotion: result.npcLine.emotion });
      }
      if (result.settlement) {
        const p = result.settlement;
        const bonusTxt = p.bonus > 0 ? ` + 任务奖金 ¥${p.bonus}` : "";
        this.appendSystem(
          `🎉 成交！${p.emoji} ${p.productName}（¥${p.price}）→ 佣金 +¥${p.commission}${bonusTxt} ｜ 资产 ¥${p.money}`,
          "sale",
        );
        window.dispatchEvent(new CustomEvent("sellout:money", { detail: p.money }));
        emitEarn(p.commission + p.bonus, p.bonus);
        if (p.taskCompleted) window.dispatchEvent(new CustomEvent("sellout:task-done"));
        const owned = this.ownedLocal.get(this.npcId) ?? new Set<string>();
        owned.add(p.productId);
        this.ownedLocal.set(this.npcId, owned);
      } else {
        const reason = REJECT_REASONS[result.rejected?.reason ?? "unknown"] ?? "被拒绝了";
        this.appendSystem(`❌ ${this.npcName}没接——${reason}（耐心↓ 怀疑↑）`);
      }
      emitVitals(this.npcId, result.vitals.mood);
      this.refreshGuideIfVisible();
    } catch (e) {
      this.appendSystem(`⚠ ${(e as Error).message}`);
    } finally {
      this.setBusy(false);
      this.inputEl.focus();
    }
  }

  private setDebugBar(
    vitals: NPCPublicView["vitals"],
    fallback: boolean,
    gate?: number,
  ): void {
    const trustCell = gate
      ? `信任 <b>${vitals.trust}</b><span class="chat-gate">/${gate}</span>`
      : `信任 <b>${vitals.trust}</b>`;
    this.debugEl.innerHTML = `
      <span>${trustCell}</span>
      <span>兴趣 <b>${vitals.interest}</b></span>
      <span>怀疑 <b>${vitals.suspicion}</b><span class="chat-gate">/50</span></span>
      <span>耐心 <b>${vitals.patience}</b></span>
      <span>心情 <b>${EMOTION_LABELS[vitals.mood] ?? vitals.mood}</b></span>
      <span class="chat-mode ${fallback ? "offline" : "online"}">${
        fallback ? "离线降级" : "GLM 在线"
      }</span>
    `;
  }

  private async onSend(): Promise<void> {
    const text = this.inputEl.value.trim();
    if (!text || this.busy || !this.open_ || !this.npcId) return;

    this.inputEl.value = "";
    this.appendMessage("player", text);
    this.setBusy(true);

    try {
      const result: ConversationResult = await sendPlayerMessage(this.npcId, text);
      this.appendMessage("npc", result.reply.text, {
        emotion: result.reply.emotion,
        fallback: result.debug.fallback,
      });
      this.setDebugBar(result.vitals, result.debug.fallback, this.lastGate);
      emitVitals(this.npcId, result.vitals.mood);
      this.refreshGuideIfVisible();
      if (result.purchase) {
        const p = result.purchase;
        const bonusTxt = p.bonus > 0 ? ` + 任务奖金 ¥${p.bonus}` : "";
        this.appendSystem(
          `🎉 成交！${p.emoji} ${p.productName}（¥${p.price}）→ 佣金 +¥${p.commission}${bonusTxt} ｜ 资产 ¥${p.money}`,
          "sale",
        );
        window.dispatchEvent(new CustomEvent("sellout:money", { detail: p.money }));
        emitEarn(p.commission + p.bonus, p.bonus);
        if (p.taskCompleted) {
          window.dispatchEvent(new CustomEvent("sellout:task-done"));
        }
      } else if (result.effectsApplied.length > 0) {
        this.appendSystem(`（心理变化: ${result.effectsApplied.join(", ")}）`);
      }
    } catch (e) {
      this.appendSystem(`⚠ ${(e as Error).message}`);
    } finally {
      this.setBusy(false);
      this.inputEl.focus();
    }
  }

  private async onReset(): Promise<void> {
    if (!this.npcId) return;
    try {
      await resetConversation(this.npcId);
      this.messagesEl.innerHTML = "";
      this.ownedLocal.delete(this.npcId);
      this.appendSystem("会话与 NPC 状态已重置。");
      const [view, meta] = await Promise.all([fetchNPC(this.npcId), fetchMeta()]);
      this.lastGate = view.saleTrustGate;
      this.setDebugBar(view.vitals, !meta.glmOnline, view.saleTrustGate);
      emitVitals(this.npcId, view.vitals.mood);
      this.appendMessage("npc", view.hello[0] ?? "……");
    } catch (e) {
      this.appendSystem(`⚠ 重置失败：${(e as Error).message}`);
    }
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.sendBtn.disabled = busy;
    this.inputEl.disabled = busy;
    if (busy) {
      const typing = document.createElement("div");
      typing.className = "chat-msg npc typing";
      typing.textContent = `${this.npcName}正在想怎么说……`;
      this.messagesEl.appendChild(typing);
      this.scrollToBottom();
    } else {
      this.messagesEl.querySelector(".typing")?.remove();
    }
  }

  private appendMessage(
    role: "player" | "npc",
    text: string,
    opts?: { emotion?: string; fallback?: boolean },
  ): void {
    const div = document.createElement("div");
    div.className = `chat-msg ${role}`;
    if (role === "npc") {
      const emo = opts?.emotion ? EMOTION_LABELS[opts.emotion] ?? opts.emotion : "";
      const tag = opts?.fallback ? ' <span class="chat-fallback-tag">离线</span>' : "";
      div.innerHTML = `<span class="chat-emo">${emo}</span>${escapeHtml(text)}${tag}`;
    } else {
      div.textContent = text;
    }
    this.messagesEl.appendChild(div);
    this.scrollToBottom();
  }

  private appendSystem(text: string, kind?: "sale"): void {
    const div = document.createElement("div");
    div.className = kind ? `chat-msg system ${kind}` : "chat-msg system";
    div.textContent = text;
    this.messagesEl.appendChild(div);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
