import { CONTENT_MAX, TITLE_MAX } from "../constants.js";
import type { CopyDraft } from "../types.js";
import { countChars, normalizeTags, truncateChars } from "../util/text.js";

export interface ValidationIssue {
  field: "title" | "content" | "tags" | "imagePrompts";
  message: string;
}

export function validateCopy(
  draft: Pick<CopyDraft, "title" | "content" | "tags">,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const titleLen = countChars(draft.title);
  const contentLen = countChars(draft.content);
  if (!draft.title.trim()) issues.push({ field: "title", message: "标题不能为空" });
  if (titleLen > TITLE_MAX) {
    issues.push({ field: "title", message: `标题超过 ${TITLE_MAX} 字（当前 ${titleLen}）` });
  }
  if (!draft.content.trim()) issues.push({ field: "content", message: "正文不能为空" });
  if (contentLen > CONTENT_MAX) {
    issues.push({
      field: "content",
      message: `正文超过 ${CONTENT_MAX} 字（当前 ${contentLen}）`,
    });
  }
  return issues;
}

export function normalizeCopy(input: {
  title: string;
  content: string;
  tags: string | string[];
  imagePrompts?: string[];
}): CopyDraft {
  const title = truncateChars(input.title.trim(), TITLE_MAX);
  const content = truncateChars(input.content.trim(), CONTENT_MAX);
  const tags = normalizeTags(input.tags);
  const imagePrompts = (input.imagePrompts ?? [])
    .map((p) => p.trim())
    .filter(Boolean);
  return { title, content, tags, imagePrompts };
}
