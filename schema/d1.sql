-- wowacool D1 schema for database wowacool.
-- Fresh databases can apply this whole file.
-- The production database `wowacool` already has the original tables.
-- Add projects there with schema/migrations/0002_projects.sql (once).
-- The Worker also applies that additive change if `jobs.project_id` is missing.
-- Do not put account ids here.

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  image_count INTEGER NOT NULL DEFAULT 0,
  model_used TEXT,
  review_note TEXT,
  project_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT,
  url TEXT,
  prompt TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS model_catalog (
  id TEXT PRIMARY KEY,
  name TEXT,
  pricing_prompt TEXT,
  pricing_completion TEXT,
  architecture TEXT,
  is_free INTEGER NOT NULL DEFAULT 0,
  is_text_chat INTEGER NOT NULL DEFAULT 0,
  refreshed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quota_snapshots (
  id TEXT PRIMARY KEY,
  used_daily INTEGER,
  daily_limit INTEGER,
  remaining_daily INTEGER,
  credit_limit_remaining REAL,
  is_free_tier INTEGER,
  captured_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_job ON assets(job_id);
CREATE INDEX IF NOT EXISTS idx_audit_job ON audit_log(job_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated ON projects(archived, updated_at);
CREATE INDEX IF NOT EXISTS idx_materials_project ON materials(project_id, created_at);
