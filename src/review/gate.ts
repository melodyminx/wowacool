import type { Job, JobReview } from "../types.js";
import { nowIso } from "../util/id.js";

export class ReviewGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewGateError";
  }
}

export function canExport(job: Job): boolean {
  return job.status === "approved";
}

export function assertExportable(job: Job): void {
  if (!canExport(job)) {
    throw new ReviewGateError(
      `未批准不得导出可发布素材包。当前任务 ${job.id} 状态为 ${job.status}。请先执行 review approve。`,
    );
  }
  if (!job.images.length) {
    throw new ReviewGateError(`任务 ${job.id} 尚无图片，无法导出。`);
  }
}

export function markPendingReview(job: Job): Job {
  if (job.status === "exported") {
    throw new ReviewGateError("已导出的任务如需重审，请重新创建任务。");
  }
  return { ...job, status: "pending_review", updatedAt: nowIso() };
}

export function approveJob(job: Job, note?: string): Job {
  if (job.status !== "pending_review" && job.status !== "rejected") {
    throw new ReviewGateError(`只有待审核或已驳回的任务可以批准，当前状态为 ${job.status}。`);
  }
  if (!job.title || !job.content || job.images.length === 0) {
    throw new ReviewGateError("标题、正文和图片都齐全后才能批准。");
  }
  const review: JobReview = {
    decision: "approved",
    note,
    at: nowIso(),
  };
  return { ...job, status: "approved", review, updatedAt: review.at };
}

export function rejectJob(job: Job, note?: string): Job {
  if (job.status !== "pending_review" && job.status !== "approved") {
    throw new ReviewGateError(`只有待审核或已批准（尚未导出）的任务可以驳回，当前状态为 ${job.status}。`);
  }
  const review: JobReview = {
    decision: "rejected",
    note,
    at: nowIso(),
  };
  return { ...job, status: "rejected", review, updatedAt: review.at };
}
