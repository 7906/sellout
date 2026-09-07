import dotenv from "dotenv";
import path from "node:path";

// 兼容两种运行方式：`npm run dev -w server`（cwd=server/）与仓库根目录启动
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

export interface AppConfig {
  port: number;
  /** 监听地址：开发默认 127.0.0.1；部署到公网时设 HOST=0.0.0.0 */
  host: string;
  glmApiKey: string | null;
  glmBaseUrl: string;
  glmModel: string;
  /** 访客口令（非本机访问需过口令；本机 127.0.0.1 永远放行） */
  gatePass: string;
  /** 反代子路径（如 /sellout）：nginx 剥前缀回源，本字段用于给发给浏览器的绝对路径补前缀；直连部署留空 */
  publicBasePath: string;
}

/** "/sellout" / "sellout" / "/sellout/" → "/sellout"；空 → "" */
function normalizeBasePath(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? "/" + trimmed : "";
}

export function loadConfig(): AppConfig {
  const apiKey = process.env.GLM_API_KEY?.trim();
  const hasRealKey =
    !!apiKey && apiKey.length > 0 && !apiKey.startsWith("your_");

  return {
    port: Number(process.env.PORT ?? 3001),
    host: process.env.HOST?.trim() || "127.0.0.1",
    glmApiKey: hasRealKey ? apiKey! : null,
    glmBaseUrl: process.env.GLM_BASE_URL?.trim() || "https://open.bigmodel.cn/api/paas/v4",
    glmModel: process.env.GLM_MODEL?.trim() || "glm-4-flash",
    gatePass: process.env.GATE_PASS?.trim() || "sellout2026",
    // 归一化为 "/sellout" 形式；留空表示直连部署。
    // 兼容不带前导斜杠的写法（PUBLIC_BASE_PATH=sellout），避免 Windows Git Bash 把 "/x" 当 POSIX 路径转换
    publicBasePath: normalizeBasePath(process.env.PUBLIC_BASE_PATH),
  };
}
