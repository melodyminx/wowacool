import type { AppConfig } from "../config.js";
import { loadConfig, requireOpenRouterApiKey } from "../config.js";
import { DEFAULT_IMAGE_COUNT } from "../constants.js";
import { fixtureCopy, generateCopy } from "../copywriting/generate.js";
import { writeExportPackage, type ExportResult } from "../export/package.js";
import { createImageProvider } from "../images/factory.js";
import { toImageSpecs } from "../images/provider.js";
import { OpenRouterClient } from "../openrouter/client.js";
import { buildModelRoute } from "../openrouter/router.js";
import { isCatalogFresh, loadCatalog, saveCatalog, saveQuota } from "../openrouter/store.js";
import { approveJob, assertExportable, markPendingReview, rejectJob } from "../review/gate.js";
import type { CopyDraft, Job, QuotaSnapshot } from "../types.js";
import { log } from "../util/log.js";
import { createJob, loadJob, saveJob, writeJobImages } from "./store.js";

export async function refreshCatalog(config = loadConfig()): Promise<{ count: number; ids: string[] }> {
  const key = requireOpenRouterApiKey(config);
  const client = new OpenRouterClient(key);
  const models = await client.refreshFreeTextCatalog();
  saveCatalog(config.paths, models);
  log("info", `已刷新免费文本模型目录，共 ${models.length} 个`);
  return { count: models.length, ids: models.map((m) => m.id) };
}

export async function checkQuota(config = loadConfig()): Promise<QuotaSnapshot> {
  const key = requireOpenRouterApiKey(config);
  const client = new OpenRouterClient(key);
  const snapshot = await client.getQuota();
  saveQuota(config.paths, snapshot);
  log("info", "已查询 OpenRouter 额度", snapshot);
  return snapshot;
}

export async function ensureCatalog(config: AppConfig, force = false) {
  const existing = loadCatalog(config.paths);
  if (!force && existing && isCatalogFresh(existing) && existing.models.length > 0) {
    return existing;
  }
  const key = requireOpenRouterApiKey(config);
  const client = new OpenRouterClient(key);
  const models = await client.refreshFreeTextCatalog();
  return saveCatalog(config.paths, models);
}

export function applyDraftToJob(job: Job, draft: CopyDraft, meta?: { modelUsed?: string; fallbacksOffered?: string[] }): Job {
  return {
    ...job,
    title: draft.title,
    content: draft.content,
    tags: draft.tags,
    imagePrompts: draft.imagePrompts,
    modelUsed: meta?.modelUsed ?? job.modelUsed,
    fallbacksOffered: meta?.fallbacksOffered ?? job.fallbacksOffered,
    status: "draft",
    updatedAt: new Date().toISOString(),
  };
}

export async function draftFromTopic(options: {
  topic: string;
  imageCount?: number;
  skipLlm?: boolean;
  config?: AppConfig;
}): Promise<Job> {
  const config = options.config ?? loadConfig();
  const job = createJob(config.paths, options.topic);
  const imageCount = options.imageCount ?? DEFAULT_IMAGE_COUNT;

  if (options.skipLlm) {
    const draft = fixtureCopy(options.topic, imageCount);
    const next = applyDraftToJob(job, draft, { modelUsed: "fixture/local" });
    saveJob(config.paths, next);
    return next;
  }

  const catalog = await ensureCatalog(config);
  const quota = await checkQuota(config);
  const route = buildModelRoute(catalog.models, { preferredId: config.preferredModel });
  const client = new OpenRouterClient(requireOpenRouterApiKey(config));
  const generated = await generateCopy({
    client,
    route,
    topic: options.topic,
    imageCount,
    catalog: catalog.models,
    quota,
  });
  const next = applyDraftToJob(job, generated.draft, {
    modelUsed: generated.modelUsed,
    fallbacksOffered: generated.fallbacksOffered,
  });
  saveJob(config.paths, next);
  return next;
}

export async function generateImagesForJob(options: {
  jobId: string;
  config?: AppConfig;
}): Promise<Job> {
  const config = options.config ?? loadConfig();
  const job = loadJob(config.paths, options.jobId);
  if (!job.imagePrompts.length) {
    throw new Error("任务还没有出图提示词，请先生成文案草稿。");
  }
  const provider = createImageProvider(config);
  const generated = await provider.generate(toImageSpecs(job.imagePrompts));
  const files = new Map(generated.map((image) => [image.filename, image.bytes]));
  const images = generated.map((image) => ({
    filename: image.filename,
    relativePath: `images/${image.filename}`,
    prompt: image.prompt,
    mimeType: image.mimeType,
    url: null,
  }));
  const withImages = writeJobImages(config.paths, job, images, files);
  const pending = markPendingReview(withImages);
  saveJob(config.paths, pending);
  log("info", `已用 ${provider.id} Provider 生成 ${images.length} 张图，进入待审核`);
  return pending;
}

export function reviewJob(options: {
  jobId: string;
  decision: "approved" | "rejected";
  note?: string;
  config?: AppConfig;
}): Job {
  const config = options.config ?? loadConfig();
  const job = loadJob(config.paths, options.jobId);
  const next =
    options.decision === "approved" ? approveJob(job, options.note) : rejectJob(job, options.note);
  saveJob(config.paths, next);
  return next;
}

export function exportJob(options: { jobId: string; config?: AppConfig }): ExportResult & { job: Job } {
  const config = options.config ?? loadConfig();
  const job = loadJob(config.paths, options.jobId);
  assertExportable(job);
  const result = writeExportPackage(job, config.paths.jobsDir, config.paths.exportsDir);
  const exported: Job = { ...job, status: "exported", updatedAt: new Date().toISOString() };
  saveJob(config.paths, exported);
  log("info", `已导出素材包：${result.exportDir}`);
  return { ...result, job: exported };
}

export async function runLocalPipeline(options: {
  topic: string;
  imageCount?: number;
  skipLlm?: boolean;
  approve?: boolean;
  config?: AppConfig;
}): Promise<{ job: Job; exportResult?: ExportResult }> {
  const config = options.config ?? loadConfig();
  let job = await draftFromTopic({
    topic: options.topic,
    imageCount: options.imageCount,
    skipLlm: options.skipLlm,
    config,
  });
  job = await generateImagesForJob({ jobId: job.id, config });
  if (options.approve) {
    job = reviewJob({ jobId: job.id, decision: "approved", note: "本地 CLI 自动批准（mock 流程）", config });
    const exportResult = exportJob({ jobId: job.id, config });
    return { job: exportResult.job, exportResult };
  }
  return { job };
}
