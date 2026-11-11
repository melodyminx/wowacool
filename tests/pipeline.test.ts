import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../src/config.js";
import { exportJob, runLocalPipeline } from "../src/jobs/pipeline.js";
import { ReviewGateError } from "../src/review/gate.js";
import { parseMediaInfo } from "../src/export/postNote.js";

function testConfig(): AppConfig {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const dataDir = mkdtempSync(resolve(tmpdir(), "wowacool-"));
  return {
    projectRoot,
    paths: {
      root: projectRoot,
      dataDir,
      jobsDir: resolve(dataDir, "jobs"),
      exportsDir: resolve(dataDir, "exports"),
      logsDir: resolve(dataDir, "logs"),
      catalogDir: resolve(dataDir, "catalog"),
      catalogFile: resolve(dataDir, "catalog", "free-models.json"),
      quotaFile: resolve(dataDir, "catalog", "quota-snapshot.json"),
    },
    preferredModel: "liquid/lfm-3-1.7b:free",
    imageProvider: "mock",
    workersAiModel: "@cf/black-forest-labs/flux-2-klein-4b",
  };
}

test("本地 mock 流程：未批准不能导出，批准后可导出素材包", async () => {
  const config = testConfig();
  const pending = await runLocalPipeline({
    topic: "桌面整理小巧思",
    imageCount: 3,
    skipLlm: true,
    approve: false,
    config,
  });
  assert.equal(pending.job.status, "pending_review");
  assert.equal(pending.job.images.length, 3);
  assert.equal(Array.from(pending.job.title).length <= 20, true);
  assert.throws(() => exportJob({ jobId: pending.job.id, config }), ReviewGateError);

  const approved = await runLocalPipeline({
    topic: "桌面整理小巧思",
    imageCount: 2,
    skipLlm: true,
    approve: true,
    config,
  });
  assert.equal(approved.job.status, "exported");
  assert.ok(approved.exportResult?.exportDir);
  const manifest = JSON.parse(readFileSync(approved.exportResult!.manifestPath, "utf8"));
  assert.equal(manifest.postNote.title, approved.job.title);
  const media = parseMediaInfo(manifest.postNote.mediaInfo);
  assert.equal(media.image_resources.length, 2);
  assert.ok(media.image_resources.every((item: { url: string }) => item.url.startsWith("xhsfile://") || item.url.startsWith("https://")));
  const image = readFileSync(resolve(approved.exportResult!.exportDir, "images", "01.png"));
  assert.equal(image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);
});
