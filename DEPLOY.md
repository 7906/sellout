# SELL OUT / 成交 — 部署指南（方案②：云服务器）

> 目标形态：一台云服务器跑**单进程**（游戏页面 + API 同端口 80），朋友浏览器打开
> `http://服务器IP` 输口令即玩。GLM Key 只存在于服务器上。
> 存档已落盘（`server/data/save.json`），重启/断电不清进度（每 10 秒 + 每次成交即时冲刷）。

---

## 0. 买什么服务器

| 项 | 推荐 |
| --- | --- |
| 机型 | 腾讯云轻量应用服务器 或 阿里云 ECS（新用户活动机 2核2G 一年几十元足够） |
| 系统 | Ubuntu 22.04 / 24.04 |
| 地域 | 国内任意（朋友在国内直连 IP 最快） |
| 防火墙/安全组 | 控制台里放行 **80 端口**（TCP） |

> 无需域名、无需备案（用 IP 直连）。

## 1. 本地打包（Git Bash / 项目根目录执行）

```bash
npm run typecheck && npm run build -w client     # 确认 0 错误 + 构建成功
tar --exclude=node_modules --exclude=.env --exclude=server/data \
    --exclude=logs --exclude=tools --exclude=client/dist \
    -czf sellup-src.tar.gz -C .. SELLUP
scp sellup-src.tar.gz root@服务器IP:/opt/
```

## 2. 服务器初始化（SSH 到服务器执行）

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
# 解压 + 依赖 + 构建
cd /opt && tar xzf sellup-src.tar.gz && cd SELLUP
npm install
npm run build -w client
# 配置
cp .env.example server/.env
nano server/.env
```

`server/.env` 必填项：

```ini
GLM_API_KEY=你的智谱Key
GLM_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4   # 按你的套餐
GLM_MODEL=glm-5.3-flash
PORT=80
HOST=0.0.0.0          # 对公网开放
GATE_PASS=你和朋友约好的口令
```

## 3. systemd 常驻（开机自启 + 崩溃自动拉起）

```bash
cat > /etc/systemd/system/sellup.service << 'EOF'
[Unit]
Description=SELL OUT game server
After=network.target

[Service]
WorkingDirectory=/opt/SELLUP
ExecStart=/usr/bin/npm run start:prod
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sellup
systemctl status sellup        # active (running) 即成功
curl http://127.0.0.1/         # 应返回口令页 HTML
```

浏览器打开 `http://服务器IP` → 输口令 → 开玩。把这个网址 + 口令发朋友。

## 4. 日常运维

```bash
systemctl restart sellup        # 重启（进度不会丢，存档自动恢复）
journalctl -u sellup -f         # 看实时日志（含 GLM 调用/成交记录）
cat /opt/SELLUP/server/data/save.json   # 查看存档
cp save.json save.backup.json   # 备份存档就是复制这个文件
```

**更新版本**：本地改完代码 → 重复 §1 打包上传 → 服务器 `tar xzf` 覆盖 → `npm install && npm run build -w client && systemctl restart sellup`。

## 5. 安全须知

- 口令是唯一防线：别用太弱的口令；被陌生人拿到 = 消耗你的 GLM 配额 + 世界被搅乱
- 换口令：改 `server/.env` 的 `GATE_PASS` → `systemctl restart sellup`（所有访客需重新输口令）
- `server/.env` 含 Key，**不要**提交进 git / 发给任何人
- 存档是单世界：所有进来的人共享同一批 NPC 和钱包（多玩家隔离 = 未来功能）

## 6. 与本地开发的关系

| 场景 | 命令 | 地址 |
| --- | --- | --- |
| 本地开发 | `npm run dev:server` + `npm run dev:client` | 127.0.0.1:5173（Vite 代理 API） |
| 本地体验生产模式 | `npm run build -w client` 后 `PORT=3002 npm run start:prod -w server` | 127.0.0.1:3002 |
| 朋友玩 | 服务器上的 `npm run start:prod`（systemd 常驻） | http://服务器IP |

生产模式 = `@fastify/static` 同端口托管 `client/dist` + API（`server.ts` 自动检测 dist 存在即启用）。

---


---

# 方案③（推荐给试玩）：Render 免费托管

> 更正：原推荐的 ClawCloud Run 已于 2026 年停止服务（官网域名已失效）。
> Render 免费档：512MB Web 服务、无需绑卡，直接拉取本仓库发布好的镜像。

## 0. 前置（一次性）：把镜像设为公开

GitHub → 个人页 **Packages** → `sellout` → **Package settings** → 拉到底 **Danger Zone** →
**Change visibility → Public**（确认框里输入包名 `sellout`）。
不设公开的话 Render/Koyeb 拉不到镜像。

## 1. 部署步骤

1. 打开 https://dashboard.render.com → 用 GitHub 登录；
2. **New +** → **Web Service** → 部署方式选 **Existing Image** → Image URL 填：
   `ghcr.io/7906/sellout:latest`
3. 配置：
   - **Region**: Singapore（离国内最近）
   - **Instance Type**: Free
   - **Port**: `3001`（Render 会按此端口转发）
   - **Environment Variables**：
     - `GLM_API_KEY` = 你的智谱 Key（https://open.bigmodel.cn 申请，glm-4-flash 免费）
     - `GATE_PASS` = 自定义访问口令
4. **Create Web Service** → 等状态变 **Live** → 顶部 `xxx.onrender.com` 地址就是游戏地址，发朋友输口令即玩。

## 2. 免费档须知

- **15 分钟无访问自动休眠**，下次打开约 30~60 秒唤醒（可去 cron-job.org 免费建个每 14 分钟的定时 ping 保活；自 ping 与平台 ToS 有灰色地带，个人小项目通常无碍，自行权衡）；
- 免费档磁盘为**临时盘**：休眠/重新部署会丢存档（`server/data/save.json`），跨会话进度不做指望；
- 更新版本：`git push` → Actions 自动构建新镜像 → Render 控制台 **Manual Deploy → Pull latest image**。

# 方案④：Koyeb（备选）

免费档：1 个 512MB 实例，无需绑卡，入口 https://app.koyeb.com 。
Create Service → **Docker** → Image 填 `ghcr.io/7906/sellout:latest` → Port `3001` →
环境变量同上 → 开启公网地址。免费实例同样有休眠与临时盘限制；免费实例区域偏欧美，国内延迟略高。
