import type { CompanyEmail, DailyReport, DailySaleRecord, KpiResult } from "@sellup/shared";
import { eveningNews, morningEmail } from "./companyFeed";
import type { ProductCatalog } from "./productData";
import type { PlayerService } from "./playerService";
import type { Persistence } from "./persistence";
import { logDay } from "../debug/logger";
import type { NPCService } from "../npc/npcService";

/** 每日 KPI 定额（渐进难度）：第 1 天 ¥50（一单中小生意即可达标），之后每天 +¥25 */
export function kpiQuotaFor(day: number): number {
  return 50 + (day - 1) * 25;
}

/** 按入账/KPI 完成度评分（喜剧化评语随档位） */
export function gradeKpi(earned: number, quota: number): KpiResult {
  const ratio = quota > 0 ? earned / quota : 0;
  const met = earned >= quota;
  let score: KpiResult["score"];
  let note: string;
  if (earned <= 0) {
    score = "D";
    note = "保安记住了你的脸。";
  } else if (ratio >= 2) {
    score = "S";
    note = "公司为你单开了一个部门（暂时只有你一个人）。";
  } else if (ratio >= 1) {
    score = "A";
    note = "主管把你的照片挂上了荣誉墙（用的是入职模板照）。";
  } else if (ratio >= 0.6) {
    score = "B";
    note = "公司表示理解，但不表示满意。";
  } else {
    score = "C";
    note = "你收到了一封没有骂人的邮件（这更可怕了）。";
  }
  return { quota, earned, met, score, note };
}

/**
 * 日循环（IMPLEMENTATION_PLAN PHASE 17 / GAME_DESIGN §16「时间：一天」）：
 * 白天卖货 → 收工出日报 → 天数推进 → 公司发新任务 → NPC 心态过夜回落。
 *
 * 跨天只重置「今天」的东西：特殊任务重摇、背包换新任务货、耐心回满、心情归零。
 * 信任/怀疑/兴趣与购买记录是跨天的（PHASE 12 记忆），卖过你的人不会一夜失忆。
 */
export class DayService {
  private day = 1;
  private todaySales: DailySaleRecord[] = [];

  constructor(
    private readonly catalog: ProductCatalog,
    private readonly player: PlayerService,
    private readonly npcService: NPCService,
    private readonly persistence: Persistence,
  ) {}

  get currentDay(): number {
    return this.day;
  }

  get sales(): readonly DailySaleRecord[] {
    return this.todaySales;
  }

  /** 今早公司邮件（喜剧层，同一天确定生成） */
  email(): CompanyEmail {
    return morningEmail(this.day);
  }

  earnedToday(): number {
    return this.todaySales.reduce((sum, s) => sum + s.commission + s.bonus, 0);
  }

  /** 今日 KPI 进度（下发 HUD） */
  kpiToday(): { quota: number; earned: number } {
    return { quota: kpiQuotaFor(this.day), earned: this.earnedToday() };
  }

  /** 成交结算调用：记入今日战报 */
  recordSale(record: DailySaleRecord): void {
    this.todaySales.push(record);
  }

  /** 从存档恢复（天数 + 今日成交记录） */
  restore(day: number, sales: DailySaleRecord[]): void {
    if (Number.isInteger(day) && day >= 1) this.day = day;
    this.todaySales = Array.isArray(sales) ? sales : [];
  }

  /** 新游戏：回到第 1 天，今日战报清空（任务由 catalog.rollNewDay 重摇） */
  reset(): void {
    this.day = 1;
    this.todaySales = [];
  }

  /** 收工：出日报 → 推进到新的一天 → 重摇任务/换背包/NPC 过夜 */
  endDay(): DailyReport {
    const kpi = gradeKpi(this.earnedToday(), kpiQuotaFor(this.day));
    const report: DailyReport = {
      day: this.day,
      nextDay: this.day + 1,
      sales: [...this.todaySales],
      earned: this.earnedToday(),
      money: this.player.getMoney(),
      kpi,
      news: eveningNews(this.day),
      email: morningEmail(this.day + 1),
    };
    logDay({
      type: "day",
      time: new Date().toISOString(),
      day: report.day,
      earned: report.earned,
      salesCount: report.sales.length,
      moneyAfter: report.money,
      kpi: report.kpi.met ? report.kpi.score : `未达(${report.kpi.score})`,
    });

    this.day += 1;
    this.todaySales = [];
    this.catalog.rollNewDay();
    this.player.resetDaily(this.catalog);
    this.npcService.resetDaily();
    // 跨天改了天数/任务/背包，必须立刻可落盘（否则重启会回到昨天）
    this.persistence.markDirty();
    this.persistence.flush();
    return report;
  }
}
