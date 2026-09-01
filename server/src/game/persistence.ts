import fs from "node:fs";
import path from "node:path";
import type {
  ConditionFlag,
  DailySaleRecord,
  NPCBudget,
  NPCVitals,
  PurchasedItem,
} from "@sellup/shared";

/** 同步 sleep（存档冲刷在请求路径上，不能引入异步） */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 最小存档（JSON 落盘，SQLite 在 Phase 12/16 再升级）：
 * 保住「重启不清进度」的最关键状态——玩家资产、背包、任务完成标记、
 * 每个 NPC 的心理数值与购买记录。
 * 写入为原子操作（临时文件 + 改名），脏标记 + 定时冲刷 + 退出冲刷。
 */
export interface SaveData {
  version: 3;
  savedAt: string;
  money: number;
  inventory: string[];
  taskCompleted: boolean;
  /** 当前天数（v1 存档缺省为 1） */
  day?: number;
  /** 今天的特殊任务（v1 存档缺省重摇）；不落盘的话重启会换任务 */
  task?: { productId: string; bonus: number };
  /** 今天的成交记录（收工日报用，重启不丢） */
  todaySales?: DailySaleRecord[];
  npcs: Record<
    string,
    {
      vitals: NPCVitals;
      purchased: PurchasedItem[];
      budget: NPCBudget;
      /** v3 起记录成交条件账本（v1/v2 旧档缺省为空） */
      conditionFlags?: Record<string, ConditionFlag>;
    }
  >;
}

export class Persistence {
  private dirty = false;
  private collect: (() => SaveData) | null = null;

  constructor(private readonly file: string) {}

  /** 绑定快照收集函数（服务全部就绪后调用） */
  bind(collect: () => SaveData): void {
    this.collect = collect;
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** 读取存档；文件不存在或损坏返回 null。v1 旧档也认（缺的字段由恢复方补默认值） */
  read(): SaveData | null {
    try {
      if (!fs.existsSync(this.file)) return null;
      const raw = fs.readFileSync(this.file, "utf8");
      const data = JSON.parse(raw) as SaveData;
      const version = (data as { version?: number }).version;
      if (version !== 1 && version !== 2 && version !== 3) return null;
      return data;
    } catch (e) {
      console.warn("[存档] 读取失败（将忽略旧档）:", e);
      return null;
    }
  }

  /** 脏时写盘；force=true 无视脏标记。原子写入防写坏。 */
  flush(force = false): void {
    if (!this.collect || (!this.dirty && !force)) return;
    try {
      const data = this.collect();
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
      this.replaceFile(tmp, this.file);
      this.dirty = false;
    } catch (e) {
      console.warn("[存档] 写入失败:", e);
    }
  }

  /**
   * Windows 下 rename 覆盖已存在文件可能撞上 EPERM（杀软扫描/句柄未释放），
   * 重试几次；仍失败退化为「复制 + 删临时文件」，保证存档始终落得下去。
   */
  private replaceFile(from: string, to: string): void {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.renameSync(from, to);
        return;
      } catch {
        sleepSync(50 * (attempt + 1));
      }
    }
    fs.copyFileSync(from, to);
    try {
      fs.unlinkSync(from);
    } catch {
      /* 临时文件删不掉只留垃圾，不影响存档 */
    }
  }
}
