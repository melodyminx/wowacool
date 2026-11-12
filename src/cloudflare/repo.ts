import { CONTENT_MAX, IMAGES_MAX, IMAGES_MIN, TITLE_MAX } from "../constants.js";
import type { CopyDraft, FreeModel, JobStatus, QuotaSnapshot } from "../types.js";
import { countChars } from "../util/text.js";
import { newId, nowIso } from "../util/id.js";
import { HttpError } from "./http.js";

export type ImageSource = "mock" | "upload" | "workers_ai" | "openai_compatible";

const IMAGE_KINDS: readonly ImageSource[] = ["mock", "upload", "workers_ai", "openai_compatible"];
const IMAGE_KIND_SQL = `kind IN (${IMAGE_KINDS.map((kind) => `'${kind}'`).join(", ")})`;

export function isImageSource(kind: string): kind is ImageSource {
  return (IMAGE_KINDS as readonly string[]).includes(kind);
}

export interface StoredImage {
  id: string;
  filename: string;
  relativePath: string;
  prompt: string;
  mimeType: string;
  url: string;
  source: ImageSource;
  sortOrder: number;
  r2Key: string;
}

export interface StoredJob {
  id: string;
  topic: string;
  status: JobStatus;
  title: string;
  content: string;
  tags: string;
  imagePrompts: string[];
  images: StoredImage[];
  review?: { decision: "approved" | "rejected"; note?: string; at: string };
  modelUsed?: string;
  fallbacksOffered?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface JobSummary {
  id: string;
  topic: string;
  status: JobStatus;
  title: string;
  contentPreview: string;
  imageCount: number;
  modelUsed?: string;
  createdAt: string;
  updatedAt: string;
  coverUrl: string | null;
}

interface JobRow {
  id: string;
  topic: string;
  status: string;
  title: string;
  content: string;
  tags: string;
  image_count: number;
  model_used: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  cover_id?: string | null;
}

interface AssetRow {
  id: string;
  job_id: string;
  kind: string;
  filename: string;
  r2_key: string | null;
  url: string | null;
  prompt: string | null;
  sort_order: number;
  created_at: string;
}

interface AuditRow {
  event: string;
  detail: string | null;
  created_at: string;
}

interface CatalogRow {
  id: string;
  name: string | null;
  pricing_prompt: string | null;
  pricing_completion: string | null;
  architecture: string | null;
  is_free: number;
  is_text_chat: number;
  refreshed_at: string;
}

interface QuotaRow {
  used_daily: number | null;
  daily_limit: number | null;
  remaining_daily: number | null;
  credit_limit_remaining: number | null;
  is_free_tier: number | null;
  captured_at: string;
}

const STATUSES = new Set<JobStatus>(["draft", "pending_review", "approved", "rejected", "exported"]);

export function asStatus(value: string): JobStatus {
  return STATUSES.has(value as JobStatus) ? (value as JobStatus) : "draft";
}

export function isPackageComplete(title: string, content: string, imageCount: number): boolean {
  return (
    Boolean(title.trim()) &&
    Boolean(content.trim()) &&
    countChars(title) <= TITLE_MAX &&
    countChars(content) <= CONTENT_MAX &&
    imageCount >= IMAGES_MIN &&
    imageCount <= IMAGES_MAX
  );
}

export function decideStatus(current: JobStatus, complete: boolean): JobStatus {
  if (current === "exported") {
    throw new HttpError(409, "这条任务已经导出。要修改，请复制为新任务后再编辑。", "exported_locked");
  }
  return complete ? "pending_review" : "draft";
}

export async function createJob(db: D1Database, topic: string): Promise<StoredJob> {
  const id = newId("job");
  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO jobs (id, topic, status, title, content, tags, image_count, model_used, review_note, created_at, updated_at)
         VALUES (?, ?, 'draft', '', '', '', 0, NULL, NULL, ?, ?)`,
      )
      .bind(id, topic, now, now),
    auditStmt(db, id, "created", { topic }, now),
  ]);
  return mustGet(db, id);
}

export async function listJobs(db: D1Database): Promise<JobSummary[]> {
  const rows = await db
    .prepare(
      `SELECT j.id, j.topic, j.status, j.title, j.content, j.image_count, j.model_used, j.created_at, j.updated_at,
        (
          SELECT a.id FROM assets a
          WHERE a.job_id = j.id AND a.${IMAGE_KIND_SQL}
          ORDER BY a.sort_order ASC, a.created_at ASC
          LIMIT 1
        ) AS cover_id
       FROM jobs j
       ORDER BY j.created_at DESC
       LIMIT 100`,
    )
    .all<JobRow>();
  return (rows.results ?? []).map((row) => ({
    id: row.id,
    topic: row.topic,
    status: asStatus(row.status),
    title: row.title,
    contentPreview: Array.from(row.content ?? "").slice(0, 72).join(""),
    imageCount: Number(row.image_count ?? 0),
    modelUsed: row.model_used ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    coverUrl: row.cover_id ? `/jobs/${row.id}/images/${row.cover_id}` : null,
  }));
}

export async function getJob(db: D1Database, id: string): Promise<StoredJob | null> {
  const row = await db
    .prepare(
      `SELECT id, topic, status, title, content, tags, image_count, model_used, review_note, created_at, updated_at
       FROM jobs WHERE id = ?`,
    )
    .bind(id)
    .first<JobRow>();
  if (!row) return null;
  const assets = await db
    .prepare(
      `SELECT id, job_id, kind, filename, r2_key, url, prompt, sort_order, created_at
       FROM assets WHERE job_id = ? ORDER BY sort_order ASC, created_at ASC`,
    )
    .bind(id)
    .all<AssetRow>();
  const audits = await db
    .prepare(
      `SELECT event, detail, created_at FROM audit_log
       WHERE job_id = ? AND event IN ('copy_generated', 'review_approved', 'review_rejected')
       ORDER BY created_at DESC`,
    )
    .bind(id)
    .all<AuditRow>();
  return hydrate(row, assets.results ?? [], audits.results ?? []);
}

export async function getImageAsset(db: D1Database, jobId: string, assetId: string): Promise<AssetRow | null> {
  return db
    .prepare(
      `SELECT id, job_id, kind, filename, r2_key, url, prompt, sort_order, created_at
       FROM assets WHERE id = ? AND job_id = ? AND ${IMAGE_KIND_SQL}`,
    )
    .bind(assetId, jobId)
    .first<AssetRow>();
}

export async function saveCopy(
  db: D1Database,
  job: StoredJob,
  draft: CopyDraft,
  meta: { modelUsed: string; fallbacks: string[] },
): Promise<void> {
  const now = nowIso();
  const status = decideStatus(job.status, isPackageComplete(draft.title, draft.content, job.images.length));
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE jobs SET title = ?, content = ?, tags = ?, model_used = ?, status = ?, review_note = NULL, updated_at = ? WHERE id = ?`,
      )
      .bind(draft.title, draft.content, draft.tags, meta.modelUsed, status, now, job.id),
    db.prepare(`DELETE FROM assets WHERE job_id = ? AND kind = 'prompt'`).bind(job.id),
  ];
  draft.imagePrompts.forEach((prompt, index) => {
    statements.push(promptStmt(db, job.id, prompt, index, now));
  });
  job.images.forEach((image, index) => {
    const prompt = draft.imagePrompts[index];
    if (!prompt) return;
    statements.push(db.prepare(`UPDATE assets SET prompt = ? WHERE id = ? AND job_id = ?`).bind(prompt, image.id, job.id));
  });
  statements.push(auditStmt(db, job.id, "copy_generated", { modelUsed: meta.modelUsed, fallbacks: meta.fallbacks }, now));
  await db.batch(statements);
}

