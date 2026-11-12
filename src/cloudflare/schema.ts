import { HttpError } from "./http.js";

const ready = new WeakMap<object, Promise<void>>();

const CREATE_PROJECTS = `CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  positioning TEXT NOT NULL DEFAULT '',
  niche TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const CREATE_MATERIALS = `CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  filename TEXT,
  mime_type TEXT,
  r2_key TEXT,
  byte_size INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id)
)`;

/**
 * Additive schema for an existing wowacool database.
 * Cached per D1 binding so a request does not repeat the DDL.
 * A fresh in-memory database used by tests gets its own cache entry.
 */
export function ensureProjectSchema(db: D1Database): Promise<void> {
  const key = db as object;
  const existing = ready.get(key);
  if (existing) return existing;
  const pending = migrate(db).catch((error: unknown) => {
    ready.delete(key);
    throw error;
  });
  ready.set(key, pending);
  return pending;
}

async function migrate(db: D1Database): Promise<void> {
  try {
    const jobs = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'jobs'`).first<{ name: string }>();
    if (!jobs) {
      throw new HttpError(503, "任务表还不存在。请先对 D1 执行 schema/d1.sql。", "schema_outdated");
    }
    await db.prepare(CREATE_PROJECTS).run();
    await db.prepare(CREATE_MATERIALS).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(archived, updated_at)`).run();
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id, created_at)`).run();
    const info = await db.prepare(`PRAGMA table_info(jobs)`).all<{ name: string }>();
    const names = new Set((info.results ?? []).map((row) => row.name));
    if (!names.has("project_id")) {
      await db.prepare(`ALTER TABLE jobs ADD COLUMN project_id TEXT`).run();
    }
    await db.prepare(`CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id)`).run();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(JSON.stringify({ message: "project schema migration failed" }));
    throw new HttpError(
      503,
      "项目表还没准备好。请先对 D1 数据库 wowacool 执行 schema/migrations/0002_projects.sql。",
      "schema_outdated",
    );
  }
}
