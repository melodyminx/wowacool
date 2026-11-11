import { appendFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { redactSecrets } from "./env.js";
import { resolveDataPaths } from "./paths.js";

export type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, extra?: unknown): void {
  const safeMessage = redactSecrets(message);
  const line = {
    at: new Date().toISOString(),
    level,
    message: safeMessage,
    extra: extra === undefined ? undefined : sanitize(extra),
  };
  const serialized = JSON.stringify(line);
  const prefix = level === "error" ? "error" : level === "warn" ? "warn" : "info";
  const out = level === "error" ? process.stderr : process.stdout;
  try {
    out?.write?.(`[${prefix}] ${safeMessage}${extra !== undefined ? ` ${JSON.stringify(line.extra)}` : ""}\n`);
  } catch {
    // stdout 不可用时不影响文案生成（例如 Worker 运行时）
  }
  try {
    const { logsDir } = resolveDataPaths();
    mkdirSync(logsDir, { recursive: true });
    const file = resolve(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
    appendFileSync(file, `${serialized}\n`, "utf8");
  } catch {
    // 日志写盘失败不影响主流程
  }
}

function sanitize(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (/key|secret|token|authorization|password/i.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}
