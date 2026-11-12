import { CONTENT_MAX, IMAGES_MAX, IMAGES_MIN, PREFERRED_FREE_MODEL, TITLE_MAX, TOPIC_MAX, WORKERS_AI_IMAGE_MODEL } from "../constants.js";
import { contextCanStandAlone, describeMaterialUse, type ProjectContext } from "../copywriting/context.js";
import { buildImagePrompts, fixtureCopy, generateCopy, resolveImageCount } from "../copywriting/generate.js";
import { clampTopicCount, fixtureTopics, suggestTopics, type TopicBrief } from "../copywriting/topics.js";
import { buildExportManifest, renderExportReadme, renderImagePrompts } from "../export/package.js";
import { encodePostNotePayload, localXhsfileUrl } from "../export/postNote.js";
import { createImageProvider } from "../images/factory.js";
import { toImageSpecs } from "../images/provider.js";
import { describeImageProvider, resolveImageProvider, type ImageDescription } from "../images/status.js";
import type { WorkersAiBinding } from "../images/workersAi.js";
import { OpenRouterClient } from "../openrouter/client.js";
import { buildModelRoute } from "../openrouter/router.js";
import { isCatalogFresh } from "../openrouter/store.js";
import { approveJob, assertExportable, rejectJob, ReviewGateError } from "../review/gate.js";
import type { FreeModel, Job, PostNotePayload, QuotaSnapshot } from "../types.js";
import { redactSecrets } from "../util/env.js";
import { nowIso } from "../util/id.js";
import { countChars, normalizeTags } from "../util/text.js";
import { accessToken, optionalSecret } from "./auth.js";
import { HttpError, json, optionalString, readJson, requirePlatform, assertId } from "./http.js";
import { getProject, loadProjectContext } from "./projects.js";
import {
  addImages,
  createJob,
  deleteImage,
  duplicateJob,
  getImageAsset,
  getJob,
  latestQuota,
  listJobs,
  loadCatalog,
  markExported,
  reorderImages,
  replaceCatalog,
  replaceImages,
  swapImage,
  saveCopy,
  saveEdits,
  saveQuota,
  saveReview,
  type ImageSource,
  type StoredJob,
} from "./repo.js";
import { zipStore } from "./zip.js";

const MISSING_KEY =
  "还没有配置 OPENROUTER_API_KEY。在部署环境执行 npx wrangler secret put OPENROUTER_API_KEY 后再生成文案。不会改用付费模型。你可以先使用示例文案，把配图、审核和导出走完。";
const MISSING_KEY_TOPICS =
  "还没有配置 OPENROUTER_API_KEY。在部署环境执行 npx wrangler secret put OPENROUTER_API_KEY 后再推荐选题。不会改用付费模型。你可以先使用示例选题。";
const QUOTA_EMPTY =
  "免费模型今日额度已用完，已停止生成，不会改用付费模型。请明天再试，或先使用示例文案完成这条任务。";
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export async function listJobsResponse(request: Request, env: Env): Promise<Response> {
  const { db } = requirePlatform(env);
  const url = new URL(request.url);
  const unassigned = url.searchParams.get("unassigned") === "1";
  const rawProject = url.searchParams.get("projectId");
  const projectId = !unassigned && rawProject ? assertId(rawProject, "项目") : undefined;
  const jobs = await listJobs(db, { unassigned, projectId });
  return json({ ok: true, jobs });
}

export async function createJobResponse(request: Request, env: Env): Promise<Response> {
  const { db } = requirePlatform(env);
  const body = await readJson(request);
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  if (!topic) throw new HttpError(400, "请先写一个选题", "missing_topic");
  if (countChars(topic) > TOPIC_MAX) throw new HttpError(400, `选题请控制在 ${TOPIC_MAX} 字以内`, "topic_too_long");
  const projectId = readProjectId(body.projectId);
  if (projectId) {
    const project = await getProject(db, projectId);
    if (!project) throw new HttpError(404, "找不到这个项目", "not_found");
    if (project.archived) throw new HttpError(409, "这个项目已归档。先取消归档，再在里面创建任务。", "project_archived");
  }
  const job = await createJob(db, topic, projectId);
  return json({ ok: true, job: presentJob(job, originOf(request)) }, 201);
}

