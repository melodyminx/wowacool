import { MATERIAL_BODY_MAX, MATERIAL_TITLE_MAX, PROJECT_NAME_MAX } from "./projects.js";
import { countChars, truncateChars } from "../util/text.js";
import { assertBookmarkUrl, fetchBookmarkTitle } from "./bookmarks.js";
import { HttpError, json, optionalString, readJson } from "./http.js";
import {
  createProject,
  deleteMaterial,
  deleteProject,
  getMaterial,
  getProject,
  insertMaterial,
  listMaterials,
  listProjects,
  storeMaterialFile,
  updateProject,
  type StoredMaterial,
  type StoredProject,
} from "./projects.js";

const NOTE_MAX = 1000;
const FIELD_MAX = 80;
const AUDIENCE_MAX = 40;

export async function listProjectsResponse(request: Request, env: Env): Promise<Response> {
  const db = database(env);
  const archived = new URL(request.url).searchParams.get("archived") === "1";
  const projects = await listProjects(db, archived);
  return json({ ok: true, projects: projects.map(presentProject), archived });
}

export async function createProjectResponse(request: Request, env: Env): Promise<Response> {
  const db = database(env);
  const body = await readJson(request);
  const name = requiredName(body.name);
  const project = await createProject(db, {
    name,
    positioning: clean(body.positioning, FIELD_MAX, "定位"),
    niche: clean(body.niche, AUDIENCE_MAX, "领域"),
    audience: clean(body.audience, AUDIENCE_MAX, "受众"),
    notes: clean(body.notes, NOTE_MAX, "说明"),
  });
  return json({ ok: true, project: presentProject(project), materials: [] }, 201);
}

export async function getProjectResponse(_request: Request, env: Env, id: string): Promise<Response> {
  const db = database(env);
  const project = await requireProject(db, id);
  const materials = await listMaterials(db, id);
  return json({ ok: true, project: presentProject(project), materials: materials.map((item) => presentMaterial(id, item)) });
}

export async function patchProjectResponse(request: Request, env: Env, id: string): Promise<Response> {
  const db = database(env);
  await requireProject(db, id);
  const body = await readJson(request);
  const name = body.name === undefined ? undefined : requiredName(body.name);
  const positioning = body.positioning === undefined ? undefined : clean(body.positioning, FIELD_MAX, "定位");
  const niche = body.niche === undefined ? undefined : clean(body.niche, AUDIENCE_MAX, "领域");
  const audience = body.audience === undefined ? undefined : clean(body.audience, AUDIENCE_MAX, "受众");
  const notes = body.notes === undefined ? undefined : clean(body.notes, NOTE_MAX, "说明");
  let archived: boolean | undefined;
  if (body.archived !== undefined) {
    if (typeof body.archived !== "boolean") throw new HttpError(400, "归档状态不正确", "bad_field");
    archived = body.archived;
  }
  if (name === undefined && positioning === undefined && niche === undefined && audience === undefined && notes === undefined && archived === undefined) {
    throw new HttpError(400, "没有要修改的内容", "empty_patch");
  }
  const project = await updateProject(db, id, { name, positioning, niche, audience, notes, archived });
  const materials = await listMaterials(db, id);
  return json({ ok: true, project: presentProject(project), materials: materials.map((item) => presentMaterial(id, item)) });
}

export async function deleteProjectResponse(_request: Request, env: Env, id: string): Promise<Response> {
  const { db, bucket } = platform(env);
  await requireProject(db, id);
  const result = await deleteProject(db, bucket, id);
  return json({ ok: true, id, jobsDetached: result.jobsDetached });
}

export async function listMaterialsResponse(_request: Request, env: Env, id: string): Promise<Response> {
  const db = database(env);
  await requireProject(db, id);
  const materials = await listMaterials(db, id);
  return json({ ok: true, materials: materials.map((item) => presentMaterial(id, item)) });
}

export async function createMaterialResponse(request: Request, env: Env, id: string): Promise<Response> {
  const { db, bucket } = platform(env);
  await requireProject(db, id);
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) return createFile(request, db, bucket, id);
  const body = await readJson(request, 200_000);
  const kind = body.kind;
  if (kind === "note") return createNote(db, id, body);
  if (kind === "link") return createLink(db, id, body);
  throw new HttpError(400, "请添加文字、链接，或上传文件", "bad_material");
}

export async function deleteMaterialResponse(_request: Request, env: Env, id: string, materialId: string): Promise<Response> {
  const { db, bucket } = platform(env);
  await requireProject(db, id);
  await deleteMaterial(db, bucket, id, materialId);
  return json({ ok: true, id: materialId });
}

