import type { MaterialKind, MaterialSnippet, ProjectContext } from "../copywriting/context.js";
import { truncateChars } from "../util/text.js";
import { newId, nowIso } from "../util/id.js";
import { HttpError } from "./http.js";

export const PROJECT_NAME_MAX = 40;
export const MATERIAL_TITLE_MAX = 80;
export const MATERIAL_BODY_MAX = 20_000;
export const MATERIALS_MAX = 40;
export const MATERIAL_FILE_MAX = 4 * 1024 * 1024;

const TEXT_EXT = new Set(["txt", "md", "markdown", "csv"]);

export interface StoredProject {
  id: string;
  name: string;
  positioning: string;
  niche: string;
  audience: string;
  notes: string;
  archived: boolean;
  materialCount: number;
  jobCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMaterial {
  id: string;
  projectId: string;
  kind: MaterialKind;
  title: string;
  body: string;
  url: string | null;
  filename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  r2Key: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: string;
  name: string;
  positioning: string;
  niche: string;
  audience: string;
  notes: string;
  archived: number;
  material_count: number;
  job_count: number;
  created_at: string;
  updated_at: string;
}

interface MaterialRow {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  filename: string | null;
  mime_type: string | null;
  r2_key: string | null;
  byte_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialUpload {
  filename: string;
  bytes: Uint8Array;
  title: string;
  note: string;
}

export interface ClassifiedUpload {
  mime: string;
  storeText: boolean;
}

export async function createProject(
  db: D1Database,
  input: { name: string; positioning: string; niche: string; audience: string; notes: string },
): Promise<StoredProject> {
  const id = newId("project");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO projects (id, name, positioning, niche, audience, notes, archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(id, input.name, input.positioning, input.niche, input.audience, input.notes, now, now)
    .run();
  return mustGetProject(db, id);
}

export async function listProjects(db: D1Database, archived: boolean): Promise<StoredProject[]> {
  const rows = await db
    .prepare(`${PROJECT_SELECT} WHERE p.archived = ? ORDER BY p.updated_at DESC LIMIT 100`)
    .bind(archived ? 1 : 0)
    .all<ProjectRow>();
  return (rows.results ?? []).map(hydrateProject);
}

export async function getProject(db: D1Database, id: string): Promise<StoredProject | null> {
  const row = await db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).bind(id).first<ProjectRow>();
  return row ? hydrateProject(row) : null;
}

export async function updateProject(
  db: D1Database,
  id: string,
  patch: {
    name?: string;
    positioning?: string;
    niche?: string;
    audience?: string;
    notes?: string;
    archived?: boolean;
  },
): Promise<StoredProject> {
  const sets = ["updated_at = ?"];
  const params: Array<string | number> = [nowIso()];
  if (patch.name !== undefined) {
    sets.push("name = ?");
    params.push(patch.name);
  }
  if (patch.positioning !== undefined) {
    sets.push("positioning = ?");
    params.push(patch.positioning);
  }
  if (patch.niche !== undefined) {
    sets.push("niche = ?");
    params.push(patch.niche);
  }
  if (patch.audience !== undefined) {
    sets.push("audience = ?");
    params.push(patch.audience);
  }
  if (patch.notes !== undefined) {
    sets.push("notes = ?");
    params.push(patch.notes);
  }
  if (patch.archived !== undefined) {
    sets.push("archived = ?");
    params.push(patch.archived ? 1 : 0);
  }
  params.push(id);
  await db.prepare(`UPDATE projects SET ${sets.join(", ")} WHERE id = ?`).bind(...params).run();
  return mustGetProject(db, id);
}

export async function deleteProject(db: D1Database, bucket: R2Bucket, id: string): Promise<{ jobsDetached: number }> {
  const materials = await listMaterials(db, id);
  const jobs = await db.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE project_id = ?`).bind(id).first<{ n: number }>();
  await db.batch([
    db.prepare(`UPDATE jobs SET project_id = NULL WHERE project_id = ?`).bind(id),
    db.prepare(`DELETE FROM materials WHERE project_id = ?`).bind(id),
    db.prepare(`DELETE FROM projects WHERE id = ?`).bind(id),
  ]);
  await deleteKeys(
    bucket,
    materials.map((material) => material.r2Key),
  );
  return { jobsDetached: Number(jobs?.n ?? 0) };
}

async function deleteKeys(bucket: R2Bucket, keys: Array<string | null>): Promise<void> {
  await Promise.all(keys.filter((key): key is string => Boolean(key)).map((key) => bucket.delete(key)));
}

export async function listMaterials(db: D1Database, projectId: string): Promise<StoredMaterial[]> {
  const rows = await db
    .prepare(
      `SELECT id, project_id, kind, title, body, url, filename, mime_type, r2_key, byte_size, created_at, updated_at
       FROM materials WHERE project_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .bind(projectId)
    .all<MaterialRow>();
  return (rows.results ?? []).map(hydrateMaterial);
}

export async function getMaterial(db: D1Database, projectId: string, materialId: string): Promise<StoredMaterial | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, kind, title, body, url, filename, mime_type, r2_key, byte_size, created_at, updated_at
       FROM materials WHERE id = ? AND project_id = ?`,
    )
    .bind(materialId, projectId)
    .first<MaterialRow>();
  return row ? hydrateMaterial(row) : null;
}

export async function insertMaterial(
  db: D1Database,
  projectId: string,
  input: {
    kind: MaterialKind;
    title: string;
    body: string;
    url?: string | null;
    filename?: string | null;
    mimeType?: string | null;
    r2Key?: string | null;
    byteSize?: number | null;
    id?: string;
  },
): Promise<StoredMaterial> {
  await assertMaterialRoom(db, projectId);
  const id = input.id ?? newId("mat");
  const now = nowIso();
  await db.batch([
    db
      .prepare(
        `INSERT INTO materials (id, project_id, kind, title, body, url, filename, mime_type, r2_key, byte_size, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        projectId,
        input.kind,
        input.title,
        input.body,
        input.url ?? null,
        input.filename ?? null,
        input.mimeType ?? null,
        input.r2Key ?? null,
        input.byteSize ?? null,
        now,
        now,
      ),
    db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).bind(now, projectId),
  ]);
  const saved = await getMaterial(db, projectId, id);
  if (!saved) throw new HttpError(500, "资料写入后无法读取", "read_failed");
  return saved;
}