export async function getJobResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db } = requirePlatform(env);
  const job = await requireJob(db, id);
  return json({ ok: true, job: presentJob(job, originOf(request)) });
}

function assertMutable(job: StoredJob): void {
  if (job.status === "exported") {
    throw new HttpError(409, "这条任务已经导出。要修改，请复制为新任务后再编辑。", "exported_locked");
  }
}

export async function patchJobResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db } = requirePlatform(env);
  const job = await requireJob(db, id);
  assertMutable(job);
  const body = await readJson(request);
  const title = optionalString(body.title, 80, "标题") ?? job.title;
  const content = optionalString(body.content, 2000, "正文") ?? job.content;
  if (countChars(title) > TITLE_MAX) {
    throw new HttpError(400, `标题最多 ${TITLE_MAX} 字，当前 ${countChars(title)} 字`, "title_too_long");
  }
  if (countChars(content) > CONTENT_MAX) {
    throw new HttpError(400, `正文最多 ${CONTENT_MAX} 字，当前 ${countChars(content)} 字`, "content_too_long");
  }
  const tags = body.tags === undefined ? job.tags : normalizeTags(typeof body.tags === "string" ? body.tags : "");
  if (typeof body.tags === "string" && countChars(tags) > 300) {
    throw new HttpError(400, "话题太长了，请删掉一些", "tags_too_long");
  }
  let imagePrompts: string[] | undefined;
  if (body.imagePrompts !== undefined) {
    if (!Array.isArray(body.imagePrompts)) throw new HttpError(400, "出图提示词需要是数组", "bad_prompts");
    imagePrompts = body.imagePrompts.map((item, index) => {
      if (typeof item !== "string") throw new HttpError(400, `第 ${index + 1} 条提示词不正确`, "bad_prompts");
      const prompt = item.trim();
      if (countChars(prompt) > 500) throw new HttpError(400, "单条出图提示词请控制在 500 字以内", "prompt_too_long");
      return prompt;
    }).filter(Boolean);
    if (imagePrompts.length > IMAGES_MAX) {
      throw new HttpError(400, `出图提示词最多 ${IMAGES_MAX} 条`, "too_many_prompts");
    }
  }
  await saveEdits(db, job, { title, content, tags, imagePrompts });
  const next = await requireJob(db, id);
  return json({
    ok: true,
    job: presentJob(next, originOf(request)),
    reviewReset: job.status === "approved" && next.status !== "approved",
  });
}