export async function saveEdits(
  db: D1Database,
  job: StoredJob,
  edits: { title: string; content: string; tags: string; imagePrompts?: string[] },
): Promise<void> {
  const now = nowIso();
  const prompts = edits.imagePrompts ?? job.imagePrompts;
  const status = decideStatus(job.status, isPackageComplete(edits.title, edits.content, job.images.length));
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE jobs SET title = ?, content = ?, tags = ?, status = ?, review_note = NULL, updated_at = ? WHERE id = ?`,
      )
      .bind(edits.title, edits.content, edits.tags, status, now, job.id),
  ];
  if (edits.imagePrompts) {
    statements.push(db.prepare(`DELETE FROM assets WHERE job_id = ? AND kind = 'prompt'`).bind(job.id));
    prompts.forEach((prompt, index) => statements.push(promptStmt(db, job.id, prompt, index, now)));
    job.images.forEach((image, index) => {
      if (prompts[index] === undefined) return;
      statements.push(
        db.prepare(`UPDATE assets SET prompt = ? WHERE id = ? AND job_id = ?`).bind(prompts[index] ?? "", image.id, job.id),
      );
    });
  }
  statements.push(auditStmt(db, job.id, "copy_edited", { status }, now));
  await db.batch(statements);
}

export interface IncomingImage {
  filename: string;
  prompt: string;
  bytes: Uint8Array;
  mimeType: string;
  source: ImageSource;
}

export async function replaceImages(db: D1Database, bucket: R2Bucket, job: StoredJob, images: IncomingImage[]): Promise<void> {
  const now = nowIso();
  const status = decideStatus(job.status, isPackageComplete(job.title, job.content, images.length));
  const stored = await putImages(bucket, job.id, images);
  const statements: D1PreparedStatement[] = [
    db.prepare(`DELETE FROM assets WHERE job_id = ? AND ${IMAGE_KIND_SQL}`).bind(job.id),
    db.prepare(`DELETE FROM assets WHERE job_id = ? AND kind = 'prompt'`).bind(job.id),
  ];
  stored.forEach((image, index) => {
    statements.push(imageStmt(db, job.id, image, index, now));
    statements.push(promptStmt(db, job.id, image.prompt, index, now));
  });
  statements.push(
    db
      .prepare(`UPDATE jobs SET image_count = ?, status = ?, review_note = NULL, updated_at = ? WHERE id = ?`)
      .bind(stored.length, status, now, job.id),
  );
  statements.push(auditStmt(db, job.id, "images_generated", { count: stored.length }, now));
  await db.batch(statements);
  await deleteKeys(bucket, job.images.map((image) => image.r2Key));
}

export async function swapImage(
  db: D1Database,
  bucket: R2Bucket,
  job: StoredJob,
  assetId: string,
  image: IncomingImage,
): Promise<void> {
  const current = job.images.find((item) => item.id === assetId);
  if (!current) throw new HttpError(404, "找不到这张图片", "not_found");
  const now = nowIso();
  const status = decideStatus(job.status, isPackageComplete(job.title, job.content, job.images.length));
  const taken = filenamesOf(job);
  taken.delete(current.filename);
  const stored = await putImages(bucket, job.id, [image], taken);
  const next = stored[0];
  if (!next) throw new HttpError(500, "图片没有写入", "image_failed");
  await db.batch([
    db.prepare(`DELETE FROM assets WHERE id = ? AND job_id = ?`).bind(assetId, job.id),
    imageStmt(db, job.id, next, current.sortOrder, now),
    db
      .prepare(`UPDATE assets SET prompt = ? WHERE job_id = ? AND kind = 'prompt' AND sort_order = ?`)
      .bind(image.prompt, job.id, current.sortOrder),
    db.prepare(`UPDATE jobs SET status = ?, review_note = NULL, updated_at = ? WHERE id = ?`).bind(status, now, job.id),
    auditStmt(db, job.id, "image_regenerated", { assetId, index: current.sortOrder }, now),
  ]);
  if (current.r2Key) await bucket.delete(current.r2Key);
}

export async function addImages(db: D1Database, bucket: R2Bucket, job: StoredJob, images: IncomingImage[]): Promise<void> {
  const now = nowIso();
  const nextCount = job.images.length + images.length;
  if (nextCount > IMAGES_MAX) {
    throw new HttpError(400, `图片最多 ${IMAGES_MAX} 张，当前已有 ${job.images.length} 张`, "too_many_images");
  }
  const status = decideStatus(job.status, isPackageComplete(job.title, job.content, nextCount));
  const stored = await putImages(bucket, job.id, images, filenamesOf(job));
  const start = job.images.length;
  const statements: D1PreparedStatement[] = stored.map((image, index) => imageStmt(db, job.id, image, start + index, now));
  statements.push(
    db
      .prepare(`UPDATE jobs SET image_count = ?, status = ?, review_note = NULL, updated_at = ? WHERE id = ?`)
      .bind(nextCount, status, now, job.id),
  );
  statements.push(auditStmt(db, job.id, "image_uploaded", { count: stored.length }, now));
  await db.batch(statements);
}

export async function deleteImage(db: D1Database, bucket: R2Bucket, job: StoredJob, assetId: string): Promise<void> {
  const image = job.images.find((item) => item.id === assetId);
  if (!image) throw new HttpError(404, "找不到这张图片", "not_found");
  const now = nowIso();
  const nextCount = job.images.length - 1;
  const status = decideStatus(job.status, isPackageComplete(job.title, job.content, nextCount));
  await db.batch([
    db.prepare(`DELETE FROM assets WHERE id = ? AND job_id = ?`).bind(assetId, job.id),
    db
      .prepare(`UPDATE jobs SET image_count = ?, status = ?, review_note = NULL, updated_at = ? WHERE id = ?`)
      .bind(nextCount, status, now, job.id),
    auditStmt(db, job.id, "image_deleted", { assetId }, now),
  ]);
  if (image.r2Key) await bucket.delete(image.r2Key);
}

export async function reorderImages(db: D1Database, job: StoredJob, ids: string[]): Promise<void> {
  const current = job.images.map((image) => image.id);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !current.includes(id))) {
    throw new HttpError(400, "图片顺序不完整", "bad_order");
  }
  const now = nowIso();
  const status = decideStatus(job.status, isPackageComplete(job.title, job.content, job.images.length));
  const statements: D1PreparedStatement[] = ids.map((id, index) =>
    db.prepare(`UPDATE assets SET sort_order = ? WHERE id = ? AND job_id = ?`).bind(index, id, job.id),
  );
  statements.push(
    db.prepare(`UPDATE jobs SET status = ?, review_note = NULL, updated_at = ? WHERE id = ?`).bind(status, now, job.id),
  );
  statements.push(auditStmt(db, job.id, "images_reordered", { ids }, now));
  await db.batch(statements);
}

export async function saveReview(db: D1Database, job: StoredJob): Promise<void> {
  const at = job.review?.at ?? job.updatedAt;
  const event = job.status === "approved" ? "review_approved" : "review_rejected";
  await db.batch([
    db
      .prepare(`UPDATE jobs SET status = ?, review_note = ?, updated_at = ? WHERE id = ?`)
      .bind(job.status, job.review?.note ?? null, at, job.id),
    auditStmt(db, job.id, event, { decision: job.review?.decision, note: job.review?.note ?? null, at }, at),
  ]);
}

export async function markExported(db: D1Database, jobId: string, at: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE jobs SET status = 'exported', updated_at = ? WHERE id = ?`).bind(at, jobId),
    auditStmt(db, jobId, "exported", {}, at),
  ]);
}