export async function deleteMaterial(db: D1Database, bucket: R2Bucket, projectId: string, materialId: string): Promise<void> {
  const material = await getMaterial(db, projectId, materialId);
  if (!material) throw new HttpError(404, "找不到这份资料", "not_found");
  const now = nowIso();
  await db.batch([
    db.prepare(`DELETE FROM materials WHERE id = ? AND project_id = ?`).bind(materialId, projectId),
    db.prepare(`UPDATE projects SET updated_at = ? WHERE id = ?`).bind(now, projectId),
  ]);
  if (material.r2Key) await bucket.delete(material.r2Key);
}

export async function storeMaterialFile(
  db: D1Database,
  bucket: R2Bucket,
  projectId: string,
  upload: MaterialUpload,
): Promise<StoredMaterial> {
  if (!upload.bytes.byteLength) throw new HttpError(400, "文件是空的", "empty_file");
  if (upload.bytes.byteLength > MATERIAL_FILE_MAX) throw new HttpError(413, "单个资料文件请小于 4MB", "file_too_large");
  const classified = classifyMaterialUpload(upload.filename, upload.bytes);
  if (!classified) {
    throw new HttpError(
      400,
      "只接收文本、Markdown、CSV、PDF 和 PNG / JPEG / WEBP / GIF。Word 等格式请先另存成文本或 PDF，或把要点贴成文字。",
      "bad_material",
    );
  }
  const id = newId("mat");
  const filename = safeFilename(upload.filename);
  const key = `projects/${projectId}/materials/${id}`;
  const title = upload.title.trim() || filename;
  const extracted = classified.storeText ? decodeText(upload.bytes) : "";
  const note = upload.note.trim();
  const body = truncateChars([note, extracted].filter(Boolean).join("\n\n"), MATERIAL_BODY_MAX);
  const disposition = classified.mime.startsWith("image/") ? "inline" : "attachment";
  await bucket.put(key, upload.bytes, {
    httpMetadata: {
      contentType: classified.mime,
      contentDisposition: `${disposition}; filename="${filename.replace(/"/g, "")}"`,
    },
  });
  try {
    return await insertMaterial(db, projectId, {
      id,
      kind: "file",
      title: truncateChars(title, MATERIAL_TITLE_MAX),
      body,
      filename,
      mimeType: classified.mime,
      r2Key: key,
      byteSize: upload.bytes.byteLength,
    });
  } catch (error) {
    await bucket.delete(key);
    throw error;
  }
}

