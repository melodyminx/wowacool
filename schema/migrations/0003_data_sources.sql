-- Additive topic data sources for the existing D1 database `wowacool`.
-- Safe to run more than once: every statement uses IF NOT EXISTS.
-- Do not re-run schema/migrations/0002_projects.sql. jobs.project_id already exists.
-- The Worker creates these tables on the first business request if they are missing.
-- Apply once if you want the tables before that request:
--   npx wrangler d1 execute wowacool --remote --file=schema/migrations/0003_data_sources.sql
-- Do not put account ids, tokens, or API keys in this file.

CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_entry_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS data_source_entries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  collected_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_id) REFERENCES data_sources(id)
);

CREATE INDEX IF NOT EXISTS idx_data_sources_project ON data_sources(project_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_data_sources_name ON data_sources(project_id, name);
CREATE INDEX IF NOT EXISTS idx_data_source_entries_source ON data_source_entries(source_id, collected_at);
