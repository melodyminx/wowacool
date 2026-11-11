import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 读取 .env，但不覆盖已经存在的进程环境变量。
 * 不会打印或返回密钥值。
 */
export function loadEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadProjectEnv(projectRoot: string): void {
  loadEnvFile(resolve(projectRoot, ".env"));
}

const SECRET_KEY =
  /(?:API_KEY|SECRET|TOKEN|PASSWORD|AUTHORIZATION|CREDENTIAL|PRIVATE_KEY)/i;

export function isSecretEnvName(name: string): boolean {
  return SECRET_KEY.test(name);
}

/** 日志与错误信息脱敏：绝不回显密钥 */
export function redactSecrets(text: string): string {
  return text
    .replace(/sk-or-v1-[A-Za-z0-9]+/g, "sk-or-v1-[REDACTED]")
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, "$1[REDACTED]")
    .replace(
      /(OPENROUTER_API_KEY|IMAGE_GEN_API_KEY|API_KEY)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/user_[A-Za-z0-9]+/g, "user_[REDACTED]");
}
