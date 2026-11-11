import { PREFERRED_FREE_MODEL } from "./constants.js";
import { loadProjectEnv } from "./util/env.js";
import { findProjectRoot, resolveDataPaths, type DataPaths } from "./util/paths.js";

export interface AppConfig {
  projectRoot: string;
  paths: DataPaths;
  openRouterApiKey?: string;
  preferredModel: string;
  imageProvider: "mock" | "openai_compatible";
  imageGen?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    path?: string;
  };
}

export function loadConfig(): AppConfig {
  const projectRoot = findProjectRoot();
  loadProjectEnv(projectRoot);
  const imageProvider =
    process.env.IMAGE_PROVIDER === "openai_compatible" ? "openai_compatible" : "mock";
  return {
    projectRoot,
    paths: resolveDataPaths(projectRoot),
    openRouterApiKey: process.env.OPENROUTER_API_KEY || undefined,
    preferredModel: process.env.OPENROUTER_PREFERRED_MODEL || PREFERRED_FREE_MODEL,
    imageProvider,
    imageGen: {
      baseUrl: process.env.IMAGE_GEN_BASE_URL,
      apiKey: process.env.IMAGE_GEN_API_KEY,
      model: process.env.IMAGE_GEN_MODEL,
      path: process.env.IMAGE_GEN_PATH || "/images/generations",
    },
  };
}

export function requireOpenRouterApiKey(config = loadConfig()): string {
  if (!config.openRouterApiKey) {
    throw new Error(
      "缺少 OPENROUTER_API_KEY。请复制 .env.example 为 .env 并填入 Key，或在环境变量中提供。不要把 Key 发到聊天或写入仓库。",
    );
  }
  return config.openRouterApiKey;
}
