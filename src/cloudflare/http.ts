import { redactSecrets } from "../util/env.js";
import { ReviewGateError } from "../review/gate.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function json(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8");
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export async function readJson(request: Request, maxBytes = 100_000): Promise<Record<string, unknown>> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new HttpError(413, "请求体太大", "body_too_large");
  }
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "请求体太大", "body_too_large");
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new HttpError(400, "请求体需要是 JSON 对象", "bad_json");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "请求体不是 JSON", "bad_json");
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ ok: false, error: redactSecrets(error.message), code: error.code }, error.status);
  }
  if (error instanceof ReviewGateError) {
    return json({ ok: false, error: redactSecrets(error.message), code: "review_blocked" }, 409);
  }
  const message = redactSecrets(error instanceof Error ? error.message : "服务器出错了");
  console.error(JSON.stringify({ message: "unhandled error", error: message }));
  return json({ ok: false, error: "处理失败，请稍后再试", code: "internal" }, 500);
}

export function requirePlatform(env: Env): { db: D1Database; bucket: R2Bucket } {
  if (!env.DB || !env.ASSETS) {
    throw new HttpError(
      503,
      "D1（绑定 DB）或 R2（绑定 ASSETS）还不可用。请确认 wrangler.toml 已填写 database_id 和 bucket_name 后重新部署。",
      "bindings_missing",
    );
  }
  return { db: env.DB, bucket: env.ASSETS };
}

export function assertId(value: string, label = "id"): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, `${label} 无法解析`, "bad_id");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(decoded)) {
    throw new HttpError(400, `${label} 不正确`, "bad_id");
  }
  return decoded;
}

export function optionalString(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new HttpError(400, `${label} 需要是字符串`, "bad_field");
  if (Array.from(value).length > max) {
    throw new HttpError(400, `${label} 超过 ${max} 字`, "too_long");
  }
  return value;
}
