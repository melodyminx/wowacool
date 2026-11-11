import { MAX_FALLBACKS, PREFERRED_FREE_MODEL } from "../constants.js";
import type { FreeModel, ModelRoute } from "../types.js";
import { isFreeModel, isTextChatModel, sortFreeTextModels, type ModelLike } from "./catalog.js";

export class PaidModelRejectedError extends Error {
  constructor(ids: string[]) {
    super(`回退链中出现非免费模型，已拒绝：${ids.join(", ")}`);
    this.name = "PaidModelRejectedError";
  }
}

export function assertAllFree(ids: string[], catalog: ModelLike[]): void {
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const paid: string[] = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (found) {
      if (!isFreeModel(found)) paid.push(id);
    } else if (!id.endsWith(":free")) {
      // 不在目录里且没有 :free 后缀，一律视为不安全，禁止进入回退链
      paid.push(id);
    }
  }
  if (paid.length > 0) throw new PaidModelRejectedError(paid);
}

export function assertAllFreeTextChat(
  ids: string[],
  catalog: ModelLike[],
): void {
  assertAllFree(ids, catalog);
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const notText: string[] = [];
  for (const id of ids) {
    const found = byId.get(id);
    if (found && !isTextChatModel(found)) notText.push(id);
  }
  if (notText.length > 0) {
    throw new Error(`回退链中出现非文本聊天模型，已拒绝：${notText.join(", ")}`);
  }
}

export function buildModelRoute(
  freeTextModels: FreeModel[],
  options?: { preferredId?: string; maxFallbacks?: number },
): ModelRoute {
  if (freeTextModels.length === 0) {
    throw new Error("当前免费文本模型目录为空，请先运行 catalog refresh。");
  }
  const preferred = options?.preferredId ?? PREFERRED_FREE_MODEL;
  const sorted = sortFreeTextModels(freeTextModels, preferred);
  const candidates = sorted.map((m) => m.id);
  const maxFallbacks = options?.maxFallbacks ?? MAX_FALLBACKS;
  const model = candidates[0];
  const models = candidates.slice(1, 1 + maxFallbacks);
  assertAllFreeTextChat([model, ...models], freeTextModels);
  return { model, models, candidates };
}

export function rotateRoute(route: ModelRoute, failedModel: string): ModelRoute | null {
  const remaining = route.candidates.filter((id) => id !== failedModel);
  if (remaining.length === 0) return null;
  const stillInPlay = [route.model, ...route.models].filter((id) => id !== failedModel);
  const nextPrimary = stillInPlay[0] ?? remaining[0];
  const rest = remaining.filter((id) => id !== nextPrimary);
  return {
    model: nextPrimary,
    models: rest.slice(0, MAX_FALLBACKS),
    candidates: remaining,
  };
}

export function isRetryableModelError(status: number, bodyText: string): boolean {
  if ([429, 404, 408, 502, 503, 520, 522, 524].includes(status)) return true;
  const text = bodyText.toLowerCase();
  return (
    text.includes("rate limit") ||
    text.includes("rate-limit") ||
    text.includes("unavailable") ||
    text.includes("no endpoints") ||
    text.includes("not found") ||
    text.includes("overloaded") ||
    text.includes("capacity") ||
    text.includes("provider returned error")
  );
}

/** 日额度用尽等账户级限制，换模型也无意义 */
export function isDailyQuotaExhausted(status: number, bodyText: string, remaining?: number): boolean {
  if (remaining === 0) return true;
  if (status !== 429 && status !== 402) return false;
  const text = bodyText.toLowerCase();
  return (
    text.includes("daily") ||
    text.includes("per day") ||
    text.includes("free-model") ||
    text.includes("free model")
  );
}
