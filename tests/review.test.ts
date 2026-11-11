import assert from "node:assert/strict";
import test from "node:test";
import { approveJob, assertExportable, rejectJob, ReviewGateError } from "../src/review/gate.js";
import type { Job } from "../src/types.js";

function job(partial: Partial<Job> = {}): Job {
  return {
    id: "job-test",
    topic: "桌面整理小巧思",
    status: "pending_review",
    title: "桌面整理小巧思",
    content: "先从伸手可及的位置开始。",
    tags: "收纳,桌面",
    imagePrompts: ["图1"],
    images: [
      {
        filename: "01.png",
        relativePath: "images/01.png",
        prompt: "图1",
        mimeType: "image/png",
      },
    ],
    createdAt: "2026-11-11T00:00:00.000Z",
    updatedAt: "2026-11-11T00:00:00.000Z",
    ...partial,
  };
}

test("未审核不能导出", () => {
  assert.throws(() => assertExportable(job({ status: "pending_review" })), ReviewGateError);
  assert.throws(() => assertExportable(job({ status: "draft" })), ReviewGateError);
  assert.throws(() => assertExportable(job({ status: "rejected" })), ReviewGateError);
});

test("批准后可以导出，驳回后不能导出", () => {
  const approved = approveJob(job());
  assert.equal(approved.status, "approved");
  assert.doesNotThrow(() => assertExportable(approved));
  const rejected = rejectJob(approved, "改标题");
  assert.equal(rejected.status, "rejected");
  assert.throws(() => assertExportable(rejected), ReviewGateError);
});
