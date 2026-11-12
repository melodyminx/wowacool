import { HttpError } from "./http.js";

const BLOCKED_HOSTS = [
  "xiaohongshu.com",
  "xiaohongshu.cn",
  "xhslink.com",
  "xhscdn.com",
  "douyin.com",
  "douyin.cn",
  "iesdouyin.com",
  "douyinvod.com",
  "tiktok.com",
  "tiktokv.com",
  "snssdk.com",
  "amemv.com",
];

const TITLE_BYTES = 64 * 1024;

/** 只接受用户自己的 http(s) 书签。不抓取小红书、抖音，也不访问本机或内网地址。 */
export function assertBookmarkUrl(raw: string): string {
  const text = raw.trim();
  if (!text || text.length > 500) throw new HttpError(400, "链接需要是 500 字以内的 http 或 https 地址", "bad_url");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new HttpError(400, "链接需要是 http 或 https 地址", "bad_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "链接需要是 http 或 https 地址", "bad_url");
  }
  if (url.username || url.password) throw new HttpError(400, "链接里不要带账号或密码", "bad_url");
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || blockedPlatform(host) || blockedAddress(host)) {
    throw new HttpError(400, "项目资料不抓取小红书、抖音或内网地址。请把要点贴成文字笔记。", "blocked_url");
  }
  return url.toString();
}

/**
 * 用户没写标题时，只读页面 `<title>`。不跟随跳转，不保存正文。
 * 失败时返回 null，书签仍然可以只存 URL。
 */
export async function fetchBookmarkTitle(target: string): Promise<string | null> {
  const url = assertBookmarkUrl(target);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(2500),
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "user-agent": "wowacool-bookmark/1.0",
      },
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return null;
    }
    const bytes = await readLimited(response.body, TITLE_BYTES);
    const html = new TextDecoder().decode(bytes);
    const match = html.match(/<title[^>]*>([^<]{1,180})<\/title>/i);
    if (!match) return null;
    const title = decodeTitle(match[1]).slice(0, 80);
    return title || null;
  } catch {
    return null;
  }
}

function blockedPlatform(host: string): boolean {
  return BLOCKED_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function blockedAddress(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "");
  if (bare === "localhost" || bare.endsWith(".localhost") || bare.endsWith(".local") || bare === "metadata.google.internal") {
    return true;
  }
  if (bare.includes(":")) {
    const v6 = bare.toLowerCase();
    return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
  }
  const match = bare.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

async function readLimited(stream: ReadableStream<Uint8Array>, max: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < max) {
      const step = await reader.read();
      if (step.done) break;
      if (!step.value?.byteLength) continue;
      const room = max - total;
      const slice = step.value.byteLength > room ? step.value.subarray(0, room) : step.value;
      chunks.push(slice);
      total += slice.byteLength;
      if (step.value.byteLength > room) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function decodeTitle(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, digits: string) => {
      const code = Number(digits);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}
