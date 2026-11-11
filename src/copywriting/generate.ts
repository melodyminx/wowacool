import { DEFAULT_IMAGE_COUNT, IMAGES_MAX, IMAGES_MIN } from "../constants.js";
import type { CopyDraft, FreeModel, ModelRoute, QuotaSnapshot } from "../types.js";
import type { OpenRouterClient } from "../openrouter/client.js";
import { normalizeCopy, validateCopy } from "./validate.js";

const SYSTEM_PROMPT = `你是小红书图文笔记文案助手。只输出一个 JSON 对象，不要输出 Markdown 代码围栏，不要输出解释。
字段：
- title: 中文标题，不超过 20 个字，不要加书名号
- content: 中文正文，不超过 1000 个字，口语化、可直接发布
- tags: 3 到 6 个话题字符串数组，不要带 # 号
- imagePrompts: 中文出图提示词数组，条数等于用户指定的图片数量，每条描述一张竖版 3:4 图片
内容必须健康、实用、无误导。`;

export function buildUserPrompt(topic: string, imageCount: number): string {
  return `选题：${topic}
请为该选题写一篇小红书图文笔记文案，并给出 ${imageCount} 条出图提示词。`;
}

export function parseCopyResponse(raw: string, fallbackTopic: string, imageCount: number): CopyDraft {
  const jsonText = extractJson(raw);
  let parsed: Record<string, unknown> = {};
  if (jsonText) {
    try {
      parsed = JSON.parse(jsonText) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }
  const title =
    pickString(parsed.title) ||
    fallbackTitle(fallbackTopic);
  const content =
    pickString(parsed.content) ||
    stripToPlain(raw) ||
    `${fallbackTopic}的实用小技巧，收藏备用。`;
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : pickString(parsed.tags);
  const prompts = Array.isArray(parsed.imagePrompts)
    ? parsed.imagePrompts.map(String)
    : Array.isArray(parsed.image_prompts)
      ? parsed.image_prompts.map(String)
      : [];
  const draft = normalizeCopy({
    title,
    content,
    tags,
    imagePrompts: ensureImagePrompts(prompts, fallbackTopic, imageCount),
  });
  const issues = validateCopy(draft);
  if (issues.some((i) => i.field === "title" && i.message.includes("不能为空"))) {
    throw new Error(`文案解析失败：${issues.map((i) => i.message).join("；")}。原始输出：${raw.slice(0, 300)}`);
  }
  return draft;
}

export async function generateCopy(options: {
  client: OpenRouterClient;
  route: ModelRoute;
  topic: string;
  imageCount?: number;
  catalog?: FreeModel[];
  quota?: QuotaSnapshot;
}): Promise<{ draft: CopyDraft; modelUsed: string; fallbacksOffered: string[] }> {
  const imageCount = clampImageCount(options.imageCount ?? DEFAULT_IMAGE_COUNT);
  const remaining = options.quota?.freeModelDailyRequests?.remaining;
  if (remaining === 0) {
    throw new Error("免费模型日额度剩余为 0，已停止调用。请稍后或次日再试。");
  }
  const result = await options.client.chat(
    options.route,
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(options.topic, imageCount) },
    ],
    {
      catalog: options.catalog,
      dailyRemaining: remaining,
    },
  );
  const draft = parseCopyResponse(result.content, options.topic, imageCount);
  return {
    draft,
    modelUsed: result.modelUsed,
    fallbacksOffered: options.route.models,
  };
}

export function resolveImageCount(count: number | undefined, fallback = DEFAULT_IMAGE_COUNT): number {
  return clampImageCount(count ?? fallback);
}

export function buildImagePrompts(topic: string, count: number, existing: string[] = []): string[] {
  return ensureImagePrompts(existing, topic, clampImageCount(count));
}

export function fixtureCopy(topic: string, imageCount = DEFAULT_IMAGE_COUNT): CopyDraft {
  const count = clampImageCount(imageCount);
  const prompts = ensureImagePrompts([], topic, count);
  return normalizeCopy({
    title: fallbackTitle(topic),
    content: [
      `${topic}其实不必大动干戈，先从看得见的一处开始。`,
      "第一步：把每天都用的东西留在伸手可及的位置，其余先收进盒子。",
      "第二步：同类物品放一起，贴上简单标签，下次找东西会快很多。",
      "第三步：每周花五分钟做一次复位，桌面就不会再堆成小山。",
      "你更想先整理哪一块？评论区聊聊。",
    ].join("\n"),
    tags: ["桌面整理", "收纳", "生活小技巧", "效率"],
    imagePrompts: prompts,
  });
}

function clampImageCount(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_IMAGE_COUNT;
  return Math.min(IMAGES_MAX, Math.max(IMAGES_MIN, Math.round(n)));
}

function ensureImagePrompts(prompts: string[], topic: string, count: number): string[] {
  const next = prompts.filter(Boolean).slice(0, count);
  while (next.length < count) {
    const i = next.length + 1;
    next.push(`竖版 3:4 照片风，主题「${topic}」，第 ${i} 张，干净明亮，留出可叠加文字的空白，不要出现水印和商标。`);
  }
  return next;
}

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return null;
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fallbackTitle(topic: string): string {
  const base = topic.replace(/\s+/g, "");
  return base.length <= 20 ? base : Array.from(base).slice(0, 20).join("");
}

function stripToPlain(raw: string): string {
  return raw.replace(/```[\s\S]*?```/g, "").trim();
}
