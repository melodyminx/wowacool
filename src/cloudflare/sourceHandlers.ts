import { assertDataSourceToken } from "./auth.js";
import { HttpError, json, readJson } from "./http.js";
import { getProject } from "./projects.js";
import {
  SOURCE_BODY_MAX,
  SOURCE_NAME_MAX,
  SOURCE_TITLE_MAX,
  addSourceEntry,
  assertSourceUrl,
  createSource,
  findSourceByName,
  getSource,
  listSources,
  setSourceEnabled,
  type StoredEntry,
  type StoredSource,
} from "./sources.js";
import { countChars, truncateChars } from "../util/text.js";
import { nowIso } from "../util/id.js";

export async function listSourcesResponse(_request: Request, env: Env, projectId: string): Promise<Response> {
  const db = database(env);
  await requireProject(db, projectId);
  const sources = await listSources(db, projectId);
  return json({ ok: true, sources: sources.map(presentSource) });
}

export async function createSourceResponse(request: Request, env: Env, projectId: string): Promise<Response> {
  const db = database(env);
  await requireProject(db, projectId);
  const body = await readJson(request);
  const name = requiredName(body.name);
  const source = await createSource(db, projectId, name);
  return json({ ok: true, source: presentSource({ ...source, entries: [] }) }, 201);
}

export async function patchSourceResponse(request: Request, env: Env, projectId: string, sourceId: string): Promise<Response> {
  const db = database(env);
  await requireProject(db, projectId);
  const body = await readJson(request);
  if (typeof body.enabled !== "boolean") throw new HttpError(400, "请用 enabled: true 或 false 启用或停用数据源", "bad_field");
  const source = await setSourceEnabled(db, projectId, sourceId, body.enabled);
  const listed = await listSources(db, projectId);
  const full = listed.find((item) => item.id === source.id) ?? { ...source, entries: [] };
  return json({ ok: true, source: presentSource(full) });
}

export async function ingestSourceResponse(request: Request, env: Env, projectId: string, sourceId: string): Promise<Response> {
  await assertDataSourceToken(request, env);
  const db = database(env);
  await requireProject(db, projectId);
  const source = await getSource(db, projectId, sourceId);
  if (!source) throw new HttpError(404, "没有这个选题数据源", "not_found");
  return writeEntry(db, source, await readJson(request, 200_000));
}

export async function ingestNamedSourceResponse(request: Request, env: Env, projectId: string): Promise<Response> {
  await assertDataSourceToken(request, env);
  const db = database(env);
  await requireProject(db, projectId);
  const body = await readJson(request, 200_000);
  const name = requiredName(body.sourceName);
  const source = await findSourceByName(db, projectId, name);
  if (!source) {
    throw new HttpError(404, `这个项目里还没有名为「${name}」的选题数据源。请先在项目里添加它。`, "not_found");
  }
  return writeEntry(db, source, body);
}

async function writeEntry(db: D1Database, source: StoredSource, body: Record<string, unknown>): Promise<Response> {
  const title = requiredTitle(body.title);
  const text = requiredBody(body.body);
  const url = body.url === undefined || body.url === null || body.url === "" ? null : assertSourceUrl(requiredText(body.url, "链接"));
  const collectedAt = readCollectedAt(body.collectedAt);
  const entry = await addSourceEntry(db, source, { title, body: text, url, collectedAt });
  const listed = await listSources(db, source.projectId);
  const full = listed.find((item) => item.id === source.id);
  return json({ ok: true, entry: presentEntry(entry), source: full ? presentSource(full) : null }, 201);
}

function presentSource(source: StoredSource & { entries: StoredEntry[] }) {
  return {
    id: source.id,
    projectId: source.projectId,
    name: source.name,
    enabled: source.enabled,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    lastEntryAt: source.lastEntryAt,
    entries: source.entries.map(presentEntry),
  };
}

function presentEntry(entry: StoredEntry) {
  return {
    id: entry.id,
    sourceId: entry.sourceId,
    title: entry.title,
    body: entry.body,
    url: entry.url,
    collectedAt: entry.collectedAt,
    createdAt: entry.createdAt,
  };
}

function requiredName(value: unknown): string {
  const name = requiredText(value, "数据源名称").trim();
  if (!name) throw new HttpError(400, "请先写数据源名称", "bad_field");
  if (countChars(name) > SOURCE_NAME_MAX) throw new HttpError(400, `数据源名称最多 ${SOURCE_NAME_MAX} 字`, "too_long");
  return name;
}

function requiredTitle(value: unknown): string {
  const title = requiredText(value, "标题").trim();
  if (!title) throw new HttpError(400, "请写摘要标题", "bad_field");
  return truncateChars(title, SOURCE_TITLE_MAX);
}

function requiredBody(value: unknown): string {
  const text = requiredText(value, "正文").trim();
  if (!text) throw new HttpError(400, "请写摘要正文", "bad_field");
  return truncateChars(text, SOURCE_BODY_MAX);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new HttpError(400, `${label} 需要是字符串`, "bad_field");
  return value;
}

function readCollectedAt(value: unknown): string {
  if (value === undefined || value === null || value === "") return nowIso();
  if (typeof value !== "string") throw new HttpError(400, "collectedAt 需要是时间字符串", "bad_field");
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new HttpError(400, "collectedAt 不是有效时间", "bad_field");
  return new Date(parsed).toISOString();
}

async function requireProject(db: D1Database, projectId: string) {
  const project = await getProject(db, projectId);
  if (!project) throw new HttpError(404, "没有这个项目", "not_found");
  return project;
}

function database(env: Env): D1Database {
  if (!env.DB) {
    throw new HttpError(
      503,
      "D1（绑定 DB）或 R2（绑定 ASSETS）还不可用。请确认 wrangler.toml 已填写 database_id 和 bucket_name 后重新部署。",
      "bindings_missing",
    );
  }
  return env.DB;
}
