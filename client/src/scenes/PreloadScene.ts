import Phaser from "phaser";

/**
 * 美术资源预加载。
 * 任一资产加载失败 → 该对象退回矩形占位（TownScene 内按 texture 是否存在判断），游戏不崩溃。
 * 这里只负责把存在的文件注册进 texture manager；loader 失败时该 key 不会注册 texture。
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("PreloadScene");
  }

  preload(): void {
    // 背景图（1920x1200 绘制，引擎内缩放显示）
    this.load.image("bg_street", "assets/bg_street.png");
    // 玩家 + 7 位 NPC（纹理键 npc_<id>，按服务端动态 id 取用）
    this.load.image("player", "assets/player.png");
    this.load.image("npc_frugal_uncle", "assets/npc_frugal_uncle.png");
    this.load.image("npc_teacher_li", "assets/npc_teacher_li.png");
    this.load.image("npc_sister_zhang", "assets/npc_sister_zhang.png");
    this.load.image("npc_grandma_chen", "assets/npc_grandma_chen.png");
    this.load.image("npc_lao_zhou", "assets/npc_lao_zhou.png");
    this.load.image("npc_da_liu", "assets/npc_da_liu.png");
    this.load.image("npc_xiao_ai", "assets/npc_xiao_ai.png");
  }

  create(): void {
    this.scene.start("TownScene");
  }
}
