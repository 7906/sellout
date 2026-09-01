import type { CompanyEmail, DailyReport } from "@sellup/shared";

/**
 * 收工日报面板（PHASE 17/18）：
 * 今日战报（每单明细 + 入账）→ 街区新闻 → 明早公司邮件 → ☀️ 开始新的一天。
 * 也复用为「今日公司邮件」查看器（📧 按钮）。
 */
export class ReportOverlay {
  private root: HTMLElement;
  private panel: HTMLDivElement;

  constructor(rootId: string) {
    this.root = document.getElementById(rootId)!;
    this.panel = document.createElement("div");
    this.panel.className = "report-overlay";
    this.panel.style.display = "none";
    this.root.appendChild(this.panel);
  }

  /** 收工日报：战报 + 新闻 + 明早邮件，确认后触发跨天回调 */
  showReport(report: DailyReport, onNewDay: () => void): void {
    const rows = report.sales.length
      ? report.sales
          .map(
            (s) => `
        <div class="report-sale">
          <span class="report-sale-who">${s.npcName}</span>
          <span class="report-sale-what">${s.emoji} ${s.productName}</span>
          <span class="report-sale-get">+¥${s.commission}${s.bonus ? ` <em>+奖金¥${s.bonus}</em>` : ""}</span>
        </div>`,
          )
          .join("")
      : `<div class="report-empty">今天一单没开——门都白敲了。公司不会知道的（会）。</div>`;

    this.panel.innerHTML = `
      <div class="report-panel">
        <div class="report-header">🌙 第 ${report.day} 天 · 收工日报</div>
        <div class="report-body">
          <div class="report-section">
            <div class="report-section-title">今日战报（${report.sales.length} 单 · 入账 ¥${report.earned}）</div>
            ${rows}
            <div class="report-money">💰 总资产 <b>¥${report.money}</b></div>
          </div>
          <div class="report-section report-kpi ${report.kpi.met ? "met" : "missed"}">
            <div class="report-kpi-score">${report.kpi.score}</div>
            <div class="report-kpi-main">
              <div class="report-kpi-title">今日 KPI ${report.kpi.met ? "达标" : "未达标"}（¥${report.kpi.earned} / ¥${report.kpi.quota}）</div>
              <div class="report-kpi-note">${report.kpi.note}</div>
            </div>
          </div>
          <div class="report-section">
            <div class="report-section-title">📺 今晚街区新闻</div>
            <div class="report-news">${report.news}</div>
          </div>
          ${ReportOverlay.emailHtml(report.email, "收件箱 · 明早 8:00 自动送达")}
        </div>
        <div class="report-footer">
          <button class="report-confirm">☀️ 开始第 ${report.nextDay} 天</button>
        </div>
      </div>`;

    this.panel.style.display = "flex";
    this.panel.querySelector(".report-confirm")!.addEventListener("click", () => {
      this.hide();
      onNewDay();
    });
  }

  /** 只看今天的公司邮件 */
  showEmail(email: CompanyEmail, day: number): void {
    this.panel.innerHTML = `
      <div class="report-panel">
        <div class="report-header">📧 第 ${day} 天 · 今早公司邮件</div>
        <div class="report-body">${ReportOverlay.emailHtml(email, "远大前程贸易有限公司 · 内部系统")}</div>
        <div class="report-footer">
          <button class="report-confirm">返 回</button>
        </div>
      </div>`;
    this.panel.style.display = "flex";
    this.panel.querySelector(".report-confirm")!.addEventListener("click", () => this.hide());
  }

  private static emailHtml(email: CompanyEmail, meta: string): string {
    return `
      <div class="report-section report-email">
        <div class="report-email-meta">${meta} · 来自：${email.from}</div>
        <div class="report-email-subject">【邮件】${email.subject}</div>
        <div class="report-email-body">${email.body}</div>
        <div class="report-email-kpi">📌 ${email.kpi}</div>
      </div>`;
  }

  private hide(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }
}