export async function duplicateJob(db: D1Database, bucket: R2Bucket, job: StoredJob): Promise<StoredJob> {
  const id = newId("job");
  const now = nowIso();
  const complete = isPackageComplete(job.title, job.content, job.images.length);
  const status: JobStatus = complete ? "pending_review" : "draft";
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO jobs (id, topic, status, title, content, tags, image_count, model_used, review_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(id, job.topic, status, job.title, job.content, job.tags, job.images.length, job.modelUsed ?? null, now, now),
  ];
  job.imagePrompts.forEach((prompt, index) => statements.push(promptStmt(db, id, prompt, index, now)));
  for (const [index, image] of job.images.entries()) {
    const assetId = newId("img");
    const key = `jobs/${id}/images/${assetId}`;
    if (image.r2Key) {
      const object = await bucket.get(image.r2Key);
      if (object) {
        await bucket.put(key, await object.arrayBuffer(), {
          httpMetadata: {
            contentType: image.mimeType,
            contentDisposition: `inline; filename="${image.filename}"`,
          },
        });
      }
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO assets (id, job_id, kind, filename, r2_key, url, prompt, sort_order, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          assetId,
          id,
          image.source,
          image.filename,
          key,
          `/jobs/${id}/images/${assetId}`,
          image.prompt,
          index,
          now,
        ),
    );
  }
  statements.push(auditStmt(db, id, "duplicated", { from: job.id }, now));
  await db.batch(statements);
  return mustGet(db, id);
}