export async function draftResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db } = requirePlatform(env);
  const job = await requireJob(db, id);
  assertMutable(job);
  const body = await readJson(request);
  const imageCount = resolveImageCount(
    typeof body.imageCount === "number" ? body.imageCount : undefined,
    job.imagePrompts.length || job.images.length || undefined,
  );
  const context = await loadProjectContext(db, job.projectId);
  const usage = describeMaterialUse(context);
  if (body.fixture === true) {
    const draft = fixtureCopy(job.topic, imageCount);
    await saveCopy(db, job, draft, { modelUsed: "fixture/local", fallbacks: [] });
    const next = await requireJob(db, id);
    return json({ ok: true, job: presentJob(next, originOf(request)), fixture: true, ...usage });
  }

  try {
    const prepared = await prepareFreeText(env, db, MISSING_KEY);
    const generated = await generateCopy({
      client: prepared.client,
      route: prepared.route,
      topic: job.topic,
      imageCount,
      catalog: prepared.models,
      quota: prepared.quota,
      context,
    });
    await saveCopy(db, job, generated.draft, {
      modelUsed: generated.modelUsed,
      fallbacks: generated.fallbacksOffered,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw copyFailure(error);
  }
  const next = await requireJob(db, id);
  return json({ ok: true, job: presentJob(next, originOf(request)), fixture: false, ...usage });
}

export async function topicsResponse(request: Request, env: Env): Promise<Response> {
  const { db } = requirePlatform(env);
  const body = await readJson(request);
  const grounded = await readTopicContext(db, body.projectId);
  const brief = readBrief(body, contextCanStandAlone(grounded.context));
  const count = clampTopicCount(typeof body.count === "number" ? body.count : undefined);
  const usage = describeMaterialUse(grounded.context);
  if (body.fixture === true) {
    return json({
      ok: true,
      fixture: true,
      topics: fixtureTopics(brief, count, grounded.context),
      modelUsed: "fixture/local",
      fallbacksOffered: [],
      projectId: grounded.projectId,
      ...usage,
    });
  }
  try {
    const prepared = await prepareFreeText(env, db, MISSING_KEY_TOPICS);
    const suggested = await suggestTopics({
      client: prepared.client,
      route: prepared.route,
      brief,
      count,
      catalog: prepared.models,
      quota: prepared.quota,
      context: grounded.context,
    });
    return json({
      ok: true,
      fixture: false,
      topics: suggested.topics,
      modelUsed: suggested.modelUsed,
      fallbacksOffered: suggested.fallbacksOffered,
      projectId: grounded.projectId,
      ...usage,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw topicFailure(error);
  }
}

export async function generateImagesResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db, bucket } = requirePlatform(env);
  const job = await requireJob(db, id);
  assertMutable(job);
  const body = await readJson(request);
  const redrawIndex = readRedrawIndex(body.index, job.images.length);
  if ((redrawIndex ? true : job.images.length > 0) && body.replace !== true) {
    const message = redrawIndex
      ? `重画会替换第 ${redrawIndex} 张图片，确认后才会继续。`
      : "当前已有图片。重新生成会替换它们，确认后才会继续。";
    throw new HttpError(409, message, "confirm_replace");
  }
  const count = resolveImageCount(
    typeof body.count === "number" ? body.count : undefined,
    job.imagePrompts.length || job.images.length || undefined,
  );
  const prompts = buildImagePrompts(
    job.topic,
    redrawIndex ? Math.max(count, job.images.length, redrawIndex) : count,
    job.imagePrompts.length ? job.imagePrompts : job.images.map((image) => image.prompt),
  );
  const provider = openImageProvider(env);
  const specs = redrawIndex
    ? [{ prompt: prompts[redrawIndex - 1] || job.images[redrawIndex - 1]?.prompt || job.topic, index: redrawIndex }]
    : toImageSpecs(prompts);
  let generated;
  try {
    generated = await provider.generate(specs);
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "出图失败");
    throw new HttpError(400, message, "image_failed");
  }
  const source = imageSourceOf(provider.id);
  const incoming = generated.map((image) => ({
    filename: image.filename,
    prompt: image.prompt,
    bytes: new Uint8Array(image.bytes),
    mimeType: image.mimeType,
    source,
  }));
  if (redrawIndex) {
    const target = job.images[redrawIndex - 1];
    if (!target || !incoming[0]) throw new HttpError(400, "要重画的图片不存在", "bad_index");
    await swapImage(db, bucket, job, target.id, incoming[0]);
  } else {
    await replaceImages(db, bucket, job, incoming);
  }
  const next = await requireJob(db, id);
  return json({ ok: true, job: presentJob(next, originOf(request)), provider: provider.id, image: describeImages(env) });
}

export async function uploadImagesResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db, bucket } = requirePlatform(env);
  const job = await requireJob(db, id);
  assertMutable(job);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 20 * 1024 * 1024) {
    throw new HttpError(413, "这次上传太大了，请分几次传", "body_too_large");
  }
  const form = await request.formData();
  const files = form.getAll("file").filter((item): item is File => item instanceof File);
  if (!files.length) throw new HttpError(400, "请选择图片文件", "missing_file");
  if (job.images.length + files.length > IMAGES_MAX) {
    throw new HttpError(400, `图片需要 ${IMAGES_MIN}–${IMAGES_MAX} 张，加上这次会超出`, "too_many_images");
  }
  const incoming = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_FILE_BYTES) throw new HttpError(413, "单张图片请小于 4MB", "file_too_large");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImage(bytes);
    if (!mime) throw new HttpError(400, "只接收 PNG、JPEG、WEBP 或 GIF", "bad_image");
    const order = job.images.length + index + 1;
    incoming.push({
      filename: `${String(order).padStart(2, "0")}-${safeStem(file.name)}.${extFor(mime)}`,
      prompt: "用户上传",
      bytes,
      mimeType: mime,
      source: "upload" as const,
    });
  }
  await addImages(db, bucket, job, incoming);
  const next = await requireJob(db, id);
  return json({ ok: true, job: presentJob(next, originOf(request)) });
}

