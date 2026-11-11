import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { CATALOG_TTL_MS } from "../constants.js";
import type { FreeModel, QuotaSnapshot } from "../types.js";
import type { DataPaths } from "../util/paths.js";

export interface CatalogFile {
  refreshedAt: string;
  models: FreeModel[];
}

export function saveCatalog(paths: DataPaths, models: FreeModel[]): CatalogFile {
  mkdirSync(paths.catalogDir, { recursive: true });
  const file: CatalogFile = {
    refreshedAt: new Date().toISOString(),
    models,
  };
  writeFileSync(paths.catalogFile, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  return file;
}

export function loadCatalog(paths: DataPaths): CatalogFile | null {
  if (!existsSync(paths.catalogFile)) return null;
  const raw = JSON.parse(readFileSync(paths.catalogFile, "utf8")) as CatalogFile;
  if (!raw || !Array.isArray(raw.models)) return null;
  return raw;
}

export function isCatalogFresh(catalog: CatalogFile, now = Date.now()): boolean {
  const ts = Date.parse(catalog.refreshedAt);
  if (!Number.isFinite(ts)) return false;
  return now - ts < CATALOG_TTL_MS;
}

export function saveQuota(paths: DataPaths, snapshot: QuotaSnapshot): void {
  mkdirSync(paths.catalogDir, { recursive: true });
  writeFileSync(paths.quotaFile, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}
