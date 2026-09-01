import type { GameStatePublic } from "@sellup/shared";
import { endDay, fetchGameState } from "@network/apiClient";
import { ReportOverlay } from "./ReportOverlay";

/**
 * 游戏 HUD：天数 + 金钱 + 货品包面板 + 公司邮件 + 收工。
 * 玩家必须随时知道自己在卖什么（商品名/价格/定位/真实功能供参考）。
 * 数值来自 Server 权威状态（ARCHITECTURE.md §3）。
 */
export class HudOverlay {
  private root: HTMLElement;
  private moneyEl!: HTMLSpanElement;
  private dayEl!: HTMLSpanElement;
  private kpiEl!: HTMLSpanElement;
  private panel!: HTMLDivElement;
  private listEl!: HTMLDivElement;
  private open_ = false;
  private taskDone = false;
  private state: GameStatePublic | null = null;
  private ending = false;
  private report: ReportOverlay;
  /** KPI 本地跟踪：入账只在成交时变化，金额事件带总量，用差值累加 */
  private kpiEarned = 0;
  private kpiQuota = 0;
  private lastMoney = 0;

  constructor(rootId: string, report: ReportOverlay) {
    this.report = report;
    this.root = document.getElementById(rootId)!;
    this.buildDom();
    void this.load();
  }

  private buildDom(): void {
    const bar = document.createElement("div");
    bar.className = "hud-bar";
    bar.innerHTML = `
      <span class="hud-day">☀️ 第 <b>1</b> 天</span>
      <span class="hud-money">💰 <b>0</b></span>
      <span class="hud-kpi" title="今日 KPI：入账目标，收工结算评分">📋 KPI <b>¥0</b>/<i>¥0</i></span>
      <button class="chat-btn hud-mail" title="今天的公司邮件">📧</button>
      <button class="chat-btn hud-help" title="游戏玩法说明">❓</button>
      <button class="chat-btn hud-bag" title="查看今天要卖的货">🎒 货品包</button>
      <button class="chat-btn hud-endday" title="收工：看今日战报，进入新的一天">🌙 收工</button>
    `;
    this.root.appendChild(bar);
    this.dayEl = bar.querySelector(".hud-day b")!;
    this.moneyEl = bar.querySelector(".hud-money b")!;
    this.kpiEl = bar.querySelector(".hud-kpi")!;

    this.panel = document.createElement("div");
    this.panel.className = "hud-bag-panel";
    this.panel.style.display = "none";
    this.panel.innerHTML = `
      <div class="hud-bag-title">今天公司发的货 · 特殊任务是硬指标</div>
      <div class="hud-bag-list"></div>
    `;
    this.root.appendChild(this.panel);
    this.listEl = this.panel.querySelector(".hud-bag-list")!;

    bar.querySelector(".hud-bag")!.addEventListener("click", () => this.toggle());
    bar.querySelector(".hud-mail")!.addEventListener("click", () => {
      if (this.state) this.report.showEmail(this.state.email, this.state.day);
    });
    bar.querySelector(".hud-help")!.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("sellout:show-tutorial"));
    });
    bar.querySelector(".hud-endday")!.addEventListener("click", () => void this.finishDay());

    // 成交结算由 Server 推送，这里只同步显示
    window.addEventListener("sellout:money", ((ev: CustomEvent<number>) => {
      const delta = ev.detail - this.lastMoney;
      this.lastMoney = ev.detail;
      this.kpiEarned = Math.max(0, this.kpiEarned + delta);
      this.moneyEl.textContent = `¥${ev.detail}`;
      this.renderKpi();
      // 金额脉冲：跳动一下提示入账/变动
      const chip = this.moneyEl.closest(".hud-money") as HTMLElement;
      chip.classList.remove("bump");
      void chip.offsetWidth; // 重置动画
      chip.classList.add("bump");
    }) as EventListener);
    window.addEventListener("sellout:task-done", () => {
      this.taskDone = true;
      if (this.state) {
        this.state.task = { ...this.state.task };
        this.renderProducts();
      }
    });
  }

  private async load(): Promise<void> {
    try {
      this.state = await fetchGameState();
      this.moneyEl.textContent = `¥${this.state.player.money}`;
      this.lastMoney = this.state.player.money;
      this.dayEl.textContent = String(this.state.day);
      this.kpiEarned = this.state.kpi.earned;
      this.kpiQuota = this.state.kpi.quota;
      this.renderKpi();
      this.renderProducts();
      // 通知场景：标题更新天数 + 跨天 splash（首次进入也当作「新的一天」开场）
      window.dispatchEvent(new CustomEvent("sellout:day-start", { detail: this.state.day }));
    } catch {
      this.moneyEl.textContent = "—";
    }
  }

  private renderKpi(): void {
    const b = this.kpiEl.querySelector("b")!;
    const i = this.kpiEl.querySelector("i")!;
    b.textContent = `¥${this.kpiEarned}`;
    i.textContent = `¥${this.kpiQuota}`;
    this.kpiEl.classList.toggle("met", this.kpiQuota > 0 && this.kpiEarned >= this.kpiQuota);
  }

  /** 🌙 收工：服务器出日报并推进天数；确认后刷新本 HUD（新任务/天数） */
  private async finishDay(): Promise<void> {
    if (this.ending || !this.state) return;
    this.ending = true;
    try {
      window.dispatchEvent(new CustomEvent("sellout:close-chat"));
      const report = await endDay();
      this.report.showReport(report, () => {
        this.taskDone = false;
        this.open_ = false;
        this.panel.style.display = "none";
        void this.load();
      });
    } catch (e) {
      alert(`收工失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.ending = false;
    }
  }

  private renderProducts(): void {
    if (!this.state) return;
    const task = this.state.task;
    const taskProduct = this.state.products[task.productId];
    const carried = this.state.player.inventory
      .map((id) => this.state!.products[id])
      .filter((p): p is NonNullable<typeof p> => !!p && p.tier === "normal");

    const productCard = (p: NonNullable<typeof taskProduct>) => `
      <div class="hud-product">
        <div class="hud-product-head">
          <span class="hud-product-emoji">${p.emoji}</span>
          <span class="hud-product-name">${p.name}</span>
          <span class="hud-product-price">¥${p.price}</span>
        </div>
        <div class="hud-product-tagline">「${p.tagline}」</div>
        <div class="hud-product-claims">${p.claims.map((c) => `<div>· ${c}</div>`).join("")}</div>
      </div>`;

    this.listEl.innerHTML = `
      <div class="hud-task ${this.taskDone ? "hud-task-done" : ""}">
        <div class="hud-task-title">${this.taskDone ? "✅" : "📋"} ${task.title}</div>
        <div class="hud-task-desc">${this.taskDone ? "任务完成，奖金已入账。" : task.desc}</div>
      </div>
      ${taskProduct && !this.taskDone ? `<div class="hud-section">特殊任务货（今天必须背着）</div>${productCard(taskProduct)}` : ""}
      <div class="hud-section">常规货品</div>
      ${carried.map(productCard).join("")}
    `;
  }

  private toggle(): void {
    this.open_ = !this.open_;
    this.panel.style.display = this.open_ ? "block" : "none";
  }
}
