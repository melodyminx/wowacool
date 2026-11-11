export const PROJECT_NAME = "wowacool";
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const PREFERRED_FREE_MODEL = "liquid/lfm-3-1.7b:free";

/** 对齐官方 xhs.postNote：标题最大 20 字 */
export const TITLE_MAX = 20;
/** 对齐官方 xhs.postNote：正文最大 1000 字 */
export const CONTENT_MAX = 1000;
export const IMAGES_MIN = 1;
export const IMAGES_MAX = 18;
export const DEFAULT_IMAGE_COUNT = 3;

/**
 * 部分免费模型（如 liquid/lfm-3-1.7b:free）reasoning 不可关，
 * 需要留足 max_tokens 才能冒出可见 content。
 */
export const DEFAULT_MAX_TOKENS = 2048;

export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
/** 作为 OpenRouter `models` 回退数组传出的最大条数（不含主模型）。
 *  官方 Anthropic fallbacks 文档写明最多 3 条；chat/completions 对 `models` 同样返回
 *  “'models' array must have 3 items or fewer.”（2026-11-11 实测）。
 *  更长的免费目录改由本地 rotateRoute 继续切换。
 */
export const MAX_FALLBACKS = 3;

export const APP_TITLE = "wowacool";
export const APP_REFERER = "https://localhost/wowacool";
