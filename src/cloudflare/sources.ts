import { HttpError } from "./http.js";
import { newId, nowIso } from "../util/id.js";
import { countChars, truncateChars } from "../util/text.js";
import type { SourceSnippet } from "../copywriting/context.js";

export const SOURCE_NAME_MAX = 40;
export const SOURCE_TITLE_MAX = 120;
export const SOURCE_BODY_MAX = 8_000;
export const SOURCES_MAX = 12;
export const ENTRIES_KEEP = 8;
const PROMPT_SOURCES = 4;
const PROMPT_ENTRIES = 3;
const PROMPT_EXCERPT = 360;

export interface StoredSource {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastEntryAt: string | null;
}

export interface StoredEntry {
  id: string;
  sourceId: string;
  projectId: string;
  title: string;
  body: string;
  url: string | null;
  collectedAt: string;
  createdAt: string;
}

interface SourceRow {
  id: string;
  project_id: string;
  name: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  last_entry_at: string | null;
}

interface EntryRow {
  id: string;
  source_id: string;
  project_id: string;
  title: string;
  body: string;
  url: string | null;
  collected_at: string;
  created_at: string;
}

export async function listSources(db: D1Database, projectId: string): Promise<Array<StoredSource & { entries: StoredEntry[] }>> {
  const sources = await db
    .prepare(
      `SELECT id, project_id, name, enabled, created_at, updated_at, last_entry_at
       FROM data_sources WHERE project_id = ? ORDER BY updated_at DESC, id DESC`,
    )
    .bind(projectId)
    .all<SourceRow>();
  const entries = await db
    .prepare(
      `SELECT id, source_id, project_id, title, body, url, collected_at, created_at
       FROM data_source_entries WHERE project_id = ? ORDER BY collected_at DESC, created_at DESC, id DESC`,
    )
    .bind(projectId)
    .all<EntryRow>();
  const grouped = new Map<string, StoredEntry[]>();
  for (const row of entries.results ?? []) {
    const list = grouped.get(row.source_id) ?? [];
    if (list.length < ENTRIES_KEEP) list.push(hydrateEntry(row));
    grouped.set(row.source_id, list);
  }
  return (sources.results ?? []).map((row) => ({ ...hydrateSource(row), entries: grouped.get(row.id) ?? [] }));
}

export async function createSource(db: D1Database, projectId: string, name: string): Promise<StoredSource> {
  const count = await db.prepare(`SELECT COUNT(*) AS n FROM data_sources WHERE project_id = ?`).bind(projectId).first<{ n: number }>();
  if (Number(count?.n ?? 0) >= SOURCES_MAX) {
    throw new HttpError(409, `每个项目最多 ${SOURCES_MAX} 个选题数据源`, "too_many_sources");
  }
  const id = newId("src");
  const now = nowIso();
  try {
    await db
      .prepare(
        `INSERT INTO data_sources (id, project_id, name, enabled, created_at, updated_at, last_entry_at)
         VALUES (?, ?, ?, 1, ?, ?, NULL)`,
      )
      .bind(id, projectId, name, now, now)
      .run();
  } catch (error) {
    if (isUnique(error)) throw new HttpError(409, "这个项目里已经有同名的选题数据源", "duplicate_source");
    throw error;
  }
  const saved = await getSource(db, projectId, id);
  if (!saved) throw new HttpError(500, "数据源写入后无法读取", "read_failed");
  return saved;
}

