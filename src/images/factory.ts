import type { AppConfig } from "../config.js";
import { MockImageProvider, type MockImageOptions } from "./mock.js";
import { OpenAiCompatibleImageProvider } from "./openaiCompatible.js";
import type { ImageProvider } from "./provider.js";

export function createImageProvider(
  config: Pick<AppConfig, "imageProvider" | "imageGen">,
  options?: { mock?: MockImageOptions },
): ImageProvider {
  if (config.imageProvider === "openai_compatible") {
    return new OpenAiCompatibleImageProvider(config.imageGen);
  }
  return new MockImageProvider(options?.mock);
}
