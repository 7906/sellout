import Phaser from "phaser";
import { PreloadScene } from "./scenes/PreloadScene";
import { TownScene } from "./scenes/TownScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 600,
  backgroundColor: "#7EC8C8",
  scene: [PreloadScene, TownScene],
  // 手机适配：等比缩放适配任意屏幕并居中（输入坐标由 Scale Manager 自动换算）
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// 调试钩子（AGENTS.md §13）：控制台可读写场景与游戏实例
(window as any).__game = game;