export async function getSource(db: D1Database, projectId: string, sourceId: string): Promise<StoredSource | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, name, enabled, created_at, updated_at, last_entry_at
       FROM data_sources WHERE id = ? AND project_id = ?`,
    )
    .bind(sourceId, projectId)
    .first<SourceRow>();
  return row ? hydrateSource(row) : null;
}

export async function findSourceByName(db: D1Database, projectId: string, name: string): Promise<StoredSource | null> {
  const row = await db
    .prepare(
      `SELECT id, project_id, name, enabled, created_at, updated_at, last_entry_at
       FROM data_sources WHERE project_id = ? AND name = ?`,
    )
    .bind(projectId, name)
    .first<SourceRow>();
  return row ? hydrateSource(row) : null;
}

export async function setSourceEnabled(db: D1Database, projectId: string, sourceId: string, enabled: boolean): Promise<StoredSource> {
  const existing = await getSource(db, projectId, sourceId);
  if (!existing) throw new HttpError(404, "没有这个选题数据源", "not_found");
  const now = nowIso();
  await db
    .prepare(`UPDATE data_sources SET enabled = ?, updated_at = ? WHERE id = ? AND project_id = ?`)
    .bind(enabled ? 1 : 0, now, sourceId, projectId)
    .run();
  const saved = await getSource(db, projectId, sourceId);
  if (!saved) throw new HttpError(404, "没有这个选题数据源", "not_found");
  return saved;
}

export async function addSourceEntry(
  db: D1Database,
  source: StoredSource,
  input: { title: string; body: string; url: string | null; collectedAt: string },
): Promise<StoredEntry> {
  const id = newId("entry");
  const createdAt = nowIso();
  await db
    .prepare(
      `INSERT INTO data_source_entries (id, source_id, project_id, title, body, url, collected_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, source.id, source.projectId, input.title, input.body, input.url, input.collectedAt, createdAt)
    .run();
  await db
    .prepare(`UPDATE data_sources SET last_entry_at = ?, updated_at = ? WHERE id = ?`)
    .bind(input.collectedAt, createdAt, source.id)
    .run();
  const rows = await db
    .prepare(
      `SELECT id FROM data_source_entries WHERE source_id = ? ORDER BY collected_at DESC, created_at DESC, id DESC`,
    )
    .bind(source.id)
    .all<{ id: string }>();
  const drop = (rows.results ?? []).slice(ENTRIES_KEEP).map((row) => row.id);
  if (drop.length) {
    const marks = drop.map(() => "?").join(", ");
    await db.prepare(`DELETE FROM data_source_entries WHERE id IN (${marks})`).bind(...drop).run();
  }
  return {
    id,
    sourceId: source.id,
    projectId: source.projectId,
    title: input.title,
    body: input.body,
    url: input.url,
    collectedAt: input.collectedAt,
    createdAt,
  };
}

/** Enabled sources only, already trimmed for the topic prompt budget. */
export async function loadEnabledSourceSnippets(db: D1Database, projectId: string): Promise<SourceSnippet[]> {
  const sources = await listSources(db, projectId);
  return sources
    .filter((source) => source.enabled)
    .slice(0, PROMPT_SOURCES)
    .map((source) => ({
      name: source.name,
      entries: source.entries.slice(0, PROMPT_ENTRIES).map((entry) => ({
        title: entry.title,
        text: truncateChars(entry.body, PROMPT_EXCERPT),
        url: entry.url ?? undefined,
        collectedAt: entry.collectedAt,
      })),
    }))
    .filter((source) => source.entries.some((entry) => entry.title.trim() || entry.text.trim()));
}

export function assertSourceUrl(value: string): string {
  const urlText = value.trim();
  if (!urlText) throw new HttpError(400, "链接不能是空白", "bad_url");
  if (countChars(urlText) > 500) throw new HttpError(400, "链接最多 500 字", "bad_url");
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    throw new HttpError(400, "链接需要是 http 或 https 地址", "bad_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "链接需要是 http 或 https 地址", "bad_url");
  }
  if (url.username || url.password) throw new HttpError(400, "链接不能带账号", "bad_url");
  return url.toString();
}

function hydrateSource(row: SourceRow): StoredSource {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastEntryAt: row.last_entry_at,
  };
}

function hydrateEntry(row: EntryRow): StoredEntry {
  return {
    id: row.id,
    sourceId: row.source_id,
    projectId: row.project_id,
    title: row.title,
    body: row.body,
    url: row.url,
    collectedAt: row.collected_at,
    createdAt: row.created_at,
  };
}

function isUnique(error: unknown): boolean {
  return error instanceof Error && /UNIQUE/i.test(error.message);
}
