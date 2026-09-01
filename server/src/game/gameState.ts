import type { GameStatePublic } from "@sellup/shared";
import type { NPCService } from "../npc/npcService";
import type { ProductCatalog } from "./productData";
import type { PlayerService } from "./playerService";
import type { DayService } from "./dayService";

/** 下发给客户端的游戏状态快照（NPC 已脱敏；商品无秘密，全量下发） */
export function getGameState(
  npcService: NPCService,
  catalog: ProductCatalog,
  playerService: PlayerService,
  dayService: DayService,
): GameStatePublic {
  const npcs: GameStatePublic["npcs"] = {};
  for (const view of npcService.listPublicViews()) {
    npcs[view.id] = view;
  }
  const player = {
    name: "新来的销售员",
    money: playerService.getMoney(),
    inventory: playerService.getInventory(),
  };
  return {
    day: dayService.currentDay,
    player,
    npcs,
    products: catalog.all,
    task: catalog.task,
    email: dayService.email(),
    kpi: dayService.kpiToday(),
  };
}