export async function replaceCatalog(db: D1Database, models: FreeModel[], refreshedAt: string): Promise<void> {
  const statements: D1PreparedStatement[] = [db.prepare(`DELETE FROM model_catalog`)];
  for (const model of models) {
    statements.push(
      db
        .prepare(
          `INSERT INTO model_catalog (id, name, pricing_prompt, pricing_completion, architecture, is_free, is_text_chat, refreshed_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          model.id,
          model.name,
          model.pricing.prompt === null || model.pricing.prompt === undefined ? "" : String(model.pricing.prompt),
          model.pricing.completion === null || model.pricing.completion === undefined ? "" : String(model.pricing.completion),
          JSON.stringify({
            modality: model.architecture.modality,
            input_modalities: model.architecture.input_modalities,
            output_modalities: model.architecture.output_modalities,
            endpoints: model.endpoints,
            context_length: model.context_length,
          }),
          model.isTextChat ? 1 : 0,
          refreshedAt,
        ),
    );
  }
  const size = 25;
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

export async function loadCatalog(db: D1Database): Promise<{ refreshedAt: string; models: FreeModel[] } | null> {
  const rows = await db
    .prepare(
      `SELECT id, name, pricing_prompt, pricing_completion, architecture, is_free, is_text_chat, refreshed_at
       FROM model_catalog ORDER BY id ASC`,
    )
    .all<CatalogRow>();
  const list = rows.results ?? [];
  if (!list.length) return null;
  const models: FreeModel[] = [];
  for (const row of list) {
    if (Number(row.is_free) !== 1 || Number(row.is_text_chat) !== 1) continue;
    let architecture: FreeModel["architecture"] = {};
    let endpoints: string[] | undefined;
    let contextLength: number | undefined;
    if (row.architecture) {
      try {
        const parsed = JSON.parse(row.architecture) as {
          modality?: string;
          input_modalities?: string[];
          output_modalities?: string[];
          endpoints?: string[];
          context_length?: number;
        };
        architecture = {
          modality: parsed.modality,
          input_modalities: parsed.input_modalities,
          output_modalities: parsed.output_modalities,
        };
        endpoints = parsed.endpoints;
        contextLength = parsed.context_length;
      } catch {
        architecture = {};
      }
    }
    models.push({
      id: row.id,
      name: row.name || row.id,
      pricing: { prompt: row.pricing_prompt, completion: row.pricing_completion },
      architecture,
      endpoints,
      context_length: contextLength,
      isFree: true,
      isTextChat: true,
    });
  }
  return { refreshedAt: list[0].refreshed_at, models };
}

export async function saveQuota(db: D1Database, snapshot: QuotaSnapshot): Promise<void> {
  const daily = snapshot.freeModelDailyRequests;
  await db
    .prepare(
      `INSERT INTO quota_snapshots (id, used_daily, daily_limit, remaining_daily, credit_limit_remaining, is_free_tier, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId("quota"),
      daily?.used ?? null,
      daily?.limit ?? null,
      daily?.remaining ?? null,
      snapshot.creditLimitRemaining ?? null,
      snapshot.isFreeTier === undefined ? null : snapshot.isFreeTier ? 1 : 0,
      snapshot.capturedAt,
    )
    .run();
}

export async function latestQuota(db: D1Database): Promise<QuotaSnapshot | null> {
  const row = await db
    .prepare(
      `SELECT used_daily, daily_limit, remaining_daily, credit_limit_remaining, is_free_tier, captured_at
       FROM quota_snapshots ORDER BY captured_at DESC LIMIT 1`,
    )
    .first<QuotaRow>();
  if (!row) return null;
  const hasDaily = row.used_daily !== null && row.daily_limit !== null && row.remaining_daily !== null;
  return {
    capturedAt: row.captured_at,
    isFreeTier: row.is_free_tier === null ? undefined : Number(row.is_free_tier) === 1,
    creditLimitRemaining: row.credit_limit_remaining,
    freeModelDailyRequests: hasDaily
      ? { used: Number(row.used_daily), limit: Number(row.daily_limit), remaining: Number(row.remaining_daily) }
      : null,
  };
}

async function mustGet(db: D1Database, id: string): Promise<StoredJob> {
  const job = await getJob(db, id);
  if (!job) throw new HttpError(500, "任务写入后无法读取", "read_failed");
  return job;
}

function hydrate(row: JobRow, assets: AssetRow[], audits: AuditRow[]): StoredJob {
  const prompts = assets.filter((asset) => asset.kind === "prompt");
  const images = assets.filter((asset) => isImageSource(asset.kind));
  const copyAudit = audits.find((audit) => audit.event === "copy_generated");
  const reviewAudit = audits.find((audit) => audit.event === "review_approved" || audit.event === "review_rejected");
  let fallbacks: string[] = [];
  if (copyAudit?.detail) {
    try {
      const parsed = JSON.parse(copyAudit.detail) as { fallbacks?: unknown };
      if (Array.isArray(parsed.fallbacks)) fallbacks = parsed.fallbacks.filter((item): item is string => typeof item === "string");
    } catch {
      fallbacks = [];
    }
  }
  const status = asStatus(row.status);
  let reviewAt = reviewAudit?.created_at ?? row.updated_at;
  if (reviewAudit?.detail) {
    try {
      const parsed = JSON.parse(reviewAudit.detail) as { at?: string };
      if (parsed.at) reviewAt = parsed.at;
    } catch {
      reviewAt = reviewAudit.created_at;
    }
  }
  return {
    id: row.id,
    topic: row.topic,
    status,
    title: row.title ?? "",
    content: row.content ?? "",
    tags: row.tags ?? "",
    imagePrompts: prompts.map((asset) => asset.prompt ?? "").filter(Boolean),
    images: images.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      relativePath: `images/${asset.filename}`,
      prompt: asset.prompt ?? "",
      mimeType: mimeFromFilename(asset.filename),
      url: `/jobs/${row.id}/images/${asset.id}`,
      source: isImageSource(asset.kind) ? asset.kind : "mock",
      sortOrder: Number(asset.sort_order ?? 0),
      r2Key: asset.r2_key ?? "",
    })),
    review:
      status === "approved" || status === "rejected"
        ? { decision: status, note: row.review_note || undefined, at: reviewAt }
        : undefined,
    modelUsed: row.model_used ?? undefined,
    fallbacksOffered: fallbacks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function promptStmt(db: D1Database, jobId: string, prompt: string, index: number, now: string): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO assets (id, job_id, kind, filename, r2_key, url, prompt, sort_order, created_at)
       VALUES (?, ?, 'prompt', 'prompt', NULL, NULL, ?, ?, ?)`,
    )
    .bind(newId("prm"), jobId, prompt, index, now);
}

function imageStmt(
  db: D1Database,
  jobId: string,
  image: { id: string; filename: string; key: string; prompt: string; source: ImageSource },
  index: number,
  now: string,
): D1PreparedStatement {
  return db
    .prepare(
      `INSERT INTO assets (id, job_id, kind, filename, r2_key, url, prompt, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(image.id, jobId, image.source, image.filename, image.key, `/jobs/${jobId}/images/${image.id}`, image.prompt, index, now);
}

function auditStmt(db: D1Database, jobId: string, event: string, detail: unknown, now: string): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO audit_log (id, job_id, event, detail, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(newId("aud"), jobId, event, JSON.stringify(detail), now);
}

async function putImages(
  bucket: R2Bucket,
  jobId: string,
  images: IncomingImage[],
  taken: Set<string> = new Set(),
): Promise<Array<IncomingImage & { id: string; key: string; filename: string }>> {
  const stored: Array<IncomingImage & { id: string; key: string; filename: string }> = [];
  for (const image of images) {
    const id = newId("img");
    const filename = uniqueFilename(taken, image.filename);
    taken.add(filename);
    const key = `jobs/${jobId}/images/${id}`;
    await bucket.put(key, image.bytes, {
      httpMetadata: {
        contentType: image.mimeType,
        contentDisposition: `inline; filename="${filename}"`,
      },
    });
    stored.push({ ...image, id, key, filename });
  }
  return stored;
}

function filenamesOf(job: StoredJob): Set<string> {
  return new Set(job.images.map((image) => image.filename));
}

function uniqueFilename(taken: Set<string>, preferred: string): string {
  if (!taken.has(preferred)) return preferred;
  const dot = preferred.lastIndexOf(".");
  const stem = dot > 0 ? preferred.slice(0, dot) : preferred;
  const ext = dot > 0 ? preferred.slice(dot) : "";
  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`)) n += 1;
  return `${stem}-${n}${ext}`;
}

async function deleteKeys(bucket: R2Bucket, keys: string[]): Promise<void> {
  await Promise.all(keys.filter(Boolean).map((key) => bucket.delete(key)));
}

function mimeFromFilename(name: string): string {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}
