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

# 方案③（推荐给试玩）：ClawCloud Run 免费托管

> GitHub 账号注册满 180 天 → 每月赠送 $5 额度，无需绑卡。轻量常驻容器一个月约花 $2~4，够用。
> 本仓库已配好 **Dockerfile + GitHub Actions**：推送 `main` 分支即自动构建镜像发布到
> `ghcr.io/<你的用户名>/sellout:latest`，ClawCloud 里填这个镜像地址即可。

## 1. 开通（一次性）

1. 浏览器打开 https://run.claw.cloud ，用 GitHub 登录（就是本仓库的账号）；
2. 区域选 **日本（东京）或 新加坡**（国内直连体验最好）。

## 2. 把镜像设为公开（一次性）

首次 Actions 构建完成后（仓库 Actions 页看到绿勾）：

GitHub 个人页 → **Packages** → `sellout` → **Package settings** → 拉到底 Danger Zone →
**Change visibility → Public**。不设公开的话 ClawCloud 拉不到镜像。

## 3. 部署

控制台 → **App Launchpad → Create App**：

| 配置项 | 填写 |
| --- | --- |
| App Name | `sellout` |
| Image | `ghcr.io/<你的用户名>/sellout:latest` |
| CPU / Memory | `0.5 Core / 1024 MB`（最低可 0.25 / 512） |
| Replicas | 1 |
| Container Port | `3001`（对应 Dockerfile 的 PORT） |
| Environment Variables | `GLM_API_KEY=你的智谱Key`、`GATE_PASS=自定义访问口令`（HOST/PORT 已内置，可不填） |
| Network | 开启 **Public Access**，端口 3001，生成公网地址 |
| 持久化（可选） | 挂 1GB 卷到 `/app/server/data`，重启不丢存档；不挂则每次重启开新档 |

部署后打开公网地址 → 输口令 → 开玩。

## 4. 更新版本

`git push` 到 `main` → Actions 自动构建新镜像 → ClawCloud 里点 **Update/Redeploy**（镜像 tag 固定 `latest` 时建议开启"总是拉取最新镜像"，或把 tag 换成具体 commit SHA）。

## 5. 费用与风险

- $5/月额度内免费：0.5C/1G 常驻约 $3/月，加 1GB 卷约再 $0.5/月；超了才扣费（不绑卡则停机，不会倒扣）；
- 平台较新，**别当生产环境**；存档记得偶尔从 `/app/server/data/save.json` 备份（控制台可进容器终端）。
