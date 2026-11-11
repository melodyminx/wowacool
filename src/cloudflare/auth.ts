import { timingSafeEqual } from "node:crypto";
import { HttpError, json, readJson } from "./http.js";

const COOKIE = "wowacool_access";

export function optionalSecret(env: Env, name: string): string | undefined {
  if (!(name in env)) return undefined;
  const value = Reflect.get(env, name);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function accessToken(env: Env): string | undefined {
  return optionalSecret(env, "APP_ACCESS_TOKEN");
}

export async function sessionStatus(request: Request, env: Env): Promise<Response> {
  const token = accessToken(env);
  if (!token) return json({ ok: true, required: false, unlocked: true });
  const unlocked = await requestUnlocked(request, token);
  return json({ ok: true, required: true, unlocked });
}

export async function login(request: Request, env: Env): Promise<Response> {
  const token = accessToken(env);
  if (!token) return json({ ok: true, required: false, unlocked: true });
  const body = await readJson(request, 4_000);
  const provided = typeof body.token === "string" ? body.token : "";
  if (!provided.trim()) throw new HttpError(400, "请输入访问口令", "missing_token");
  if (provided.length > 500) throw new HttpError(400, "访问口令不正确", "bad_token");
  const ok = await hashesEqual(provided, token);
  if (!ok) throw new HttpError(401, "访问口令不正确", "bad_token");
  const digest = await sha256(token);
  return json(
    { ok: true, required: true, unlocked: true },
    200,
    { "set-cookie": cookieHeader(toHex(digest), request, 60 * 60 * 24 * 14) },
  );
}

export function logout(request: Request): Response {
  return json({ ok: true, required: true, unlocked: false }, 200, {
    "set-cookie": cookieHeader("", request, 0),
  });
}

export async function assertUnlocked(request: Request, env: Env): Promise<void> {
  const token = accessToken(env);
  if (!token) return;
  if (await requestUnlocked(request, token)) return;
  throw new HttpError(401, "请先输入访问口令", "locked");
}

async function requestUnlocked(request: Request, token: string): Promise<boolean> {
  const expected = await sha256(token);
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const provided = header.slice(7).trim();
    if (provided && (await hashesEqual(provided, token))) return true;
  }
  const raw = readCookie(request.headers.get("cookie"), COOKIE);
  if (!raw) return false;
  const given = fromHex(raw);
  if (!given || given.length !== expected.length) return false;
  return equalBytes(given, expected);
}

async function hashesEqual(provided: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([sha256(provided), sha256(expected)]);
  return equalBytes(left, right);
}

async function sha256(text: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  const a = copyBytes(left);
  const b = copyBytes(right);
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: BufferSource, y: BufferSource) => boolean;
  };
  if (typeof subtle.timingSafeEqual === "function") return subtle.timingSafeEqual(a, b);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

function copyBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(copy);
  view.set(bytes);
  return view;
}

function cookieHeader(value: string, request: Request, maxAge: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
