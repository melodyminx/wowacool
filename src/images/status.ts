import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH, WORKERS_AI_IMAGE_MODEL } from "../constants.js";

export type ImageProviderId = "mock" | "workers_ai" | "openai_compatible";

export interface ImageDescription {
  provider: ImageProviderId;
  ready: boolean;
  model: string | null;
  size: string;
  message: string;
}

const SIZE = `${PORTRAIT_WIDTH}x${PORTRAIT_HEIGHT}`;

export function resolveImageProvider(value: string | undefined): ImageProviderId {
  if (value === "workers_ai" || value === "openai_compatible" || value === "mock") return value;
  return "mock";
}

export function describeImageProvider(input: {
  provider?: string;
  hasAiBinding: boolean;
  model?: string;
  openAiConfigured: boolean;
  openAiModel?: string;
}): ImageDescription {
  const provider = resolveImageProvider(input.provider);
  if (provider === "workers_ai") {
    const model = input.model?.trim() || WORKERS_AI_IMAGE_MODEL;
    if (!input.hasAiBinding) {
      return {
        provider,
        ready: false,
        model,
        size: SIZE,
        message:
          "IMAGE_PROVIDER=workers_ai，但这个 Worker 没有可用的 AI 绑定，所以现在不能出真实图。请保留 wrangler.toml 里的 [ai] binding = \"AI\" 后重新部署。不会改用 Grok 或 Seedance。",
      };
    }
    return {
      provider,
      ready: true,
      model,
      size: SIZE,
      message: `当前出图是 Cloudflare Workers AI 的 ${model}。请求尺寸 ${PORTRAIT_WIDTH}×${PORTRAIT_HEIGHT}（3:4）。若返回的比例不对，会居中裁成 3:4。不使用 Grok 出图，也不使用 Seedance。`,
    };
  }
  if (provider === "openai_compatible") {
    const model = input.openAiModel?.trim() || null;
    if (!input.openAiConfigured) {
      return {
        provider,
        ready: false,
        model,
        size: SIZE,
        message:
          "IMAGE_PROVIDER=openai_compatible，但还没有配齐 IMAGE_GEN_BASE_URL、IMAGE_GEN_API_KEY、IMAGE_GEN_MODEL，因此不会发请求。",
      };
    }
    return {
      provider,
      ready: true,
      model,
      size: SIZE,
      message: `当前出图走已配置的 OpenAI 兼容接口${model ? `（${model}）` : ""}。尺寸按 ${PORTRAIT_WIDTH}×${PORTRAIT_HEIGHT} 请求。不会把 Seedance 或 Grok 当作这个接口。`,
    };
  }
  return {
    provider: "mock",
    ready: true,
    model: null,
    size: SIZE,
    message: "当前是占位图（IMAGE_PROVIDER=mock），不会调用文生图模型。工作台要真实出图时，使用 IMAGE_PROVIDER=workers_ai 和 AI 绑定。",
  };
}
