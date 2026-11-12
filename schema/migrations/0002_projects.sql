-- Additive migration for the existing D1 database `wowacool`.
-- Run once before relying on project routes in production:
--   npx wrangler d1 execute wowacool --remote --file=schema/migrations/0002_projects.sql
-- CREATE statements are safe to repeat.
-- ALTER TABLE fails if project_id already exists; skip this file on a second run.
-- The Worker applies the same additive change when jobs.project_id is missing,
-- so existing /jobs routes keep working if this file has not been run yet.
-- Do not put account ids, tokens, or API keys in this file.
-- Jobs without a project keep project_id NULL and stay visible as 「未分组」.

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  positioning TEXT NOT NULL DEFAULT '',
  niche TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS materials (
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
);

CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(archived, updated_at);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id, created_at);

ALTER TABLE jobs ADD COLUMN project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