export async function reorderResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db } = requirePlatform(env);
  const job = await requireJob(db, id);
  assertMutable(job);
  const body = await readJson(request);
  if (!Array.isArray(body.ids) || body.ids.some((item) => typeof item !== "string")) {
    throw new HttpError(400, "请提供图片 id 列表", "bad_order");
  }
  await reorderImages(db, job, body.ids);
  const next = await requireJob(db, id);
  return json({ ok: true, job: presentJob(next, originOf(request)) });
}

export async function deleteImageResponse(env: Env, id: string, assetId: string, request: Request): Promise<Response> {
  const { db, bucket } = requirePlatform(env);
  const job = await requireJob(db, id);
  assertMutable(job);
  await deleteImage(db, bucket, job, assetId);
  const next = await requireJob(db, id);
  return json({ ok: true, job: presentJob(next, originOf(request)) });
}

export async function imageResponse(env: Env, id: string, assetId: string): Promise<Response> {
  const { db, bucket } = requirePlatform(env);
  const asset = await getImageAsset(db, id, assetId);
  if (!asset?.r2_key) throw new HttpError(404, "找不到这张图片", "not_found");
  const object = await bucket.get(asset.r2_key);
  if (!object) throw new HttpError(404, "图片文件不在了，请重新上传或生成", "missing_object");
  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType || mimeOf(asset.filename));
  headers.set("content-disposition", `inline; filename="${asset.filename.replace(/"/g, "")}"`);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

export async function reviewResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db } = requirePlatform(env);
  const job = await requireJob(db, id);
  assertMutable(job);
  const body = await readJson(request);
  const decision = body.decision === "approved" || body.decision === "rejected" ? body.decision : "";
  if (!decision) throw new HttpError(400, "请选择批准或驳回", "bad_decision");
  const note = optionalString(body.note, 500, "审核说明")?.trim();
  if (decision === "rejected" && !note) throw new HttpError(400, "驳回时请写明原因，方便下一轮修改。", "note_required");
  let next: Job;
  try {
    next = decision === "approved" ? approveJob(toGateJob(job), note) : rejectJob(toGateJob(job), note);
  } catch (error) {
    if (error instanceof ReviewGateError) throw new HttpError(409, error.message, "review_blocked");
    throw error;
  }
  await saveReview(db, { ...job, status: next.status, review: next.review, updatedAt: next.updatedAt });
  const saved = await requireJob(db, id);
  return json({ ok: true, job: presentJob(saved, originOf(request)) });
}

