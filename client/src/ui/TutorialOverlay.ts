/**
 * 新手教程弹窗：分步讲清游戏流程（敲门→聊天→递合同→条件→收工KPI→李老师攻略）。
 * 新档第一次「开始游戏」自动弹出；HUD 的 ❓ 按钮随时重看。
 */
const TUTORIAL_STEPS: Array<{ icon: string; title: string; body: string[] }> = [
  {
    icon: "💼",
    title: "你的工作",
    body: [
      "你是「远大前程贸易公司」的推销员，把背包里的货卖出去赚佣金。",
      "每天公司下达 KPI 入账目标——收工时结算，完成度有评分（S/A/B/C/D）。",
      "货分三档：便宜货走量、中价货是主力、贵货要先把人聊动了心才卖得掉。",
    ],
  },
  {
    icon: "🚪",
    title: "敲门",
    body: [
      "方向键 / WASD 移动（手机按住拖动），走近居民按 F 或点击 TA 开门聊天。",
      "每个 NPC 头顶有名牌和心情徽章；场景里的线索（门口贴的、窗台摆的）都可能是突破口。",
    ],
  },
  {
    icon: "💬",
    title: "聊天就是销售",
    body: [
      "TA 亲口说过的：「你再接这些话头，TA 不会起疑」。",
      "TA 没说过的私事：你一开口，怀疑立刻暴涨——这是最大的雷区。",
      "聊得好（真诚、被逗笑、聊到心坎）信任会涨；吹牛、套路、踩痛处，怀疑和耐心会崩。",
      "卡住了就点聊天框右上角的「📖 攻略」——每位街坊都有引导提示。",
    ],
  },
  {
    icon: "🤝",
    title: "递合同",
    body: [
      "觉得火候到了就点「🤝 递合同」选货推销。服务器按五道闸裁决：",
      "没买过 → 没踩 TA 的雷 → 信任够 → 怀疑低 → 对这件货动了心 → 买得起。",
      "被拒有代价（耐心↓怀疑↑），但隔几回合 TA 会消气。同一个人买得越多，信任门槛越高。",
    ],
  },
  {
    icon: "🌙",
    title: "收工与 KPI",
    body: [
      "点 HUD 的「🌙 收工」结束这一天：看成交明细、KPI 评分、街区新闻和明天的公司邮件。",
      "每天的任务货不同（荒诞高难库存，卖出有额外奖金）；卖不掉就当退回公司。",
      "跨天保留：资产、TA 对你的信任/怀疑、买过的东西。一天之内随便重来（新的开始）。",
    ],
  },
  {
    icon: "👵",
    title: "BOSS 攻略：李老师",
    body: [
      "退休教师，只认检测报告，最恨吹牛——夸大功效会被当场记雷，当天没得谈。",
      "正确姿势：聊她的膝盖（窗台的护膝和膏药是线索），拿出羊毛护膝的检测数据说话，绝不提「分期」。",
      "她先拒绝很正常——接住她的质疑（别让她更生气）两次，她才肯继续听。",
    ],
  },
];

export class TutorialOverlay {
  private root: HTMLElement;
  private panel: HTMLDivElement;
  private step = 0;

  constructor(rootId: string) {
    this.root = document.getElementById(rootId)!;
    this.panel = document.createElement("div");
    this.panel.className = "tutorial-overlay";
    this.panel.style.display = "none";
    this.root.appendChild(this.panel);
    // HUD ❓ 按钮与开始页都通过这个事件打开
    window.addEventListener("sellout:show-tutorial", (() => {
      this.show(0);
    }) as EventListener);
  }

  show(step = 0): void {
    this.step = step;
    this.render();
    this.panel.style.display = "flex";
  }

  private render(): void {
    const s = TUTORIAL_STEPS[this.step]!;
    const last = this.step === TUTORIAL_STEPS.length - 1;
    const dots = TUTORIAL_STEPS.map(
      (_, i) => `<span class="tutorial-dot ${i === this.step ? "on" : ""}"></span>`,
    ).join("");
    this.panel.innerHTML = `
      <div class="tutorial-panel">
        <div class="tutorial-head"><span class="tutorial-icon">${s.icon}</span> ${s.title}</div>
        <div class="tutorial-body">
          ${s.body.map((line) => `<div class="tutorial-line">· ${line}</div>`).join("")}
        </div>
        <div class="tutorial-dots">${dots}</div>
        <div class="tutorial-btns">
          ${this.step > 0 ? `<button class="tutorial-prev">上一步</button>` : ""}
          <button class="tutorial-next">${last ? "☀️ 开始营业" : "下一步 →"}</button>
          ${!last ? `<button class="tutorial-skip">跳过</button>` : ""}
        </div>
      </div>`;
    this.panel.querySelector(".tutorial-next")!.addEventListener("click", () => {
      if (last) this.hide();
      else this.show(this.step + 1);
    });
    this.panel.querySelector(".tutorial-prev")?.addEventListener("click", () => this.show(this.step - 1));
    this.panel.querySelector(".tutorial-skip")?.addEventListener("click", () => this.hide());
  }

  private hide(): void {
    this.panel.style.display = "none";
    this.panel.innerHTML = "";
  }
}
