import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/cloudflare/worker.js";
import { fixtureTopics, parseTopicResponse } from "../src/copywriting/topics.js";
import { createTestEnv } from "./platform.js";

const ORIGIN = "https://wowacool.example";

async function call(env: Env, path: string, body: unknown) {
  return worker.fetch(
    new Request(ORIGIN + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
  );
}

test("选题解析只保留可用条目，并丢掉编造字段", () => {
  const topics = parseTopicResponse(
    '```json\n{"topics":[{"title":"小厨房先清出一块台面","angle":"只讲台面","why":"好拍","hook":"先清一块","views":99999},{"title":""}]}\n```',
    6,
  );
  assert.equal(topics.length, 1);
  assert.equal(topics[0].title, "小厨房先清出一块台面");
  assert.equal("views" in topics[0], false);
});

test("示例选题不提热榜，并且能直接建成任务", () => {
  const topics = fixtureTopics({ niche: "租房厨房", audience: "独居", keywords: "收纳", idea: "" }, 4);
  assert.equal(topics.length, 4);
  assert.equal(topics.every((topic) => !/热榜|阅读量|排名/.test(`${topic.title}${topic.why}`)), true);
});

test("没有密钥时推荐选题会说明原因，示例选题不访问网络", async () => {
  const env = createTestEnv();
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("示例选题不应该访问网络");
  };
  try {
    const missing = await call(env, "/topics", { niche: "租房厨房" });
    assert.equal(missing.status, 400);
    const missingBody = (await missing.json()) as { code: string; error: string };
    assert.equal(missingBody.code, "missing_api_key");
    assert.match(missingBody.error, /示例选题/);
    assert.match(missingBody.error, /不会改用付费模型/);

    const fixture = await call(env, "/topics", { niche: "租房厨房", audience: "独居", fixture: true });
    assert.equal(fixture.status, 200);
    const body = (await fixture.json()) as {
      fixture: boolean;
      modelUsed: string;
      topics: Array<{ title: string; angle: string; why: string; hook: string }>;
    };
    assert.equal(body.fixture, true);
    assert.equal(body.modelUsed, "fixture/local");
    assert.equal(body.topics.length >= 4, true);
    assert.ok(body.topics[0].angle);
    assert.ok(body.topics[0].why);

    const topic = `${body.topics[0].title}。角度：${body.topics[0].angle}`;
    const created = await call(env, "/jobs", { topic });
    assert.equal(created.status, 201);
    const job = ((await created.json()) as { job: { topic: string; status: string } }).job;
    assert.equal(job.status, "draft");
    assert.match(job.topic, /角度/);
  } finally {
    globalThis.fetch = original;
  }
});

test("选题推荐只用免费文本模型，并且不抓取小红书", async () => {
  const env = createTestEnv({ OPENROUTER_API_KEY: "sk-or-v1-test-key" });
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith("/models")) {
      return Response.json({
        data: [
          {
            id: "openai/gpt-4o",
            name: "GPT-4o",
            pricing: { prompt: "0.01", completion: "0.03" },
            architecture: { output_modalities: ["text"] },
          },
          {
            id: "liquid/lfm-3-1.7b:free",
            name: "LFM",
            pricing: { prompt: "0", completion: "0" },
            architecture: { output_modalities: ["text"] },
          },
        ],
      });
    }
    if (url.endsWith("/key")) {
      return Response.json({ data: { is_free_tier: true, limit_remaining: 1, free_model_daily_requests: { used: 1, limit: 50, remaining: 49 } } });
    }
    if (url.includes("/chat/completions")) {
      const payload = JSON.parse(String(init?.body)) as { model: string; models: string[] };
      assert.equal([...payload.models, payload.model].every((id) => id.endsWith(":free")), true);
      assert.equal(payload.models.length <= 3, true);
      return Response.json({
        model: payload.model,
        choices: [
          {
            message: {
              content: JSON.stringify({
                topics: [
                  { title: "租房厨房先清台面", angle: "只讲一块台面", why: "好开始", hook: "先清一块" },
                  { title: "小冰箱分层", angle: "按取用频率", why: "每天都会打开", hook: "打开就能拿到" },
                  { title: "调料收成一盒", angle: "减少台面瓶罐", why: "拍照更干净", hook: "瓶罐先回家" },
                  { title: "碗筷竖放", angle: "利用高度", why: "小柜子也放得下", hook: "别再叠成山" },
                ],
              }),
            },
          },
        ],
      });
    }
    throw new Error(`意外请求 ${url}`);
  };
  try {
    const response = await call(env, "/topics", { niche: "租房厨房", keywords: "收纳" });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { fixture: boolean; modelUsed: string; topics: Array<{ title: string }> };
    assert.equal(body.fixture, false);
    assert.equal(body.modelUsed.endsWith(":free"), true);
    assert.equal(body.topics.length, 4);
    assert.equal(urls.some((url) => /xiaohongshu|hot-list|seedance|grok/i.test(url)), false);
  } finally {
    globalThis.fetch = original;
  }
});
