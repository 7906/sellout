import { defineConfig, type Plugin, type ViteDevServer } from "vite";

/** 访客口令：告诉朋友即可；改这里即可换口令（本机 localhost 访问不需要口令） */
const GATE_PASS = "sellout2026";
const COOKIE = "sellout_gate";

function gateHtml(msg: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>成交 · 访客入口</title>
<style>
  body{margin:0;font-family:"Microsoft YaHei",sans-serif;background:#1c2420;color:#e8e8e8;
       display:flex;align-items:center;justify-content:center;height:100vh}
  .card{background:#2b2f33;border:2px solid #4a5058;border-radius:12px;padding:28px 32px;width:320px;text-align:center}
  h1{font-size:18px;color:#ffd960;margin:0 0 6px}p{font-size:12px;color:#9aa3ad;margin:0 0 18px}
  input{width:100%;box-sizing:border-box;background:#1a1d20;border:1px solid #4a5058;border-radius:8px;
        color:#e8e8e8;padding:10px 12px;font-size:14px;outline:none}
  button{width:100%;margin-top:12px;background:#D9534F;border:none;border-radius:8px;color:#fff;
         padding:10px;font-size:14px;font-weight:bold;cursor:pointer}
  .msg{color:#e8a8a8;font-size:12px;margin-top:10px;min-height:14px}
</style></head><body><div class="card">
<h1>SELL OUT / 成交</h1><p>这是私人测试服，请输入访问口令</p>
<form method="get" action="/__gate"><input name="pass" placeholder="访问口令" autofocus>
<button type="submit">进门</button></form><div class="msg">${msg}</div>
</div></body></html>`;
}

/** 访客口令门：本机 localhost 直连免口令；经隧道访问需先过口令。
 *  直接 use() 注册的中间件先于 Vite 内部中间件执行。 */
function guestGate(): Plugin {
  return {
    name: "sellout-guest-gate",
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const host = String(req.headers.host ?? "");
        const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host);
        if (isLocal) return next();

        const url = new URL(req.url ?? "/", "http://gate.local");

        // 提交了正确口令 → 发 cookie 并跳回目标页
        if (url.pathname === "/__gate" && url.searchParams.get("pass") === GATE_PASS) {
          res.setHeader("Set-Cookie", `${COOKIE}=${GATE_PASS}; Path=/; Max-Age=604800; HttpOnly`);
          res.statusCode = 302;
          res.setHeader("Location", url.searchParams.get("to") || "/");
          return res.end();
        }

        // cookie 正确 → 放行
        const cookieOk = String(req.headers.cookie ?? "")
          .split(/;\s*/)
          .some((c) => c === `${COOKIE}=${GATE_PASS}`);
        if (cookieOk) return next();

        // 其余：/__gate 显示口令表单，其它路径先跳到 /__gate
        if (url.pathname === "/__gate") {
          const wrong = url.searchParams.has("pass") ? "口令不对，再试试？" : "";
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          return res.end(gateHtml(wrong));
        }
        res.statusCode = 302;
        res.setHeader("Location", "/__gate?to=" + encodeURIComponent(url.pathname));
        return res.end();
      });
    },
  };
}

import path from "node:path";

// 子路径部署：PUBLIC_BASE_PATH=sellout npm run build -w client（与 server/.env 的同名变量保持一致）
// 兼容带/不带前导斜杠的写法，归一化为 "/sellout"（不带斜杠也避免 Git Bash 把 "/x" 当 POSIX 路径转换）
const BASE = (process.env.PUBLIC_BASE_PATH ?? "").trim().replace(/^\/+|\/+$/g, "");

export default defineConfig({
  base: BASE ? BASE + "/" : "/",
  resolve: {
    alias: {
      // 网络层别名：正式版走 HTTP apiClient（小红书离线版用别名指向本地引擎）
      "@network": path.resolve(__dirname, "src/network"),
    },
  },
  server: {
    port: 5173,
    // Vite 6 默认可能只绑 IPv6 ::1，显式绑 IPv4 保证确定性
    host: "127.0.0.1",
    // 允许内网穿透域名访问（口令门防止陌生人进入）
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      // 开发期把 /api 转发到游戏服务器，避免 CORS
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [guestGate()],
});
