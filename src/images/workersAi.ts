import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH, WORKERS_AI_IMAGE_MODEL } from "../constants.js";
import { fitPortrait } from "./aspect.js";
import type { GeneratedImage, ImageProvider, ImageSpec } from "./provider.js";
import { assertImageCount } from "./provider.js";
import { decodeAiImage } from "./bytes.js";

export interface WorkersAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface WorkersAiCall {
  model: string;
  input: { prompt?: string; steps?: number; multipart?: { body: ReadableStream | null; contentType: string } };
}

const BANNED_MODEL = /seedance|grok|xai|video/i;

export function assertWorkersAiModel(model: string): void {
  if (!model.startsWith("@cf/")) {
    throw new Error("文生图模型必须是 Cloudflare Workers AI 的官方模型（以 @cf/ 开头）。");
  }
  if (BANNED_MODEL.test(model)) {
    throw new Error("这个模型不能用于图文出图。Seedance 是视频模型，Grok / xAI 出图不在这里调用。");
  }
}

/** 官方绑定调用。FLUX.1 schnell 只有 prompt/steps；FLUX.2 用 multipart 指定 3:4。 */
export function buildWorkersAiCall(model: string, prompt: string): WorkersAiCall {
  assertWorkersAiModel(model);
  const text = clampPrompt(prompt);
  if (model.includes("flux-1-schnell")) {
    return { model, input: { prompt: text, steps: 4 } };
  }
  const form = new FormData();
  form.append("prompt", text);
  form.append("width", String(PORTRAIT_WIDTH));
  form.append("height", String(PORTRAIT_HEIGHT));
  const encoded = new Response(form);
  const contentType = encoded.headers.get("content-type");
  if (!contentType) throw new Error("无法编码文生图请求");
  return { model, input: { multipart: { body: encoded.body, contentType } } };
}

export class WorkersAiImageProvider implements ImageProvider {
  readonly id = "workers_ai";

  constructor(
    private readonly ai: WorkersAiBinding,
    private readonly model = WORKERS_AI_IMAGE_MODEL,
  ) {}

  async generate(specs: ImageSpec[]): Promise<GeneratedImage[]> {
    assertImageCount(specs.length);
    assertWorkersAiModel(this.model);
    const images: GeneratedImage[] = [];
    for (const spec of specs) {
      const call = buildWorkersAiCall(this.model, spec.prompt);
      let result: unknown;
      try {
        result = await this.ai.run(call.model, call.input);
      } catch (error) {
        const detail = error instanceof Error ? error.message : "文生图失败";
        throw new Error(`Workers AI 出图失败（第 ${spec.index} 张）：${detail}`);
      }
      const raw = await decodeAiImage(result);
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

function clampPrompt(prompt: string): string {
  const text = prompt.trim() || "竖版小红书配图，干净明亮，没有文字和水印";
  const chars = Array.from(text);
  return chars.length <= 1800 ? text : chars.slice(0, 1800).join("");
}
