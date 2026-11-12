import type { ProjectContext } from "./context.js";
import { renderProjectContext } from "./context.js";
import type { FreeModel, ModelRoute, QuotaSnapshot } from "../types.js";
import type { OpenRouterClient } from "../openrouter/client.js";
import { truncateChars } from "../util/text.js";

export interface TopicBrief {
  niche: string;
  audience: string;
  keywords: string;
  idea: string;
}

export interface TopicCandidate {
  title: string;
  angle: string;
  why: string;
  hook: string;
}

const TITLE_MAX = 40;
const ANGLE_MAX = 80;
const WHY_MAX = 140;
const HOOK_MAX = 40;

export const TOPIC_SYSTEM_PROMPT = `你是小红书图文选题编辑。只输出一个 JSON 对象，不要 Markdown，不要解释。
格式：{"topics":[{"title":"","angle":"","why":"","hook":""}]}
规则：
- 给出用户要求的条数，彼此角度不要重复
- title：可直接当作笔记选题，不超过 40 个字
- angle：一句话说明切入角度
- why：为什么可能适合这个受众，不要编造阅读量、排名、热榜或官方数据
- hook：可选的开头一句，不超过 40 个字；没有就空字符串
- 内容健康、具体、可人工改写
- 不要建议抓取小红书，不要建议自动发布，不要建议去评论别人的笔记
- 如果给了项目资料，选题必须贴着资料，不要把资料写成热榜、阅读量或官方排名
- 图片资料只有文件名和说明，不要假装看过画面
- 链接只是用户保存的书签，不要假设你打开过网页`;

export function buildTopicUserPrompt(brief: TopicBrief, count: number, context?: ProjectContext | null): string {
  const lines = [
    `请给出 ${count} 个小红书图文选题。`,
    `领域：${brief.niche || "未指定"}`,
    `受众：${brief.audience || "未指定"}`,
    `关键词：${brief.keywords || "未指定"}`,
    `粗略想法：${brief.idea || "未指定"}`,
  ];
  if (!context) return lines.join("\n");
  lines.push("", renderProjectContext(context), "选题要能对应到项目资料。资料没写的销量、排名和热度不要编。");
  return lines.join("\n");
}

export function clampTopicCount(count: number | undefined): number {
  if (!Number.isInteger(count)) return 6;
  return Math.min(8, Math.max(4, count as number));
}

export async function suggestTopics(options: {
  client: OpenRouterClient;
  route: ModelRoute;
  brief: TopicBrief;
  count?: number;
  catalog?: FreeModel[];
  quota?: QuotaSnapshot;
  context?: ProjectContext | null;
}): Promise<{ topics: TopicCandidate[]; modelUsed: string; fallbacksOffered: string[] }> {
  const count = clampTopicCount(options.count);
  const remaining = options.quota?.freeModelDailyRequests?.remaining;
  if (remaining === 0) {
    throw new Error("免费模型日额度剩余为 0，已停止调用。请稍后或次日再试。");
  }
  const result = await options.client.chat(
    options.route,
    [
      { role: "system", content: TOPIC_SYSTEM_PROMPT },
      { role: "user", content: buildTopicUserPrompt(options.brief, count, options.context) },
    ],
    { catalog: options.catalog, dailyRemaining: remaining, temperature: 0.7 },
  );
  return {
    topics: parseTopicResponse(result.content, count),
    modelUsed: result.modelUsed,
    fallbacksOffered: options.route.models,
  };
}

export function parseTopicResponse(raw: string, count: number): TopicCandidate[] {
  const jsonText = extractJson(raw);
  let parsed: unknown = null;
  if (jsonText) {
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      parsed = null;
    }
  }
  const list = readTopicArray(parsed);
  const topics: TopicCandidate[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = truncateChars(pick(record.title), TITLE_MAX);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    topics.push({
      title,
      angle: truncateChars(pick(record.angle), ANGLE_MAX),
      why: truncateChars(pick(record.why), WHY_MAX),
      hook: truncateChars(pick(record.hook), HOOK_MAX),
    });
    if (topics.length >= count) break;
  }
  if (!topics.length) {
    throw new Error("选题结果里没有可用条目。请换个说法再试，或先使用示例选题。");
  }
  return topics;
}

