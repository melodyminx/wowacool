import { randomBytes } from "node:crypto";

export function newId(prefix = "job"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const rand = randomBytes(4).toString("hex");
  return `${prefix}-${stamp}-${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
