import type { FreeModel } from "../types.js";

export interface ModelLike {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string | number | null;
    completion?: string | number | null;
  };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  endpoints?: string[];
}

export interface RawOpenRouterModel {
  id: string;
  name?: string;
  pricing?: {
    prompt?: string | number;
    completion?: string | number;
    request?: string | number;
    image?: string | number;
  };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  endpoints?: string[];
  context_length?: number;
}

export function isZeroPrice(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = Number(value);
  return Number.isFinite(n) && n === 0;
}

/**
 * 真正免费：id 以 :free 结尾，或 prompt 与 completion 定价均为 0。
 */
export function isFreeModel(model: ModelLike): boolean {
  const id = model.id ?? "";
  const pricing = model.pricing ?? {};
  if (id.endsWith(":free")) return true;
  return isZeroPrice(pricing.prompt) && isZeroPrice(pricing.completion);
}

/**
 * 通用文本聊天模型：输出必须含 text，且不能同时输出 audio/image/video/speech。
 * 排除如 Google Lyria 这类音频生成模型。输入侧多模态（看图）可以保留。
 */
export function isTextChatModel(model: ModelLike): boolean {
  const outputs = model.architecture?.output_modalities ?? [];
  if (!outputs.includes("text")) return false;
  const blocked = new Set(["audio", "image", "video", "speech"]);
  if (outputs.some((m) => blocked.has(m))) return false;
  const endpoints = model.endpoints ?? [];
  if (endpoints.length > 0) {
    return endpoints.some((e) => e.includes("chat/completions"));
  }
  return true;
}

export function toFreeModel(model: ModelLike): FreeModel | null {
  if (!isFreeModel(model)) return null;
  const textChat = isTextChatModel(model);
  return {
    id: model.id,
    name: model.name ?? model.id,
    pricing: {
      prompt: model.pricing?.prompt ?? null,
      completion: model.pricing?.completion ?? null,
    },
    architecture: {
      modality: model.architecture?.modality,
      input_modalities: model.architecture?.input_modalities,
      output_modalities: model.architecture?.output_modalities,
    },
    endpoints: model.endpoints,
    context_length: model.context_length,
    isFree: true,
    isTextChat: textChat,
  };
}

export function selectFreeTextModels(models: ModelLike[]): FreeModel[] {
  const out: FreeModel[] = [];
  for (const model of models) {
    const mapped = toFreeModel(model);
    if (mapped && mapped.isTextChat) out.push(mapped);
  }
  return out;
}

/** 从模型 id 中估算参数量（十亿），用于优先挑选更小的通用文本模型 */
export function estimateBillionParams(id: string): number | null {
  const match = id.match(/(\d+(?:\.\d+)?)\s*b\b/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

export function sortFreeTextModels(models: FreeModel[], preferredId?: string): FreeModel[] {
  return [...models].sort((a, b) => {
    if (preferredId) {
      if (a.id === preferredId && b.id !== preferredId) return -1;
      if (b.id === preferredId && a.id !== preferredId) return 1;
    }
    const pa = estimateBillionParams(a.id);
    const pb = estimateBillionParams(b.id);
    if (pa !== null && pb !== null && pa !== pb) return pa - pb;
    if (pa !== null && pb === null) return -1;
    if (pa === null && pb !== null) return 1;
    return a.id.localeCompare(b.id);
  });
}
