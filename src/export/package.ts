import { mkdirSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { Job, PostNotePayload } from "../types.js";
import { assertExportable } from "../review/gate.js";
import { encodePostNotePayload, localXhsfileUrl, parseMediaInfo, POSTNOTE_CONSTRAINTS } from "./postNote.js";
import { nowIso } from "../util/id.js";

export interface ExportManifest {
  version: 1;
  platform: "xiaohongshu";
  kind: "image-text";
  jobId: string;
  topic: string;
  status: "approved" | "exported";
  exportedAt: string;
  constraints: typeof POSTNOTE_CONSTRAINTS;
  /** 与官方 xhs.postNote 参数对齐 */
  postNote: PostNotePayload;
  assets: {
    images: Array<{
      filename: string;
      relativePath: string;
      prompt: string;
      url: string;
    }>;
  };
  publishReady: boolean;
  notes: string[];
}

export interface ExportResult {
  exportDir: string;
  manifestPath: string;
  postNotePath: string;
  manifest: ExportManifest;
}

export function buildExportManifest(job: Job, imageUrlResolver?: (filename: string) => string): ExportManifest {
  assertExportable(job);
  const images = job.images.map((image) => {
    const url =
      (image.url && image.url.length > 0 ? image.url : undefined) ||
      imageUrlResolver?.(image.filename) ||
      localXhsfileUrl(job.id, image.filename);
    return {
      filename: image.filename,
      relativePath: `images/${image.filename}`,
      prompt: image.prompt,
      url,
    };
  });
  const postNote = encodePostNotePayload({
    title: job.title,
    content: job.content,
    tags: job.tags,
    imageUrls: images.map((image) => image.url),
  });
  const httpsOrXhs = images.every((image) => /^(https:\/\/|xhsfile:)/i.test(image.url));
  const notes = [
    "本素材包只用于人工审核后导出，不自动发布。",
    "若要辅助发布，只能在小红书小程序/小组件环境中唤起官方 xhs.postNote，由用户自己点发布。",
    "网络图需使用 https，且建议响应头 content-disposition: inline。",
    "开放平台 write_notes 仍在规划中，本期不以开放平台代发。",
  ];
  if (images.some((image) => image.url.startsWith("xhsfile://export/"))) {
    notes.push(
      "当前图片 URL 使用本地导出约定 xhsfile://export/<jobId>/<filename>，真正唤起发布前需替换为可访问的 https 或小红书本地 xhsfile 资源。",
    );
  }
  return {
    version: 1,
    platform: "xiaohongshu",
    kind: "image-text",
    jobId: job.id,
    topic: job.topic,
    status: "approved",
    exportedAt: nowIso(),
    constraints: POSTNOTE_CONSTRAINTS,
    postNote,
    assets: { images },
    publishReady: httpsOrXhs && !images.some((image) => image.url.startsWith("xhsfile://export/")),
    notes,
  };
}

export function renderImagePrompts(job: Job): string {
  const prompts = job.images.map((image, i) => `${i + 1}. ${image.filename}: ${image.prompt}`).join("\n");
  return `${prompts}\n`;
}

export function renderExportReadme(job: Job, notes: string[]): string {
  return [
    "小红书图文素材包（一期导出）",
    `任务：${job.id}`,
    `选题：${job.topic}`,
    "",
    "文件说明：",
    "- manifest.json  完整清单，postNote 字段对齐官方唤起参数",
    "- postnote.json  仅含 title / content / mediaInfo / tags",
    "- images/        待发布图片（1–18 张）",
    "- image-prompts.txt 每张图的出图提示词",
    "",
    ...notes,
    "",
  ].join("\n");
}

export function writeExportPackage(job: Job, jobsDir: string, exportsDir: string): ExportResult {
  const manifest = buildExportManifest(job);
  const exportDir = resolve(exportsDir, job.id);
  const imagesDir = resolve(exportDir, "images");
  mkdirSync(imagesDir, { recursive: true });

  for (const image of job.images) {
    const source = resolve(jobsDir, job.id, image.relativePath);
    if (!existsSync(source)) {
      throw new Error(`找不到任务图片：${source}`);
    }
    copyFileSync(source, resolve(imagesDir, basename(image.filename)));
  }

  writeFileSync(resolve(exportDir, "image-prompts.txt"), renderImagePrompts(job), "utf8");

  const manifestPath = resolve(exportDir, "manifest.json");
  const postNotePath = resolve(exportDir, "postnote.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(postNotePath, `${JSON.stringify(manifest.postNote, null, 2)}\n`, "utf8");
  writeFileSync(resolve(exportDir, "README.txt"), renderExportReadme(job, manifest.notes), "utf8");

  return { exportDir, manifestPath, postNotePath, manifest };
}

export function encodeApprovedPackage(manifest: ExportManifest): PostNotePayload {
  if (manifest.status !== "approved" && manifest.status !== "exported") {
    throw new Error("只有审核通过的素材包才能编码为 postNote 参数。");
  }
  const media = parseMediaInfo(manifest.postNote.mediaInfo);
  return encodePostNotePayload({
    title: manifest.postNote.title,
    content: manifest.postNote.content,
    tags: manifest.postNote.tags,
    imageUrls: media.image_resources.map((item) => item.url),
  });
}
