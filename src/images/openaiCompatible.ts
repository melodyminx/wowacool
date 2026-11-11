import type { AppConfig } from "../config.js";
import type { GeneratedImage, ImageProvider, ImageSpec } from "./provider.js";
import { assertImageCount } from "./provider.js";

/**
 * OpenAI 兼容文生图接口的占位实现。
 * 用户尚未提供真实文生图调用方式与密钥；未配置时拒绝出图，避免误走付费或错误端点。
 * Seedance 是视频模型，不要作为本 Provider 的实现。
 */
export class OpenAiCompatibleImageProvider implements ImageProvider {
  readonly id = "openai_compatible";

  constructor(private readonly config: AppConfig["imageGen"]) {}

  isConfigured(): boolean {
    return Boolean(this.config?.baseUrl && this.config.apiKey && this.config.model);
  }

  async generate(specs: ImageSpec[]): Promise<GeneratedImage[]> {
    assertImageCount(specs.length);
    if (!this.isConfigured()) {
      throw new Error(
        "文生图 Provider 未配置。请在 .env 中填写 IMAGE_GEN_BASE_URL、IMAGE_GEN_API_KEY、IMAGE_GEN_MODEL 后再切换 IMAGE_PROVIDER=openai_compatible。一期请使用 IMAGE_PROVIDER=mock。Seedance 是视频模型，不能用于图文出图。",
      );
    }
    throw new Error(
      "真实文生图调用约定已预留（OpenAI 兼容 /images/generations），但用户尚未提供已验证的接口与密钥，拒绝发真实请求。请继续使用 mock，或在 docs/INTERFACES.md 约定落实后再实现。",
    );
  }
}
