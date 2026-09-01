import type { GameStatePublic } from "@sellup/shared";
import { fetchGameState, fetchMeta, resetGame, saveApiKey, type ServerMeta } from "@network/apiClient";

/**
 * 游戏开始页（标题画面）：
 * 1) 未配置 GLM Key → 先进「接入 AI 引擎」步骤（可跳过离线体验）；
 * 2) 有进度 → 「继续 · 第 N 天」；「新的开始」二次确认后清档重开。
 * 覆盖在已启动的场景之上（半透明），选「继续」直接揭幕开玩。
 */
export class StartOverlay {
  private root: HTMLElement;
  private panel: HTMLDivElement;
  private state: GameStatePublic | null = null;
  private meta: ServerMeta | null = null;
  private confirmArmed = false;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;

  constructor(rootId: string) {
    this.root = document.getElementById(rootId)!;
    this.panel = document.createElement("div");
    this.panel.className = "start-overlay";
    this.root.appendChild(this.panel);
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      [this.state, this.meta] = await Promise.all([fetchGameState(), fetchMeta()]);
    } catch {
      this.state = null;
      this.meta = null;
    }
    this.render();
  }

  private hasProgress(): boolean {
    const s = this.state;
    if (!s) return false;
    // 脱敏视图里没有购买记录，用 天数/资产 近似判断「是不是新档」
    return s.day > 1 || s.player.money > 0;
  }

  private render(): void {
    // 第 0 步：没配 GLM Key → 先引导接入 AI（可跳过离线体验）
    if (this.meta && !this.meta.glmOnline) {
      this.renderApiKeyStep();
      return;
    }
    const s = this.state;
    const progressed = this.hasProgress();
    const mainLabel = s
      ? progressed
        ? `☀️ 继续游戏 · 第 ${s.day} 天（资产 ¥${s.player.money}）`
        : "☀️ 开始游戏"
      : "⚠ 连不上服务器，点我重试";

    this.panel.style.display = "flex";
    this.panel.innerHTML = `
      <div class="start-panel">
        <div class="start-logo">SELL OUT</div>
        <div class="start-title-cn">成 交</div>
        <div class="start-sub">荒诞销售喜剧 · 你是新来的推销员</div>
        <div class="start-btns">
          <button class="start-continue">${mainLabel}</button>
          <button class="start-new ${this.confirmArmed ? "armed" : ""}">${
            this.confirmArmed ? "⚠ 再点一次：清空全部进度，真的开新档？" : "🆕 新的开始（清空进度）"
          }</button>
        </div>
        <div class="start-hint">←↑↓→ / WASD 移动 · 点 NPC 敲门聊天 · 🤝 递合同成交 · 🌙 收工结算一天</div>
      </div>`;

    this.panel.querySelector(".start-continue")!.addEventListener("click", () => {
      if (!this.state) {
        void this.load();
        return;
      }
      const fresh = !this.hasProgress();
      this.hide();
      // 新档第一次进来自动带一遍玩法流程
      if (fresh) window.dispatchEvent(new CustomEvent("sellout:show-tutorial"));
    });
    this.panel.querySelector(".start-new")!.addEventListener("click", () => void this.onNewGame());
  }

  /** 首次引导：填 GLM API Key（存服务器热生效），或跳过用离线降级先体验 */
  private renderApiKeyStep(): void {
    this.panel.style.display = "flex";
    this.panel.innerHTML = `
      <div class="start-panel">
        <div class="start-logo" style="font-size:30px;">🔑 接入 AI 引擎</div>
        <div class="start-sub" style="margin-top:12px; line-height:1.9;">
          NPC 由智谱 GLM 大模型实时扮演。<br>
          第 1 步：打开 <b>open.bigmodel.cn</b> → 注册并进控制台<br>
          第 2 步：左侧「API Keys」→ 创建并复制 Key（免费额度够玩）<br>
          第 3 步：把 Key 粘贴到下面，保存即生效
        </div>
        <input class="start-key-input" type="text" placeholder="粘贴你的 API Key（例如：xxxxxxxxxxxxxxxxxxxxxxxx）" autocomplete="off" spellcheck="false" />
        <div class="start-key-err" style="display:none"></div>
        <div class="start-btns">
          <button class="start-save-key">🔑 保存并开始</button>
          <button class="start-skip-key">先跳过（离线模式试玩，NPC 回复会简化）</button>
        </div>
        <div class="start-hint">Key 只保存在你自己电脑的 server/.env 文件里，不会上传到任何地方</div>
      </div>`;

    const input = this.panel.querySelector(".start-key-input") as HTMLInputElement;
    const err = this.panel.querySelector(".start-key-err") as HTMLElement;
    input.focus();
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") void this.saveKey(input.value, err);
    });
    this.panel.querySelector(".start-save-key")!.addEventListener("click", () => void this.saveKey(input.value, err));
    this.panel.querySelector(".start-skip-key")!.addEventListener("click", () => {
      this.meta = { glmOnline: false, model: "offline" };
      this.render();
    });
  }

  private async saveKey(key: string, err: HTMLElement): Promise<void> {
    if (this.busy) return;
    err.style.display = "none";
    this.busy = true;
    try {
      await saveApiKey(key);
      this.meta = { glmOnline: true, model: "glm" };
      this.render();
    } catch (e) {
      err.textContent = e instanceof Error ? e.message : String(e);
      err.style.display = "block";
    } finally {
      this.busy = false;
    }
  }

  /** 二次确认防手滑；确认后调服务器清档并整页刷新（干净重载所有客户端状态） */
  private async onNewGame(): Promise<void> {
    if (this.busy) return;
    if (!this.confirmArmed) {
      this.confirmArmed = true;
      this.render();
      this.confirmTimer = setTimeout(() => {
        this.confirmArmed = false;
        this.render();
      }, 4000);
      return;
    }
    if (this.confirmTimer) clearTimeout(this.confirmTimer);
    this.busy = true;
    try {
      await resetGame();
      location.reload();
    } catch (e) {
      this.confirmArmed = false;
      this.busy = false;
      this.render();
      alert(`重置失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private hide(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }
}
