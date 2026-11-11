import type { GeneratedImage, ImageProvider, ImageSpec } from "./provider.js";
import { assertImageCount } from "./provider.js";
import { placeholderPng } from "../util/png.js";

/** 本地占位出图，不调用任何外部 API，也不消耗 Grok Bot 额度 */
export class MockImageProvider implements ImageProvider {
  readonly id = "mock";

  async generate(specs: ImageSpec[]): Promise<GeneratedImage[]> {
    assertImageCount(specs.length);
    return specs.map((spec) => {
      const filename = `${String(spec.index).padStart(2, "0")}.png`;
      return {
        index: spec.index,
        prompt: spec.prompt,
        mimeType: "image/png" as const,
        filename,
        bytes: placeholderPng(spec.index - 1),
        provider: this.id,
      };
    });
  }
}