export function toProjectContext(project: StoredProject, materials: StoredMaterial[]): ProjectContext {
  return {
    name: project.name,
    positioning: project.positioning,
    niche: project.niche,
    audience: project.audience,
    notes: project.notes,
    materials: materials.map(toSnippet),
  };
}

export async function loadProjectContext(db: D1Database, projectId: string | null): Promise<ProjectContext | null> {
  if (!projectId) return null;
  const project = await getProject(db, projectId);
  if (!project) return null;
  return toProjectContext(project, await listMaterials(db, projectId));
}

export function classifyMaterialUpload(filename: string, bytes: Uint8Array): ClassifiedUpload | null {
  const image = sniffImage(bytes);
  if (image) return { mime: image, storeText: false };
  if (isPdf(bytes)) return { mime: "application/pdf", storeText: false };
  const ext = extension(filename);
  if (TEXT_EXT.has(ext) && looksLikeText(bytes)) {
    const mime = ext === "csv" ? "text/csv" : ext === "txt" ? "text/plain" : "text/markdown";
    return { mime, storeText: true };
  }
  return null;
}

const PROJECT_SELECT = `SELECT p.id, p.name, p.positioning, p.niche, p.audience, p.notes, p.archived, p.created_at, p.updated_at,
  (SELECT COUNT(*) FROM materials m WHERE m.project_id = p.id) AS material_count,
  (SELECT COUNT(*) FROM jobs j WHERE j.project_id = p.id) AS job_count
 FROM projects p`;

async function mustGetProject(db: D1Database, id: string): Promise<StoredProject> {
  const project = await getProject(db, id);
  if (!project) throw new HttpError(500, "项目写入后无法读取", "read_failed");
  return project;
}

async function assertMaterialRoom(db: D1Database, projectId: string): Promise<void> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM materials WHERE project_id = ?`).bind(projectId).first<{ n: number }>();
  if (Number(row?.n ?? 0) >= MATERIALS_MAX) {
    throw new HttpError(400, `每个项目最多 ${MATERIALS_MAX} 份资料。请先删掉不用的。`, "too_many_materials");
  }
}

function hydrateProject(row: ProjectRow): StoredProject {
  return {
    id: row.id,
    name: row.name,
    positioning: row.positioning ?? "",
    niche: row.niche ?? "",
    audience: row.audience ?? "",
    notes: row.notes ?? "",
    archived: Number(row.archived) === 1,
    materialCount: Number(row.material_count ?? 0),
    jobCount: Number(row.job_count ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateMaterial(row: MaterialRow): StoredMaterial {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: asKind(row.kind),
    title: row.title ?? "",
    body: row.body ?? "",
    url: row.url,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size === null || row.byte_size === undefined ? null : Number(row.byte_size),
    r2Key: row.r2_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSnippet(material: StoredMaterial): MaterialSnippet {
  return {
    kind: material.kind,
    title: material.title,
    text: material.body,
    filename: material.filename ?? undefined,
    url: material.url ?? undefined,
    mimeType: material.mimeType ?? undefined,
  };
}

function asKind(value: string): MaterialKind {
  if (value === "note" || value === "file" || value === "link") return value;
  return "note";
}

function decodeText(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes).replace(/\u0000/g, "").trim();
}

function safeFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "file";
  const cleaned = Array.from(base)
    .filter((char) => /[\p{L}\p{N}._-]/u.test(char))
    .join("")
    .slice(0, 80);
  return cleaned || "file";
}

function extension(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

function looksLikeText(bytes: Uint8Array): boolean {
  if (!bytes.byteLength) return false;
  const sample = bytes.subarray(0, 8192);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.02;
}

function isPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
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
