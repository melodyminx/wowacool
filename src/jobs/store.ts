import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Job, JobImage } from "../types.js";
import type { DataPaths } from "../util/paths.js";
import { newId, nowIso } from "../util/id.js";

export function jobDir(paths: DataPaths, jobId: string): string {
  return resolve(paths.jobsDir, jobId);
}

export function createJob(paths: DataPaths, topic: string): Job {
  const id = newId("job");
  const now = nowIso();
  const job: Job = {
    id,
    topic: topic.trim(),
    status: "draft",
    title: "",
    content: "",
    tags: "",
    imagePrompts: [],
    images: [],
    createdAt: now,
    updatedAt: now,
  };
  saveJob(paths, job);
  return job;
}

export function saveJob(paths: DataPaths, job: Job): void {
  const dir = jobDir(paths, job.id);
  mkdirSync(resolve(dir, "images"), { recursive: true });
  writeFileSync(resolve(dir, "job.json"), `${JSON.stringify(job, null, 2)}\n`, "utf8");
}

export function loadJob(paths: DataPaths, jobId: string): Job {
  const file = resolve(jobDir(paths, jobId), "job.json");
  if (!existsSync(file)) {
    throw new Error(`找不到任务 ${jobId}`);
  }
  return JSON.parse(readFileSync(file, "utf8")) as Job;
}

export function listJobs(paths: DataPaths): Job[] {
  if (!existsSync(paths.jobsDir)) return [];
  return readdirSync(paths.jobsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = resolve(paths.jobsDir, entry.name, "job.json");
      if (!existsSync(file)) return null;
      return JSON.parse(readFileSync(file, "utf8")) as Job;
    })
    .filter((job): job is Job => Boolean(job))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function writeJobImages(paths: DataPaths, job: Job, images: JobImage[], files: Map<string, Buffer>): Job {
  const dir = resolve(jobDir(paths, job.id), "images");
  mkdirSync(dir, { recursive: true });
  for (const image of images) {
    const bytes = files.get(image.filename);
    if (!bytes) throw new Error(`缺少图片字节：${image.filename}`);
    writeFileSync(resolve(dir, image.filename), bytes);
  }
  const next: Job = {
    ...job,
    images,
    updatedAt: nowIso(),
  };
  saveJob(paths, next);
  return next;
}
