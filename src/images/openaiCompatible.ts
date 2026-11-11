import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "../constants.js";
import type { AppConfig } from "../config.js";
import { redactSecrets } from "../util/env.js";
import { fitPortrait } from "./aspect.js";
import { sniffImageMime } from "./raster.js";
import type { GeneratedImage, ImageProvider, ImageSpec } from "./provider.js";
import { assertImageCount } from "./provider.js";

const BANNED = /seedance|grok|x\.ai|xai\.com|video/i;

/**
 * OpenAI 兼容的 POST /images/generations。
 * 只有地址、密钥和模型都齐了才发请求。Seedance 与 Grok / xAI 直接拒绝。
 */
export class OpenAiCompatibleImageProvider implements ImageProvider {
  readonly id = "openai_compatible";

  constructor(private readonly config: AppConfig["imageGen"]) {}

  isConfigured(): boolean {
    return Boolean(this.config?.baseUrl && this.config.apiKey && this.config.model);
  }

  async generate(specs: ImageSpec[]): Promise<GeneratedImage[]> {
    assertImageCount(specs.length);
    if (!this.isConfigured() || !this.config?.baseUrl || !this.config.apiKey || !this.config.model) {
      throw new Error(
        "文生图 Provider 未配置。请填写 IMAGE_GEN_BASE_URL、IMAGE_GEN_API_KEY、IMAGE_GEN_MODEL 后再使用 IMAGE_PROVIDER=openai_compatible。工作台默认用 Workers AI；本地 CLI 请用 IMAGE_PROVIDER=mock。",
      );
    }
    assertStillImageTarget(this.config.baseUrl, this.config.model);
    const endpoint = joinUrl(this.config.baseUrl, this.config.path || "/images/generations");
    const images: GeneratedImage[] = [];
    for (const spec of specs) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          prompt: spec.prompt,
          size: `${PORTRAIT_WIDTH}x${PORTRAIT_HEIGHT}`,
          n: 1,
          response_format: "b64_json",
        }),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(redactSecrets(`文生图接口失败（第 ${spec.index} 张）：HTTP ${response.status} ${text.slice(0, 300)}`));
      }
      const raw = await readOpenAiImage(text, spec.index);
      const fitted = fitPortrait(raw);
      const ext = fitted.mimeType === "image/jpeg" ? "jpg" : "png";
      images.push({
        index: spec.index,
        prompt: spec.prompt,
        mimeType: fitted.mimeType,
        filename: `${String(spec.index).padStart(2, "0")}.${ext}`,
        bytes: Buffer.from(fitted.bytes),
        provider: this.id,
      });
    }
    return images;
  }
}

export function assertStillImageTarget(baseUrl: string, model: string): void {
  if (BANNED.test(baseUrl) || BANNED.test(model)) {
    throw new Error("Seedance 是视频模型，不能用于图文出图。Grok / xAI 出图也不在这里调用。");
  }
}

async function readOpenAiImage(text: string, index: number): Promise<Uint8Array> {
  let parsed: { data?: Array<{ b64_json?: string; url?: string }>; error?: { message?: string } };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error(`文生图接口没有返回 JSON（第 ${index} 张）`);
  }
  if (parsed.error?.message) throw new Error(redactSecrets(parsed.error.message));
  const first = parsed.data?.[0];
  if (first?.b64_json) {
    const bytes = new Uint8Array(Buffer.from(first.b64_json, "base64"));
    if (!sniffImageMime(bytes)) throw new Error(`文生图结果不是 PNG 或 JPEG（第 ${index} 张）`);
    return bytes;
  }
  if (first?.url) {
    if (!first.url.startsWith("https://")) throw new Error("文生图结果地址必须是 https");
    const response = await fetch(first.url);
    if (!response.ok) throw new Error(`下载文生图结果失败（第 ${index} 张）：HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!sniffImageMime(bytes)) throw new Error(`文生图结果不是 PNG 或 JPEG（第 ${index} 张）`);
    return bytes;
  }
  throw new Error(`文生图响应里没有图片（第 ${index} 张）`);
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