export async function exportResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db, bucket } = requirePlatform(env);
  const job = await requireJob(db, id);
  try {
    assertExportable(toGateJob(job));
  } catch (error) {
    if (error instanceof ReviewGateError) throw new HttpError(409, error.message, "export_blocked");
    throw error;
  }
  const origin = originOf(request);
  const absolute = {
    ...job,
    images: job.images.map((image) => ({
      ...image,
      url: publishImageUrl(origin, job.id, image),
    })),
  };
  const manifest = buildExportManifest(absolute);
  if (accessToken(env)) {
    manifest.publishReady = false;
    manifest.notes.push(
      "当前运营台已设置访问口令，图片链接需要口令才能打开。唤起小红书发布前，请换成可公开访问的 https 图片。",
    );
  }
  const encoder = new TextEncoder();
  const files: Array<{ name: string; data: Uint8Array }> = [
    { name: "manifest.json", data: encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`) },
    { name: "postnote.json", data: encoder.encode(`${JSON.stringify(manifest.postNote, null, 2)}\n`) },
    { name: "README.txt", data: encoder.encode(renderExportReadme(job, manifest.notes)) },
    { name: "image-prompts.txt", data: encoder.encode(renderImagePrompts(absolute)) },
  ];
  const used = new Set<string>();
  for (const image of job.images) {
    if (!image.r2Key) throw new HttpError(500, "图片文件缺失，请重新生成或上传", "missing_object");
    const object = await bucket.get(image.r2Key);
    if (!object) throw new HttpError(500, "图片文件缺失，请重新生成或上传", "missing_object");
    let filename = image.filename;
    if (used.has(filename)) filename = `${used.size + 1}-${filename}`;
    used.add(filename);
    files.push({ name: `images/${filename}`, data: new Uint8Array(await object.arrayBuffer()) });
  }
  const zip = zipStore(files);
  const prefix = `jobs/${job.id}/export`;
  await bucket.put(`${prefix}/manifest.json`, files[0].data, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await bucket.put(`${prefix}/postnote.json`, files[1].data, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  await bucket.put(`${prefix}/README.txt`, files[2].data, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  await bucket.put(`${prefix}/image-prompts.txt`, files[3].data, {
    httpMetadata: { contentType: "text/plain; charset=utf-8" },
  });
  await bucket.put(`${prefix}/package.zip`, zip, { httpMetadata: { contentType: "application/zip" } });
  const exportedAt = nowIso();
  await markExported(db, job.id, exportedAt);
  const saved = await requireJob(db, id);
  return json({
    ok: true,
    job: presentJob(saved, origin),
    manifest,
    postNote: manifest.postNote,
    downloadUrl: `/jobs/${job.id}/package`,
  });
}

export async function packageResponse(env: Env, id: string): Promise<Response> {
  const { db, bucket } = requirePlatform(env);
  await requireJob(db, id);
  const object = await bucket.get(`jobs/${id}/export/package.zip`);
  if (!object) throw new HttpError(404, "还没有素材包。请先批准，再导出。", "package_missing");
  const headers = new Headers();
  headers.set("content-type", "application/zip");
  headers.set("content-disposition", `attachment; filename="wowacool-${id}.zip"`);
  headers.set("cache-control", "no-store");
  return new Response(object.body, { headers });
}

export async function duplicateResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db, bucket } = requirePlatform(env);
  const job = await requireJob(db, id);
  const copy = await duplicateJob(db, bucket, job);
  return json({ ok: true, job: presentJob(copy, originOf(request)) }, 201);
}

export async function quotaResponse(env: Env): Promise<Response> {
  const { db } = requirePlatform(env);
  const cached = await latestQuota(db);
  const key = optionalSecret(env, "OPENROUTER_API_KEY");
  if (!key) {
    return json({
      ok: true,
      configured: false,
      fresh: false,
      quota: cached,
      message: MISSING_KEY,
      image: describeImages(env),
    });
  }
  try {
    const quota = await new OpenRouterClient(key).getQuota();
    await saveQuota(db, quota);
    return json({ ok: true, configured: true, fresh: true, quota, message: quotaMessage(quota), image: describeImages(env) });
  } catch (error) {
    const message = redactSecrets(error instanceof Error ? error.message : "额度查询失败");
    return json({ ok: true, configured: true, fresh: false, quota: cached, message, image: describeImages(env) });
  }
}

export async function catalogResponse(env: Env): Promise<Response> {
  const { db } = requirePlatform(env);
  const catalog = await loadCatalog(db);
  return json({ ok: true, ...catalogView(catalog, env) });
}

export async function refreshCatalogResponse(env: Env): Promise<Response> {
  const { db } = requirePlatform(env);
  const key = optionalSecret(env, "OPENROUTER_API_KEY");
  if (!key) throw new HttpError(400, MISSING_KEY, "missing_api_key");
  try {
    const models = await new OpenRouterClient(key).refreshFreeTextCatalog();
    const refreshedAt = nowIso();
    await replaceCatalog(db, models, refreshedAt);
    return json({ ok: true, ...catalogView({ refreshedAt, models }, env) });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, redactSecrets(error instanceof Error ? error.message : "模型目录刷新失败"), "catalog_failed");
  }
}

async function prepareFreeText(env: Env, db: D1Database, missingKey: string) {
  const key = optionalSecret(env, "OPENROUTER_API_KEY");
  if (!key) throw new HttpError(400, missingKey, "missing_api_key");
  const client = new OpenRouterClient(key);
  const models = await ensureModels(db, client);
  const quota = await client.getQuota();
  await saveQuota(db, quota);
  if (quota.freeModelDailyRequests?.remaining === 0) {
    throw new HttpError(429, QUOTA_EMPTY, "quota_exhausted");
  }
  const route = buildModelRoute(models, { preferredId: preferredModel(env) });
  return { client, models, quota, route };
}

function readBrief(body: Record<string, unknown>, allowEmpty = false): TopicBrief {
  const niche = optionalString(body.niche, 40, "领域")?.trim() ?? "";
  const audience = optionalString(body.audience, 40, "受众")?.trim() ?? "";
  const keywords = optionalString(body.keywords, 80, "关键词")?.trim() ?? "";
  const idea = optionalString(body.idea, 200, "想法")?.trim() ?? "";
  if (!allowEmpty && !niche && !audience && !keywords && !idea) {
    throw new HttpError(400, "请先写领域、受众、关键词，或一个粗略想法", "missing_brief");
  }
  return { niche, audience, keywords, idea };
}

function readProjectId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new HttpError(400, "项目不正确", "bad_id");
  return assertId(value, "项目");
}

async function readTopicContext(
  db: D1Database,
  value: unknown,
): Promise<{ projectId: string | null; context: ProjectContext | null }> {
  const projectId = readProjectId(value);
  if (!projectId) return { projectId: null, context: null };
  const project = await getProject(db, projectId);
  if (!project) throw new HttpError(404, "找不到这个项目", "not_found");
  return { projectId, context: await loadProjectContext(db, projectId) };
}

function readRedrawIndex(value: unknown, imageCount: number): number | null {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > imageCount) {
    throw new HttpError(400, "要重画的图片不存在", "bad_index");
  }
  return value;
}

export function describeImages(env: Env): ImageDescription {
  const provider = resolveImageProvider(env.IMAGE_PROVIDER);
  const openAiModel = optionalSecret(env, "IMAGE_GEN_MODEL");
  return describeImageProvider({
    provider,
    hasAiBinding: aiBinding(env) !== null,
    model: optionalSecret(env, "WORKERS_AI_IMAGE_MODEL") || WORKERS_AI_IMAGE_MODEL,
    openAiConfigured: Boolean(optionalSecret(env, "IMAGE_GEN_BASE_URL") && optionalSecret(env, "IMAGE_GEN_API_KEY") && openAiModel),
    openAiModel,
  });
}

function openImageProvider(env: Env) {
  const provider = resolveImageProvider(env.IMAGE_PROVIDER);
  return createImageProvider(
    {
      imageProvider: provider,
      workersAiModel: optionalSecret(env, "WORKERS_AI_IMAGE_MODEL") || WORKERS_AI_IMAGE_MODEL,
      imageGen: {
        baseUrl: optionalSecret(env, "IMAGE_GEN_BASE_URL"),
        apiKey: optionalSecret(env, "IMAGE_GEN_API_KEY"),
        model: optionalSecret(env, "IMAGE_GEN_MODEL"),
        path: optionalSecret(env, "IMAGE_GEN_PATH") || "/images/generations",
      },
    },
    { mock: { width: 120, height: 160 }, ai: aiBinding(env) },
  );
}

function aiBinding(env: Env): WorkersAiBinding | null {
  if (!("AI" in env)) return null;
  const ai = Reflect.get(env, "AI");
  if (typeof ai !== "object" || ai === null || typeof Reflect.get(ai, "run") !== "function") return null;
  return ai as WorkersAiBinding;
}

function imageSourceOf(providerId: string): ImageSource {
  if (providerId === "workers_ai" || providerId === "openai_compatible" || providerId === "mock") return providerId;
  return "mock";
}

function topicFailure(error: unknown): HttpError {
  const message = redactSecrets(error instanceof Error ? error.message : "选题推荐失败");
  if (message.includes("额度") || /daily|free model|free-model/i.test(message)) {
    return new HttpError(429, message.includes("额度") ? message : QUOTA_EMPTY, "quota_exhausted");
  }
  return new HttpError(502, message, "topics_failed");
}

async function ensureModels(db: D1Database, client: OpenRouterClient): Promise<FreeModel[]> {
  const existing = await loadCatalog(db);
  if (existing && isCatalogFresh(existing) && existing.models.length > 0) return existing.models;
  try {
    const models = await client.refreshFreeTextCatalog();
    await replaceCatalog(db, models, nowIso());
    return models;
  } catch (error) {
    if (existing && existing.models.length > 0) return existing.models;
    throw error;
  }
}

function catalogView(catalog: { refreshedAt: string; models: FreeModel[] } | null, env: Env) {
  const models = catalog?.models ?? [];
  let route: { model: string; fallbacks: string[] } | null = null;
  if (models.length > 0) {
    try {
      const built = buildModelRoute(models, { preferredId: preferredModel(env) });
      route = { model: built.model, fallbacks: built.models };
    } catch {
      route = null;
    }
  }
  return {
    refreshedAt: catalog?.refreshedAt ?? null,
    count: models.length,
    route,
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      contextLength: model.context_length ?? null,
    })),
  };
}

function presentJob(job: StoredJob, origin: string) {
  let postNote: PostNotePayload | null = null;
  if (job.images.length > 0) {
    try {
      postNote = encodePostNotePayload({
        title: job.title || undefined,
        content: job.content || undefined,
        tags: job.tags || undefined,
        imageUrls: job.images.map((image) => publishImageUrl(origin, job.id, image)),
      });
    } catch {
      postNote = null;
    }
  }
  return {
    id: job.id,
    topic: job.topic,
    status: job.status,
    title: job.title,
    content: job.content,
    tags: job.tags,
    imagePrompts: job.imagePrompts,
    images: job.images.map((image) => ({
      id: image.id,
      filename: image.filename,
      prompt: image.prompt,
      mimeType: image.mimeType,
      source: image.source,
      sortOrder: image.sortOrder,
      url: `/jobs/${job.id}/images/${image.id}`,
    })),
    imageCount: job.images.length,
    modelUsed: job.modelUsed ?? null,
    fallbacksOffered: job.fallbacksOffered ?? [],
    review: job.review ?? null,
    projectId: job.projectId,
    projectName: job.projectName,
    postNote,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function toGateJob(job: StoredJob): Job {
  return {
    id: job.id,
    topic: job.topic,
    status: job.status,
    title: job.title,
    content: job.content,
    tags: job.tags,
    imagePrompts: job.imagePrompts,
    images: job.images.map((image) => ({
      filename: image.filename,
      relativePath: image.relativePath,
      prompt: image.prompt,
      mimeType: image.mimeType,
      url: image.url,
    })),
    review: job.review,
    modelUsed: job.modelUsed,
    fallbacksOffered: job.fallbacksOffered,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

async function requireJob(db: D1Database, id: string): Promise<StoredJob> {
  const job = await getJob(db, id);
  if (!job) throw new HttpError(404, "找不到这条任务", "not_found");
  return job;
}

function originOf(request: Request): string {
  return new URL(request.url).origin;
}

/** 官方 postNote 只接受 https 或 xhsfile。本地 http 预览改用导出占位协议，zip 里仍有原图。 */
function publishImageUrl(origin: string, jobId: string, image: { id: string; filename: string }): string {
  if (origin.startsWith("https:")) return new URL(`/jobs/${jobId}/images/${image.id}`, origin).href;
  return localXhsfileUrl(jobId, image.filename);
}

function preferredModel(env: Env): string {
  const value = "OPENROUTER_PREFERRED_MODEL" in env ? Reflect.get(env, "OPENROUTER_PREFERRED_MODEL") : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : PREFERRED_FREE_MODEL;
}

function quotaMessage(quota: QuotaSnapshot): string | null {
  const daily = quota.freeModelDailyRequests;
  if (!daily) return "已拿到额度，但响应里没有免费模型日次数。";
  if (daily.remaining <= 0) return QUOTA_EMPTY;
  return `今日免费模型还可生成 ${daily.remaining} 次（已用 ${daily.used} / ${daily.limit}）。`;
}

function copyFailure(error: unknown): HttpError {
  const message = redactSecrets(error instanceof Error ? error.message : "文案生成失败");
  if (message.includes("额度") || /daily|free model|free-model/i.test(message)) {
    return new HttpError(429, message.includes("额度") ? message : QUOTA_EMPTY, "quota_exhausted");
  }
  return new HttpError(502, message, "copy_failed");
}

function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

function extFor(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

function safeStem(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "image";
  const stem = base.replace(/\.[^.]+$/, "").replace(/[^A-Za-z0-9_-]+/g, "").slice(0, 32);
  return stem || "image";
}

function mimeOf(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}
