/** 访客口令页（服务器端生产模式用） */
export function gateHtml(msg: string): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>成交 · 访客入口</title>
<style>
  body{margin:0;font-family:"Microsoft YaHei",sans-serif;background:#1c2420;color:#e8e8e8;
       display:flex;align-items:center;justify-content:center;height:100vh}
  .card{background:#2b2f33;border:2px solid #4a5058;border-radius:12px;padding:28px 32px;width:320px;text-align:center}
  h1{font-size:18px;color:#ffd960;margin:0 0 6px}p{font-size:12px;color:#9aa3ad;margin:0 0 18px}
  input{width:100%;box-sizing:border-box;background:#1a1d20;border:1px solid #4a5058;border-radius:8px;
        color:#e8e8e8;padding:10px 12px;font-size:16px;outline:none}
  button{width:100%;margin-top:12px;background:#D9534F;border:none;border-radius:8px;color:#fff;
         padding:10px;font-size:14px;font-weight:bold;cursor:pointer}
  .msg{color:#e8a8a8;font-size:12px;margin-top:10px;min-height:14px}
</style></head><body><div class="card">
<h1>SELL OUT / 成交</h1><p>这是私人测试服，请输入访问口令</p>
<form method="get" action="/__gate"><input name="pass" placeholder="访问口令" autofocus>
<button type="submit">进门</button></form><div class="msg">${msg}</div>
</div></body></html>`;
}
