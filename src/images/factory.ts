import type { AppConfig } from "../config.js";
import { MockImageProvider, type MockImageOptions } from "./mock.js";
import { OpenAiCompatibleImageProvider } from "./openaiCompatible.js";
import type { ImageProvider } from "./provider.js";
import { WorkersAiImageProvider, type WorkersAiBinding } from "./workersAi.js";

export function createImageProvider(
  config: Pick<AppConfig, "imageProvider" | "imageGen" | "workersAiModel">,
  options?: { mock?: MockImageOptions; ai?: WorkersAiBinding | null },
): ImageProvider {
  if (config.imageProvider === "openai_compatible") {
    return new OpenAiCompatibleImageProvider(config.imageGen);
  }
  if (config.imageProvider === "workers_ai") {
    if (!options?.ai) {
      throw new Error(
        "Workers AI 绑定不存在。请在 wrangler.toml 保留 [ai] binding = \"AI\" 后重新部署。本地 CLI 没有这个绑定，请使用 IMAGE_PROVIDER=mock。",
      );
    }
    return new WorkersAiImageProvider(options.ai, config.workersAiModel);
  }
  return new MockImageProvider(options?.mock);
}
