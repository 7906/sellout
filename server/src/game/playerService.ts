import type { ProductCatalog } from "./productData";

/**
 * 玩家账户（Server Authority，ARCHITECTURE.md §3）：
 * 金钱与背包只能由成交结算改动。
 */
export class PlayerService {
  private money = 0;
  private inventory: string[];

  constructor(catalog: ProductCatalog) {
    this.inventory = catalog.inventoryIds();
  }

  getMoney(): number {
    return this.money;
  }

  addMoney(amount: number): void {
    this.money += amount;
  }

  getInventory(): string[] {
    return [...this.inventory];
  }

  /** 卖出的货从背包里移除（交给客户了） */
  removeProduct(id: string): void {
    this.inventory = this.inventory.filter((p) => p !== id);
  }

  /** 从存档恢复（金钱与背包） */
  restore(money: number, inventory: string[]): void {
    this.money = money;
    this.inventory = inventory;
  }

  /** 新的一天：公司收走旧任务货、压下来新任务货，常规货永远是全的 */
  resetDaily(catalog: ProductCatalog): void {
    this.inventory = catalog.inventoryIds();
  }

  /**
   * 常规货补齐（存档迁移）：目录更新后（增删常规商品）老存档的背包自动跟上，
   * 不用重开档。只增不删——玩家手里已有的东西不回收。
   */
  ensureNormals(catalog: ProductCatalog): void {
    for (const id of Object.keys(catalog.normal)) {
      if (!this.inventory.includes(id)) this.inventory.push(id);
    }
  }

  /** 新游戏：资产清零、背包重发 */
  reset(catalog: ProductCatalog): void {
    this.money = 0;
    this.inventory = catalog.inventoryIds();
  }
}
