export function newId(prefix = "job"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${stamp}-${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
