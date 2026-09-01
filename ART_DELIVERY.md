# SELL OUT / 成交 — 美术升级交付说明

> 依据 [ART_BRIEF.md](ART_BRIEF.md) 执行。本文档为最终交付记录：文件清单、资产对照、验收结果。
> 主体工作 + 本轮收尾核对均已完成，全部验收项通过。

---

## 1. 资产交付（`client/public/assets/`，均为 @2x 透明 PNG）

| 文件 | 尺寸(px) | 显示尺寸 | 来源/处理 |
| --- | --- | --- | --- |
| `bg_street.png` | 1920×1200 | 960×600 | Seedream 生成 → 水印修补（PIL 位移插值）→ 公交站牌程序重绘（微软雅黑竖排）→ LANCZOS 缩放 |
| `npc_frugal_uncle.png` | 256×384 | 64×96 | 钱大叔：灰白短发/旧夹克/茶缸 |
| `npc_teacher_li.png` | 256×384 | 64×96 | 李老师：烫发细框眼镜/开衫/教案 |
| `npc_sister_zhang.png` | 256×384 | 64×96 | 张姐：围裙居家服/欲言又止 |
| `npc_grandma_chen.png` | 256×384 | 64×96 | 陈奶奶：白发髻蓝布衫/拐杖/脚边泰迪豆豆 |
| `npc_lao_zhou.png` | 256×384 | 64×96 | 老周：旧西装松领带/讨好的笑 |
| `npc_da_liu.png` | 256×384 | 64×96 | 大刘：格子衫/黑眼圈/抱臂黑脸 |
| `npc_xiao_ai.png` | 256×384 | 64×96 | 小艾：连帽卫衣/墨镜/举手机录音 |
| `player.png` | 256×384 | 56×84 | 玩家：白衬衫工牌/样品双肩包 |

- 角色处理管线：白底转透明（scipy 泛洪，保留内部白色）→ 自动裁切 → 底对齐缩放。
- 质检：全部经识别模型评审通过（统一粗深棕描边/Q版头身比/高饱和暖色）；老周、小艾、李老师、张姐、大刘各返工 1 轮（年龄感/女性特征/截腿问题）。
- 文件布局为本轮收尾时按需求书 §3 字面对齐：由 `assets/npc/<id>.png` 平铺为 `assets/npc_<id>.png`、`assets/player.png`（纹理键 `npc_<id>` 不变）。

## 2. 代码改动（仅需求书 §4 允许范围）

| 文件 | 改动 |
| --- | --- |
| `client/src/scenes/PreloadScene.ts` | **新增**。预加载全部 9 个资产；loader 失败不注册 texture（回退依据）。本轮同步平铺后路径 |
| `client/src/scenes/TownScene.ts` | 背景图接入（`textures.exists("bg_street")` 判断，失败回退矩形街道含店铺）；玩家/NPC 换 sprite（`setDisplaySize`，未知 id 回退彩色矩形）；悬停反馈 sprite tint / 矩形描边；名字与标题加描边；底部提示更新 |
| `client/src/main.ts` | scene 数组头部加 PreloadScene；背景色 #7EC8C8 |
| `client/src/styles/overlay.css` | CSS 变量化配色（描边 #2E2620 / 点缀红 #D9534F / 米黄纸色 #F5EFDC），DOM 结构未动 |

**未触碰**：`server/`、`shared/`、API 契约、画布尺寸、游戏逻辑（移动/成交/数值/聊天/递合同/HUD 功能）——与需求书 §5 硬性约束一致。`log-viewer.html` 未改动（深灰配色天然协调）。

## 3. 验收结果（ART_BRIEF §6 逐项）

| 项 | 结果 |
| --- | --- |
| typecheck 0 错误 / client build 通过 | ✅（build 的 chunk>500kB 警告非失败） |
| 背景与 5 招牌显示、文字可读 | ✅ 咖啡店/便利店/裁缝铺/公园入口/公交站逐牌核字通过 |
| 7 NPC sprite 一一对应、名字可读 | ✅ 形象与人设对照见 §1 |
| 点击 NPC 开聊天、对话、递合同 | ✅ 真实 GLM 回复 + 递合同成交（拖把 ¥299 → 佣金 +¥80）均实测 |
| 玩家 WASD/方向键移动、边界不变 | ✅ y∈[380,580] 保持 |
| 资产缺失回退不崩溃 | ✅ 删除 bg_street.png 与 npc_xiao_ai.png 实测：背景退回矩形街道、小艾退回彩色矩形、其余正常，聊天可开（已恢复文件） |
| 聊天面板/HUD/log-viewer 与新美术协调 | ✅ 深灰系统一，本轮截图复核 |
| 验收截图 3 张 | ✅ `C:\Users\zzb\Desktop\sellout-art\`：1-main-scene.png / 2-chatting.png / 3-hud-bag.png（干净存档后本机另存了 4 张复核截图，含 log-viewer） |
| 文件清单 + 资产对照表 | ✅ 即本文档 |

**本轮收尾新增验证**（接手中断会话后完成）：
1. 复核被中断的 `1-main-scene.png` —— 与已通过的 `main-scene.png` 同状态，正常。
2. 资产平铺改名后全量回归：typecheck 0 错误、build 通过、浏览器确认 9 资产全部加载、聊天/货品包/log-viewer 四张截图复核通过。
3. 干净存档：重启 dev:server（¥0、7 件货、任务=便携式地下室）。

## 5. v2 跟进记录（程序端，同日）

美术端 v2（驻点巡逻 + F 键交互）已按其交接文档验收，**全部通过**：

- 代码审查：`NPC_PATROL` 按 id 匹配 + `FALLBACK_PATROL` 兜底（无写死 7 个）；缺资产回退完整保留；typing guard 实现正确
- 浏览器实测：走位 → 「F 交谈」提示 → F 开聊（NPC 转身）✅；输入中 F/E/Esc 不误关 ✅；blur 后 Esc 关闭 ✅；点击开聊、递合同（含 too_early 冷启动拒绝）原逻辑完好 ✅
- 红线核对：未加依赖（phaser + @sellup/shared）、画布 960×600 不变、server/shared 零改动 ✅
- **已修（交接 TODO#1）**：巡逻速度 time-based 化——步长改用真实帧间隔（`game.loop.delta`），`walk` 语义为纯 px/s；原系数 ×1.2 已折进 `NPC_PATROL` 各值，手感不变
- **交接文档勘误**：①其 TODO#5（资产平铺）在我们这边已完成（`assets/npc_<id>.png` 平铺 + PreloadScene 已同步），文档描述的是旧状态；②「服务端有少量测试对话」已随多次重启清零，当前为干净开局

**遗留 TODO**（移交后续）：递合同 select → 卡片式弹窗；成交金币飞 HUD 动效；debug 数值条开关；git init；bundle 拆分（1.7MB，非紧急）。

## 6. 运行状态与遗留

- 两个服务**保持运行**：server(3001，日志 `logs/art-server-2.log`) + client(5173)。不需要可直接关闭。
- 过程稿归档：`C:\Users\zzb\.openclaw-autoclaw\agents\auto-designer\workspace\.openclaw\tmp\artwork\`（视觉契约/生图脚本/原图/备份稿），截图过程稿在桌面 `sellout-art\`。确认无用后可删。
- 已知小瑕疵（不影响验收）：NPC 名字标签位于人行道上沿，个别位置与玩家 sprite 轻微重叠；货品包面板展开时会遮住左侧 2-3 个 NPC 的点击区（关闭面板即可）。
- 后续可选：聊天面板 NPC 头像立绘（需求书 §7 暂列为非目标）、NPC 待机动画。
