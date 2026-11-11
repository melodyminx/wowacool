import { CONTENT_MAX, IMAGES_MAX, IMAGES_MIN, TITLE_MAX } from "../constants.js";
import type { MediaInfo, PostNotePayload } from "../types.js";
import { countChars, normalizeTags } from "../util/text.js";
import { validateCopy } from "../copywriting/validate.js";

export const POSTNOTE_CONSTRAINTS = {
  titleMax: TITLE_MAX,
  contentMax: CONTENT_MAX,
  imagesMin: IMAGES_MIN,
  imagesMax: IMAGES_MAX,
} as const;

const ALLOWED_URL = /^(https:\/\/|xhsfile:)/i;

export function isAllowedMediaUrl(url: string): boolean {
  return ALLOWED_URL.test(url);
}

export interface EncodePostNoteInput {
  title?: string;
  content?: string;
  tags?: string;
  imageUrls: string[];
}

/**
 * 纯函数：把审核通过的素材编成官方 xhs.postNote 参数。
 * 不发任何网络请求。标题/正文超限或图片数量/URL 不合规时抛错。
 */
export function encodePostNotePayload(input: EncodePostNoteInput): PostNotePayload {
  const title = input.title?.trim() || undefined;
  const content = input.content?.trim() || undefined;
  const tags = input.tags ? normalizeTags(input.tags) : undefined;
  if (title || content) {
    const issues = validateCopy({
      title: title ?? "占位",
      content: content ?? "占位",
      tags: tags ?? "",
    });
    const relevant = issues.filter((issue) => {
      if (issue.field === "title") return Boolean(title);
      if (issue.field === "content") return Boolean(content);
      return false;
    });
    if (relevant.length > 0) {
      throw new Error(relevant.map((i) => i.message).join("；"));
    }
  }
  if (input.imageUrls.length < IMAGES_MIN || input.imageUrls.length > IMAGES_MAX) {
    throw new Error(`图片数量必须是 ${IMAGES_MIN}–${IMAGES_MAX} 张，收到 ${input.imageUrls.length}`);
  }
  const bad = input.imageUrls.filter((url) => !isAllowedMediaUrl(url));
  if (bad.length > 0) {
    throw new Error(
      `mediaInfo 中的 url 必须是 https:// 或 xhsfile 本地协议，不合规：${bad.slice(0, 3).join(", ")}`,
    );
  }
  const media: MediaInfo = {
    image_resources: input.imageUrls.map((url) => ({ url })),
  };
  const payload: PostNotePayload = {
    mediaInfo: JSON.stringify(media),
  };
  if (title) payload.title = title;
  if (content) payload.content = content;
  if (tags) payload.tags = tags;
  return payload;
}

export function parseMediaInfo(mediaInfo: string): MediaInfo {
  const parsed = JSON.parse(mediaInfo) as MediaInfo;
  if (!parsed || !Array.isArray(parsed.image_resources)) {
    throw new Error("mediaInfo 必须是 { image_resources: [{ url }] }");
  }
  return parsed;
}

export function localXhsfileUrl(jobId: string, filename: string): string {
  return `xhsfile://export/${jobId}/${filename}`;
}

export { countChars, TITLE_MAX, CONTENT_MAX };
