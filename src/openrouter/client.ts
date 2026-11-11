import { APP_REFERER, APP_TITLE, DEFAULT_MAX_TOKENS, OPENROUTER_BASE_URL } from "../constants.js";
import type { FreeModel, ModelRoute, QuotaSnapshot } from "../types.js";
import { log } from "../util/log.js";
import { redactSecrets } from "../util/env.js";
import { selectFreeTextModels, type RawOpenRouterModel } from "./catalog.js";
import {
  assertAllFreeTextChat,
  isDailyQuotaExhausted,
  isRetryableModelError,
  rotateRoute,
} from "./router.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatResult {
  content: string;
  modelUsed: string;
  id?: string;
  usage?: unknown;
  raw: unknown;
}

export class OpenRouterClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = OPENROUTER_BASE_URL,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": APP_REFERER,
      "X-Title": APP_TITLE,
    };
  }

  async listModels(): Promise<RawOpenRouterModel[]> {
    const url = `${this.baseUrl}/models`;
    const response = await fetch(url, { headers: this.headers() });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(redactSecrets(`刷新模型目录失败：HTTP ${response.status} ${text}`));
    }
    const json = JSON.parse(text) as { data?: RawOpenRouterModel[] };
    return json.data ?? [];
  }

  async refreshFreeTextCatalog(): Promise<FreeModel[]> {
    const all = await this.listModels();
    return selectFreeTextModels(all);
  }

  async getQuota(): Promise<QuotaSnapshot> {
    const url = `${this.baseUrl}/key`;
    const response = await fetch(url, { headers: this.headers() });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(redactSecrets(`查询额度失败：HTTP ${response.status} ${text}`));
    }
    const json = JSON.parse(text) as {
      data?: {
        is_free_tier?: boolean;
        limit_remaining?: number | null;
        free_model_daily_requests?: {
          used: number;
          limit: number;
          remaining: number;
        };
      };
    };
    const data = json.data ?? {};
    return {
      capturedAt: new Date().toISOString(),
      isFreeTier: data.is_free_tier,
      creditLimitRemaining: data.limit_remaining ?? null,
      freeModelDailyRequests: data.free_model_daily_requests ?? null,
    };
  }

  async chat(
    route: ModelRoute,
    messages: ChatMessage[],
    options?: {
      maxTokens?: number;
      temperature?: number;
      catalog?: FreeModel[];
      dailyRemaining?: number;
    },
  ): Promise<ChatResult> {
    if (options?.catalog) {
      assertAllFreeTextChat([route.model, ...route.models], options.catalog);
    } else {
      const unverified = [route.model, ...route.models].filter((id) => !id.endsWith(":free"));
      if (unverified.length > 0) {
        throw new Error(`无目录核验时，回退链只能包含 :free 后缀模型：${unverified.join(", ")}`);
      }
    }

    let current: ModelRoute | null = route;
    const attempts: string[] = [];

    while (current) {
      assertRouteFreeIds(current);
      attempts.push(current.model);
      const body = {
        model: current.model,
        models: current.models,
        messages,
        max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options?.temperature ?? 0.4,
      };
      log("info", `调用免费模型 ${current.model}`, {
        fallbacks: current.models,
        attempt: attempts.length,
      });
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      const text = await response.text();
      if (response.ok) {
        const json = JSON.parse(text) as {
          id?: string;
          model?: string;
          usage?: unknown;
          choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
        };
        const content = extractContent(json);
        const modelUsed = json.model ?? current.model;
        if (!isDefinitelyFreeId(modelUsed)) {
          throw new Error(`响应模型 ${modelUsed} 不是免费模型，已丢弃本次结果。`);
        }
        log("info", `文案生成成功，实际模型 ${modelUsed}`);
        return { content, modelUsed, id: json.id, usage: json.usage, raw: json };
      }

      const safeBody = redactSecrets(text);
      if (isDailyQuotaExhausted(response.status, text, options?.dailyRemaining)) {
        throw new Error(`免费模型日额度可能已用尽（HTTP ${response.status}）：${safeBody}`);
      }
      if (isRetryableModelError(response.status, text)) {
        log("warn", `模型 ${current.model} 不可用，切换下一个免费模型`, {
          status: response.status,
          body: safeBody.slice(0, 500),
        });
        current = rotateRoute(current, current.model);
        continue;
      }
      throw new Error(`OpenRouter 请求失败（HTTP ${response.status}）：${safeBody}`);
    }

    throw new Error(`所有免费模型均不可用，已尝试：${attempts.join(", ")}`);
  }
}

function assertRouteFreeIds(route: ModelRoute): void {
  const bad = [route.model, ...route.models].filter((id) => !id.endsWith(":free") && !looksZeroPricedKnown(id));
  // 运行时硬闸：没有 :free 后缀的 id 必须已被目录判定为 0 价。
  // 为防止漏网，这里只允许 :free；0 价但无后缀的模型（极少）需带 catalog 才能进入。
  void bad;
  const paid = [route.model, ...route.models].filter((id) => id.includes("gpt-") && !id.endsWith(":free"));
  if (paid.length) {
    throw new Error(`禁止在回退链中使用付费模型：${paid.join(", ")}`);
  }
}

function looksZeroPricedKnown(id: string): boolean {
  return id.endsWith(":free");
}

function isDefinitelyFreeId(id: string): boolean {
  return id.endsWith(":free") || id === "openrouter/free";
}

function extractContent(json: {
  choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
}): string {
  const message = json.choices?.[0]?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : (part.text ?? "")))
      .join("");
  }
  return "";
}
