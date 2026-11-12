import { sniffImageMime } from "./raster.js";

/** Workers AI 可能返回 base64 对象、二进制或图片流。这里统一成字节。 */
export async function decodeAiImage(result: unknown): Promise<Uint8Array> {
  if (result instanceof Uint8Array) return assertImage(result);
  if (result instanceof ArrayBuffer) return assertImage(new Uint8Array(result));
  if (result instanceof ReadableStream) return assertImage(new Uint8Array(await new Response(result).arrayBuffer()));
  if (result instanceof Response) {
    return assertImage(new Uint8Array(await result.arrayBuffer()));
  }
  if (typeof result === "string") return assertImage(decodeBase64(result));
  if (result && typeof result === "object") {
    const record = result as { image?: unknown; error?: unknown; message?: unknown };
    if (typeof record.image === "string") return assertImage(decodeBase64(record.image));
    if (record.image instanceof Uint8Array) return assertImage(record.image);
    const detail = typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : "";
    if (detail) throw new Error(detail);
  }
  throw new Error("Workers AI 没有返回图片");
}

function decodeBase64(value: string): Uint8Array {
  const trimmed = value.trim();
  const dataUrl = trimmed.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  const payload = (dataUrl ? dataUrl[1] : trimmed).replace(/\s/g, "");
  const bytes = Buffer.from(payload, "base64");
  if (!bytes.length) throw new Error("Workers AI 返回的图片是空的");
  return new Uint8Array(bytes);
}

function assertImage(bytes: Uint8Array): Uint8Array {
  if (!sniffImageMime(bytes)) throw new Error("Workers AI 返回的内容不是 PNG 或 JPEG");
  return bytes;
}
