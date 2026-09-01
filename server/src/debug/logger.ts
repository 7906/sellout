import fs from "node:fs";
import path from "node:path";
import type { ConversationMessage, NPCVitals } from "@sellup/shared";

/**
 * Debug 日志（AGENTS.md §13）：
 * 每个回合 / 每次递合同都落盘 JSONL，供复盘查看器（/log-viewer.html）回放。
 * 正式版再隐藏。
 * 路径惰性解析：测试脚本可以先 chdir 到临时目录，把测试日志和真实对局日志隔离开。
 */
function logPath(): string {
  return path.resolve(process.cwd(), "logs", "conversations.jsonl");
}

export interface TurnLogEntry {
  type: "turn";
  time: string;
  sessionId: string;
  npcId: string;
  turn: number;
  playerMessage: string;
  npcReply: string;
  emotion: string;
  intent: string;
  playerIntent: string;
  vitalsBefore: NPCVitals;
  vitalsAfter: NPCVitals;
  effectsApplied: string[];
  purchase?: string;
  moneyAfter: number;
  raw: string | null;
  fallback: boolean;
  error: string | null;
  latencyMs: number;
  /** 本回合 LLM 申报并采信的披露 id（SALES_DESIGN A9） */
  revealed?: string[];
  /** 本回合记账/变动的条件 flag（count 型带次数） */
  conditionFlags?: string[];
  /** 本回合是否因「接自己说过的话」丢弃了怀疑效果 */
  suspicionSuppressed?: boolean;
  /** 本回合是否触发 noInstall 关键词激怒 */
  installRage?: boolean;
}

export interface SaleLogEntry {
  type: "sale";
  time: string;
  sessionId: string;
  npcId: string;
  productName: string;
  productId: string;
  passed: boolean;
  reason?: string;
  vitalsBefore: NPCVitals;
  vitalsAfter: NPCVitals;
  effectsApplied: string[];
  commission?: number;
  bonus?: number;
  moneyAfter?: number;
}

export interface DayLogEntry {
  type: "day";
  time: string;
  /** 刚收工的是第几天 */
  day: number;
  earned: number;
  salesCount: number;
  moneyAfter: number;
  /** KPI 评分（未达标带标记） */
  kpi?: string;
}

export type LogEntry = TurnLogEntry | SaleLogEntry | DayLogEntry;

function append(entry: LogEntry): void {
  try {
    const file = logPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
  } catch (e) {
    console.warn("[debug] 写日志失败:", e);
  }
}

export function logTurn(entry: TurnLogEntry): void {
  append(entry);
  console.log(
    `[turn] ${entry.sessionId} #${entry.turn} ` +
      `t=${entry.vitalsAfter.trust} s=${entry.vitalsAfter.suspicion} ` +
      `${entry.latencyMs}ms` +
      (entry.purchase ? ` 💰${entry.purchase}` : "") +
      (entry.error ? ` error=${entry.error}` : ""),
  );
}

export function logSaleAttempt(entry: SaleLogEntry): void {
  append(entry);
  console.log(
    `[sale] ${entry.sessionId} ${entry.productId} → ` +
      (entry.passed ? `成交 +¥${(entry.commission ?? 0) + (entry.bonus ?? 0)}` : `拒(${entry.reason})`),
  );
}

export function logDay(entry: DayLogEntry): void {
  append(entry);
  console.log(
    `[day] 第${entry.day}天收工: ${entry.salesCount} 单 / +¥${entry.earned} / 资产 ¥${entry.moneyAfter}`,
  );
}

/** 读取全部日志（容错：文件不存在或行损坏） */
export function readLogEntries(): LogEntry[] {
  try {
    const file = logPath();
    if (!fs.existsSync(file)) return [];
    const out: LogEntry[] = [];
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        out.push(JSON.parse(trimmed) as LogEntry);
      } catch {
        // 跳过损坏行
      }
    }
    return out;
  } catch (e) {
    console.warn("[debug] 读日志失败:", e);
    return [];
  }
}
