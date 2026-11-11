import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function findProjectRoot(start = fileURLToPath(new URL(".", import.meta.url))): string {
  let current = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(resolve(current, "package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

export interface DataPaths {
  root: string;
  dataDir: string;
  jobsDir: string;
  exportsDir: string;
  logsDir: string;
  catalogDir: string;
  catalogFile: string;
  quotaFile: string;
}

export function resolveDataPaths(projectRoot = findProjectRoot()): DataPaths {
  const dataDir = process.env.WOWACOOL_DATA_DIR
    ? resolve(process.env.WOWACOOL_DATA_DIR)
    : resolve(projectRoot, "data");
  const catalogDir = resolve(dataDir, "catalog");
  return {
    root: projectRoot,
    dataDir,
    jobsDir: resolve(dataDir, "jobs"),
    exportsDir: resolve(dataDir, "exports"),
    logsDir: resolve(dataDir, "logs"),
    catalogDir,
    catalogFile: resolve(catalogDir, "free-models.json"),
    quotaFile: resolve(catalogDir, "quota-snapshot.json"),
  };
}