export async function getMaterialResponse(_request: Request, env: Env, id: string, materialId: string): Promise<Response> {
  const { db, bucket } = platform(env);
  await requireProject(db, id);
  const material = await getMaterial(db, id, materialId);
  if (!material) throw new HttpError(404, "找不到这份资料", "not_found");
  if (material.kind !== "file" || !material.r2Key) {
    return json({ ok: true, material: presentMaterial(id, material) });
  }
  const object = await bucket.get(material.r2Key);
  if (!object) throw new HttpError(404, "资料文件不在了，请重新上传", "missing_object");
  const headers = new Headers();
  const mime = material.mimeType || object.httpMetadata?.contentType || "application/octet-stream";
  const filename = (material.filename || "file").replace(/"/g, "");
  const disposition = mime.startsWith("image/") ? "inline" : "attachment";
  headers.set("content-type", mime);
  headers.set("content-disposition", `${disposition}; filename="${filename}"`);
  headers.set("cache-control", "private, max-age=3600");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}

async function createNote(db: D1Database, projectId: string, body: Record<string, unknown>): Promise<Response> {
  const text = requiredText(body.body, "文字资料");
  const title = optionalTitle(body.title) || truncateChars(text, 24);
  const material = await insertMaterial(db, projectId, { kind: "note", title, body: text });
  return json({ ok: true, material: presentMaterial(projectId, material) }, 201);
}

async function createLink(db: D1Database, projectId: string, body: Record<string, unknown>): Promise<Response> {
  if (typeof body.url !== "string" || !body.url.trim()) throw new HttpError(400, "请填写链接", "missing_url");
  const url = assertBookmarkUrl(body.url);
  const note = body.body === undefined ? "" : requiredText(body.body, "链接说明", true);
  let title = optionalTitle(body.title);
  let titleFetched = false;
  if (!title) {
    title = (await fetchBookmarkTitle(url)) ?? "";
    titleFetched = Boolean(title);
  }
  const material = await insertMaterial(db, projectId, {
    kind: "link",
    title: title || url,
    body: note,
    url,
  });
  return json({ ok: true, material: presentMaterial(projectId, material), titleFetched }, 201);
}

async function createFile(request: Request, db: D1Database, bucket: R2Bucket, projectId: string): Promise<Response> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 6 * 1024 * 1024) {
    throw new HttpError(413, "这次上传太大了", "body_too_large");
  }
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "请选择要上传的资料文件", "missing_file");
  const title = typeof form.get("title") === "string" ? optionalTitle(form.get("title")) : "";
  const noteValue = form.get("note");
  const note = typeof noteValue === "string" ? noteValue : "";
  if (countChars(note) > MATERIAL_BODY_MAX) throw new HttpError(400, `说明超过 ${MATERIAL_BODY_MAX} 字`, "too_long");
  const material = await storeMaterialFile(db, bucket, projectId, {
    filename: file.name || "file",
    bytes: new Uint8Array(await file.arrayBuffer()),
    title,
    note,
  });
  return json({ ok: true, material: presentMaterial(projectId, material) }, 201);
}

function presentProject(project: StoredProject) {
  return {
    id: project.id,
    name: project.name,
    positioning: project.positioning,
    niche: project.niche,
    audience: project.audience,
    notes: project.notes,
    archived: project.archived,
    materialCount: project.materialCount,
    jobCount: project.jobCount,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function presentMaterial(projectId: string, material: StoredMaterial) {
  return {
    id: material.id,
    projectId,
    kind: material.kind,
    title: material.title,
    body: material.body,
    url: material.url,
    filename: material.filename,
    mimeType: material.mimeType,
    byteSize: material.byteSize,
    downloadUrl: material.kind === "file" ? `/projects/${projectId}/materials/${material.id}` : null,
    createdAt: material.createdAt,
    updatedAt: material.updatedAt,
  };
}

async function requireProject(db: D1Database, id: string): Promise<StoredProject> {
  const project = await getProject(db, id);
  if (!project) throw new HttpError(404, "找不到这个项目", "not_found");
  return project;
}

function requiredName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, "请先写项目名称", "missing_name");
  const name = value.trim();
  if (countChars(name) > PROJECT_NAME_MAX) throw new HttpError(400, `项目名称最多 ${PROJECT_NAME_MAX} 字`, "too_long");
  return name;
}

function optionalTitle(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new HttpError(400, "标题需要是字符串", "bad_field");
  const title = value.trim();
  if (countChars(title) > MATERIAL_TITLE_MAX) throw new HttpError(400, `标题最多 ${MATERIAL_TITLE_MAX} 字`, "too_long");
  return title;
}

function requiredText(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string") throw new HttpError(400, `${label}需要是字符串`, "bad_field");
  const text = value.trim();
  if (!text && !allowEmpty) throw new HttpError(400, `请先写${label}`, "missing_text");
  if (countChars(text) > MATERIAL_BODY_MAX) throw new HttpError(400, `${label}超过 ${MATERIAL_BODY_MAX} 字`, "too_long");
  return text;
}

function clean(value: unknown, max: number, label: string): string {
  return (optionalString(value, max, label) ?? "").trim();
}

function database(env: Env): D1Database {
  return platform(env).db;
}

function platform(env: Env): { db: D1Database; bucket: R2Bucket } {
  if (!env.DB || !env.ASSETS) {
    throw new HttpError(
      503,
      "D1（绑定 DB）或 R2（绑定 ASSETS）还不可用。请确认 wrangler.toml 已填写 database_id 和 bucket_name 后重新部署。",
      "bindings_missing",
    );
  }
  return { db: env.DB, bucket: env.ASSETS };
}
