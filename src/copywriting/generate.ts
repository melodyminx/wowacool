import { DEFAULT_IMAGE_COUNT, IMAGES_MAX, IMAGES_MIN, TITLE_MAX } from "../constants.js";
import type { CopyDraft, FreeModel, ModelRoute, QuotaSnapshot } from "../types.js";
import type { OpenRouterClient } from "../openrouter/client.js";
import type { ProjectContext } from "./context.js";
import { renderProjectContext } from "./context.js";
import { normalizeCopy, validateCopy } from "./validate.js";
import { truncateChars } from "../util/text.js";

const SYSTEM_PROMPT = `你是小红书图文笔记文案助手。只输出一个 JSON 对象，不要输出 Markdown 代码围栏，不要输出解释。
字段：
- title: 中文标题，不超过 20 个字，不要加书名号
- content: 中文正文，不超过 1000 个字，口语化、可直接发布
- tags: 3 到 6 个话题字符串数组，不要带 # 号
- imagePrompts: 中文出图提示词数组，条数等于用户指定的图片数量，每条描述一张竖版 3:4 图片
内容必须健康、实用、无误导。如果给了项目资料，文案要贴着资料，不要编造资料里没有的功效、销量或排名。图片资料看不到画面，链接不是网页正文。`;

export function buildUserPrompt(topic: string, imageCount: number, context?: ProjectContext | null): string {
  const base = `选题：${topic}
请为该选题写一篇小红书图文笔记文案，并给出 ${imageCount} 条出图提示词。`;
  if (!context) return base;
  return `${base}\n\n${renderProjectContext(context)}\n文案要贴着这些资料，不要编造资料里没有的功效、销量或排名。`;
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
    `${topicSubject(fallbackTopic)}的实用小技巧，收藏备用。`;
  const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String) : pickString(parsed.tags);
  const prompts = Array.isArray(parsed.imagePrompts)
    ? parsed.imagePrompts.map(String)
    : Array.isArray(parsed.image_prompts)
      ? parsed.image_prompts.map(String)
      : [];
  const subject = topicSubject(fallbackTopic);
  const draft = normalizeCopy({
    title,
    content,
    tags: ensureTagCount(typeof tags === "string" ? tags : Array.isArray(tags) ? tags.join(",") : "", subject),
    imagePrompts: ensureImagePrompts(prompts, subject, imageCount),
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
  context?: ProjectContext | null;
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
      { role: "user", content: buildUserPrompt(options.topic, imageCount, options.context) },
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
  return ensureImagePrompts(existing, topicSubject(topic), clampImageCount(count));
}

export function fixtureCopy(topic: string, imageCount = DEFAULT_IMAGE_COUNT): CopyDraft {
  const count = clampImageCount(imageCount);
  const subject = topicSubject(topic);
  const prompts = ensureImagePrompts([], subject, count);
  return normalizeCopy({
    title: fallbackTitle(topic),
    content: [
      `${subject}其实不必大动干戈，先从看得见的一处开始。`,
      "第一步：把每天都用的东西留在伸手可及的位置，其余先收进盒子。",
      "第二步：同类物品放一起，贴上简单标签，下次找东西会快很多。",
      "第三步：每周花五分钟做一次复位，桌面就不会再堆成小山。",
      "你更想先整理哪一块？评论区聊聊。",
    ].join("\n"),
    tags: ["桌面整理", "收纳", "生活小技巧", "效率"],
    imagePrompts: prompts,
  });
}

/** 生成结果收成 3–6 个话题。人手改过的话题不走这里。 */
export function ensureTagCount(tags: string, topic: string): string {
  const list = tags
    .split(/[,，]/)
    .map((tag) => tag.replace(/^[#＃]+/, "").trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const tag of list) {
    if (!unique.includes(tag)) unique.push(tag);
  }
  const topicTag = truncateChars(topic.replace(/\s+/g, ""), 12);
  for (const extra of [topicTag, "生活记录", "实用分享", "经验笔记"]) {
    if (unique.length >= 3) break;
    if (extra && !unique.includes(extra)) unique.push(extra);
  }
  return unique.slice(0, 6).join(",");
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

function topicSubject(topic: string): string {
  const head = topic.split(/。角度：|。钩子：/)[0] || topic;
  return head.replace(/\s+/g, "");
}

function fallbackTitle(topic: string): string {
  return Array.from(topicSubject(topic)).slice(0, TITLE_MAX).join("");
}

function stripToPlain(raw: string): string {
  return raw.replace(/```[\s\S]*?```/g, "").trim();
}
