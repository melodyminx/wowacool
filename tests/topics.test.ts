import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/cloudflare/worker.js";
import { buildTopicUserPrompt, fixtureTopics, parseTopicResponse } from "../src/copywriting/topics.js";
import { buildUserPrompt } from "../src/copywriting/generate.js";
import { renderProjectContext, type ProjectContext } from "../src/copywriting/context.js";
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

test("没有项目时，选题提示词保持原来的四行", () => {
  const prompt = buildTopicUserPrompt({ niche: "租房厨房", audience: "", keywords: "", idea: "" }, 6);
  assert.equal(prompt, "请给出 6 个小红书图文选题。\n领域：租房厨房\n受众：未指定\n关键词：未指定\n粗略想法：未指定");
  assert.equal(buildUserPrompt("桌面整理", 2).includes("项目资料"), false);
});

test("选题和文案提示词会写进项目资料，并标明看不到的图片和未抽取的 PDF", () => {
  const context: ProjectContext = {
    name: "春季护肤",
    positioning: "干皮晚间护理",
    niche: "护肤",
    audience: "干皮",
    notes: "",
    materials: [
      { kind: "note", title: "产品说明", text: "主打燕麦蜂蜜卸妆膏，适合干皮。" },
      { kind: "file", title: "包装正面", text: "", filename: "pack.png", mimeType: "image/png" },
      { kind: "file", title: "检测报告", text: "", filename: "report.pdf", mimeType: "application/pdf" },
      { kind: "link", title: "官网说明", text: "只记了卖点", url: "https://example.com/oat" },
    ],
  };
  const topicPrompt = buildTopicUserPrompt({ niche: "", audience: "", keywords: "卸妆", idea: "" }, 4, context);
  assert.match(topicPrompt, /燕麦蜂蜜卸妆膏/);
  assert.match(topicPrompt, /参考图/);
  assert.match(topicPrompt, /PDF 未抽取正文/);
  assert.match(topicPrompt, /不是打开网页后的正文|不是网页正文|用户保存的链接/);
  assert.match(topicPrompt, /不是热榜/);
  const copyPrompt = buildUserPrompt("干皮晚间卸妆", 1, context);
  assert.match(copyPrompt, /燕麦蜂蜜卸妆膏/);
  assert.match(copyPrompt, /不要编造/);
  const rendered = renderProjectContext({ ...context, materials: [], notes: "" });
  assert.match(rendered, /还没有上传资料/);
  const huge = renderProjectContext({
    ...context,
    materials: [{ kind: "note", title: "长文", text: "燕".repeat(4000) }],
  });
  assert.equal(huge.includes("燕".repeat(4000)), false);
  assert.match(huge, /燕燕/);
});

test("助手写入的调研摘要进入选题提示词，停用内容不在这份上下文里", () => {
  const context: ProjectContext = {
    name: "全球AI产品资讯",
    positioning: "",
    niche: "AI 产品",
    audience: "",
    notes: "",
    materials: [],
    sources: [
      {
        name: "ai产品发布评测",
        entries: [{ title: "某模型更新", text: "这是助手整理的发布摘要", url: "https://example.com/release" }],
      },
    ],
  };
  const topicPrompt = buildTopicUserPrompt({ niche: "", audience: "", keywords: "发布", idea: "" }, 4, context);
  assert.match(topicPrompt, /助手写入的调研摘要/);
  assert.match(topicPrompt, /某模型更新/);
  assert.match(topicPrompt, /这是助手整理的发布摘要/);
  assert.match(topicPrompt, /不是热榜/);
  assert.match(topicPrompt, /不是官方排名/);
  const copyPrompt = buildUserPrompt("本周产品", 1, context);
  assert.match(copyPrompt, /助手写入的调研摘要/);
  assert.match(copyPrompt, /这是助手整理的发布摘要/);
  const topics = fixtureTopics({ niche: "AI", audience: "", keywords: "", idea: "" }, 2, context);
  assert.match(topics[0].why, /调研「某模型更新」/);
  assert.equal(/热榜|阅读量|排名/.test(topics[0].title + topics[0].why), false);
  assert.equal(topicPrompt.includes("停用摘要贝塔"), false);
});

test("示例选题会点名项目资料，并且不提热榜", () => {
  const topics = fixtureTopics(
    { niche: "", audience: "干皮", keywords: "", idea: "" },
    4,
    {
      name: "春季护肤",
      positioning: "",
      niche: "",
      audience: "干皮",
      notes: "",
      materials: [{ kind: "note", title: "燕麦蜂蜜", text: "适合干皮晚间使用" }],
    },
  );
  assert.equal(topics.length, 4);
  assert.match(topics[0].why, /资料「燕麦蜂蜜」/);
  assert.equal(topics.every((topic) => !/热榜|阅读量|排名/.test(`${topic.title}${topic.why}`)), true);
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
