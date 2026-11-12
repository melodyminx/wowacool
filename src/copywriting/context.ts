import { countChars, truncateChars } from "../util/text.js";

export type MaterialKind = "note" | "file" | "link";

/** 交给免费文本模型的一份项目资料。图片和 PDF 只有说明，没有画面或抽取正文。 */
export interface MaterialSnippet {
  kind: MaterialKind;
  title: string;
  text: string;
  filename?: string;
  url?: string;
  mimeType?: string;
}

export interface SourceEntrySnippet {
  title: string;
  text: string;
  url?: string;
  collectedAt?: string;
}

export interface SourceSnippet {
  name: string;
  entries: SourceEntrySnippet[];
}

export interface ProjectContext {
  name: string;
  positioning: string;
  niche: string;
  audience: string;
  notes: string;
  materials: MaterialSnippet[];
  /** Enabled assistant summaries only. Omitted when the project has no such sources. */
  sources?: SourceSnippet[];
}

const MATERIAL_EXCERPT = 500;
const CONTEXT_BUDGET = 2500;
const SOURCE_BUDGET = 900;
const SOURCE_EXCERPT = 360;

export function contextCanStandAlone(context: ProjectContext | null): boolean {
  if (!context) return false;
  return Boolean(
    context.materials.length ||
      hasSourceText(context) ||
      context.notes.trim() ||
      context.positioning.trim() ||
      context.niche.trim() ||
      context.audience.trim(),
  );
}

export function describeMaterialUse(context: ProjectContext | null): {
  materialsUsed: number;
  materialNote: string | null;
} {
  if (!context) return { materialsUsed: 0, materialNote: null };
  const sources = enabledSourceCount(context);
  if (!context.materials.length && !sources) {
    return {
      materialsUsed: 0,
      materialNote: "这个项目还没有资料。这次只按领域、受众、关键词或想法来写。",
    };
  }
  if (!context.materials.length) {
    return {
      materialsUsed: 0,
      materialNote: `已读 ${sources} 个已启用选题数据源里的助手调研摘要。这个项目还没有上传资料。`,
    };
  }
  const sourceNote = sources ? `，以及 ${sources} 个已启用的选题数据源` : "";
  return {
    materialsUsed: context.materials.length,
    materialNote: `已结合这个项目的 ${context.materials.length} 份资料${sourceNote}。`,
  };
}

/** 把项目资料收成一段提示词。没有资料时也会说明，避免模型假装读过文案。 */
export function renderProjectContext(context: ProjectContext): string {
  const lines = ["项目资料（用来约束选题和文案，不是热榜，也不是打开网页后的正文）："];
  lines.push(`项目：${oneLine(context.name) || "未命名"}`);
  if (context.positioning.trim()) lines.push(`定位：${oneLine(context.positioning)}`);
  if (context.niche.trim()) lines.push(`项目领域：${oneLine(context.niche)}`);
  if (context.audience.trim()) lines.push(`项目受众：${oneLine(context.audience)}`);
  if (context.notes.trim()) lines.push(`项目说明：${truncateChars(context.notes.trim(), MATERIAL_EXCERPT)}`);
  const sourceText = hasSourceText(context);
  if (!context.materials.length && !sourceText) {
    lines.push("这个项目还没有上传资料。不要假装读过产品文案、参考图或链接正文。");
    return lines.join("\n");
  }
  if (!context.materials.length) {
    lines.push("这个项目还没有上传资料。不要假装读过产品文案、参考图或链接正文。");
  }

  let budget = sourceText ? 1600 : CONTEXT_BUDGET;
  let omitted = 0;
  for (let index = 0; index < context.materials.length; index += 1) {
    const block = formatMaterial(context.materials[index], index);
    if (countChars(block) > budget && budget < 80) {
      omitted = context.materials.length - index;
      break;
    }
    const fitted = countChars(block) <= budget ? block : truncateChars(block, Math.max(budget, 0));
    lines.push(fitted);
    budget -= countChars(fitted);
    if (budget <= 0) {
      omitted = context.materials.length - index - 1;
      break;
    }
  }
  if (omitted > 0) lines.push(`其余 ${omitted} 份资料这次没有放进提示词。`);
  const sources = renderSources(context.sources ?? []);
  if (sources) lines.push("", sources);
  return lines.join("\n");
}

function formatMaterial(material: MaterialSnippet, index: number): string {
  const label = material.kind === "note" ? "文字" : material.kind === "link" ? "链接" : "文件";
  const title = oneLine(material.title) || oneLine(material.filename ?? "") || "未命名";
  const lines = [`${index + 1}. [${label}] ${title}`];
  if (material.filename && oneLine(material.filename) !== title) lines.push(`文件名：${oneLine(material.filename)}`);
  if (material.url) lines.push(`链接：${oneLine(material.url)}`);
  if (material.kind === "file" && material.mimeType?.startsWith("image/")) {
    lines.push("参考图。文本模型看不到画面，只能根据文件名和说明来用。");
  } else if (material.kind === "file" && material.mimeType === "application/pdf" && !material.text.trim()) {
    lines.push("PDF 未抽取正文。不要编造文件里的句子。");
  } else if (material.kind === "link") {
    lines.push("这是用户保存的链接，不是打开网页后的正文。");
  }
  if (material.text.trim()) lines.push(truncateChars(material.text.trim(), MATERIAL_EXCERPT));
  return lines.join("\n");
}

function renderSources(sources: SourceSnippet[]): string {
  const usable = sources.filter((source) => source.entries.some((entry) => entry.title.trim() || entry.text.trim()));
  if (!usable.length) return "";
  const lines = ["助手写入的调研摘要（不是热榜，不是官方排名，也没有阅读量或热度）："];
  let budget = SOURCE_BUDGET;
  for (const source of usable) {
    const head = `数据源「${oneLine(source.name) || "未命名"}」`;
    if (countChars(head) > budget) break;
    lines.push(head);
    budget -= countChars(head);
    for (const entry of source.entries) {
      const title = oneLine(entry.title) || "未命名摘要";
      const text = entry.text.trim() ? truncateChars(entry.text.trim(), SOURCE_EXCERPT) : "";
      const block = [`- ${title}`, text, entry.url ? `链接：${oneLine(entry.url)}` : ""].filter(Boolean).join("\n");
      if (countChars(block) > budget && budget < 40) break;
      const fitted = countChars(block) <= budget ? block : truncateChars(block, Math.max(budget, 0));
      lines.push(fitted);
      budget -= countChars(fitted);
      if (budget <= 0) break;
    }
    if (budget <= 0) break;
  }
  return lines.join("\n");
}

function hasSourceText(context: ProjectContext): boolean {
  return enabledSourceCount(context) > 0;
}

function enabledSourceCount(context: ProjectContext): number {
  return (context.sources ?? []).filter((source) => source.entries.some((entry) => entry.title.trim() || entry.text.trim())).length;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