/** 本地示例，不调用模型，也不假装来自热榜。有项目资料时会把资料名称写进说明。 */
export function fixtureTopics(brief: TopicBrief, count = 6, context?: ProjectContext | null): TopicCandidate[] {
  const total = clampTopicCount(count);
  const material = context?.materials.find((item) => item.title.trim() || item.text.trim());
  const materialLabel = material ? material.title.trim() || truncateChars(material.text.trim(), 18) : "";
  const focus = brief.niche || brief.idea || brief.keywords || materialLabel || context?.name || "这件事";
  const who = brief.audience || context?.audience || "同样在意这件事的人";
  const keyword = brief.keywords ? `关键词「${brief.keywords}」可以写进正文，但不要堆砌。` : "用具体物件代替空泛形容词。";
  const patterns: Array<[string, string, string, string]> = [
    ["先改一处", "从一个最小的动作讲起，而不是罗列完整攻略", `${who}更容易跟着做完，而不是只收藏。`, "先改一处就够了"],
    ["前后对比", "用前后对比说明变化，少讲抽象道理", "看得见的变化更适合配竖图，也更好改。", "以前我总是卡在这一步"],
    ["只解决一件", "只解决一个具体麻烦，方便写标题和出图", "范围窄的选题更好写，也更好配 3 到 6 张图。", "这个麻烦其实可以很小"],
    ["给新手", "写给第一次尝试的人，把步骤说短", `降低门槛，避免把${who}吓跑。`, "第一次做，记住这三步"],
    ["用一周", "用一周的节奏，而不是要求一天做完", "更容易坚持，正文也可以按天分成几张图。", "我给自己定了七天"],
    ["少踩一个坑", "把一个常见误区说清楚，不要吓人", "能帮人少走弯路。不要编造成功率或排名。", "我以前也理解反了"],
    ["小空间", "按小空间或有限条件来写，贴近真实生活", "条件普通也能做，读者更容易对上自己的情况。", "没有大厨房也可以"],
    ["留一张清单", "收尾留一个可回看的短清单，正文仍口语化", `${keyword}`, "收藏前先看这几条"],
  ];
  return patterns.slice(0, total).map(([suffix, angle, why, hook]) => ({
    title: truncateChars(`${focus}${suffix}`, TITLE_MAX),
    angle,
    why: materialLabel ? truncateChars(`资料「${truncateChars(materialLabel, 18)}」。${why}`, WHY_MAX) : why,
    hook,
  }));
}

export function composeJobTopic(candidate: Pick<TopicCandidate, "title" | "angle" | "hook">, max: number): string {
  const parts = [candidate.title.trim()];
  if (candidate.angle.trim()) parts.push(`角度：${candidate.angle.trim()}`);
  if (candidate.hook.trim()) parts.push(`钩子：${candidate.hook.trim()}`);
  return truncateChars(parts.join("。"), max);
}

function readTopicArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const topics = (parsed as { topics?: unknown }).topics;
    if (Array.isArray(topics)) return topics;
  }
  return [];
}

function extractJson(raw: string): string | null {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const arrayStart = candidate.indexOf("[");
  const objectFirst = start >= 0 && (arrayStart < 0 || start < arrayStart);
  if (objectFirst) {
    const end = candidate.lastIndexOf("}");
    if (end > start) return candidate.slice(start, end + 1);
  }
  if (arrayStart >= 0) {
    const end = candidate.lastIndexOf("]");
    if (end > arrayStart) return candidate.slice(arrayStart, end + 1);
  }
  return null;
}

function pick(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
