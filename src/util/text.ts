/** 按 Unicode 码点计「字」，对齐小红书字数上限 */
export function countChars(text: string): number {
  return Array.from(text).length;
}

export function truncateChars(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return chars.slice(0, max).join("");
}

export function normalizeTags(input: string | string[] | undefined): string {
  const parts = Array.isArray(input)
    ? input
    : (input ?? "")
        .split(/[,，]/)
        .map((s) => s.trim());
  const cleaned = parts
    .map((tag) => tag.replace(/^[#＃]+/, "").trim())
    .filter(Boolean);
  const unique: string[] = [];
  for (const tag of cleaned) {
    if (!unique.includes(tag)) unique.push(tag);
  }
  return unique.join(",");
}

export function splitTags(tags: string): string[] {
  return tags
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
