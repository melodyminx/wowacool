import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/cloudflare/worker.js";
import { createTestEnv } from "./platform.js";

const ORIGIN = "https://wowacool.example";
const SOURCE_TOKEN = "source-token-for-tests";
const WRONG_TOKEN = "test-source-token-should-not-echo";
const WORKBENCH_TOKEN = "workbench-token-for-tests";

async function call(
  env: Env,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<Response> {
  return worker.fetch(
    new Request(ORIGIN + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
}

async function createProject(env: Env, headers?: Record<string, string>, name = "全球AI产品资讯") {
  const response = await call(env, "POST", "/projects", { name, niche: "AI 产品", audience: "产品同学" }, headers);
  assert.equal(response.status, 201, await response.clone().text());
  return ((await response.json()) as { project: { id: string } }).project;
}

test("没有 DATA_SOURCE_TOKEN 时不能写入，错误也不带回口令", async () => {
  const env = createTestEnv();
  const project = await createProject(env);
  const created = await call(env, "POST", `/projects/${project.id}/data-sources`, { name: "ai产品发布评测" });
  assert.equal(created.status, 201);
  const sourceId = ((await created.json()) as { source: { id: string } }).source.id;
  const denied = await call(
    env,
    "POST",
    `/projects/${project.id}/data-sources/entries`,
    { sourceName: "ai产品发布评测", title: "不该写入", body: "没有口令" },
    { authorization: `Bearer ${WRONG_TOKEN}` },
  );
  assert.equal(denied.status, 503);
  const text = await denied.text();
  const body = JSON.parse(text) as { code: string; error: string };
  assert.equal(body.code, "missing_data_source_token");
  assert.match(body.error, /DATA_SOURCE_TOKEN/);
  assert.match(body.error, /wrangler secret put/);
  assert.equal(text.includes(WRONG_TOKEN), false);
  const listed = (await (await call(env, "GET", `/projects/${project.id}/data-sources`)).json()) as {
    sources: Array<{ id: string; entries: unknown[] }>;
  };
  assert.equal(listed.sources.find((source) => source.id === sourceId)?.entries.length, 0);
});

test("口令不对时拒绝写入，对了才保存，并且不抓取链接", async () => {
  const env = createTestEnv({ DATA_SOURCE_TOKEN: SOURCE_TOKEN });
  const project = await createProject(env);
  const created = await call(env, "POST", `/projects/${project.id}/data-sources`, { name: "黑客松" });
  assert.equal(created.status, 201);
  const source = ((await created.json()) as { source: { id: string; enabled: boolean } }).source;
  assert.equal(source.enabled, true);

  const wrong = await call(
    env,
    "POST",
    `/projects/${project.id}/data-sources/${source.id}/entries`,
    { title: "不该写入", body: "口令错误", url: "https://ai-vibe-coding-6oft.pages.grok.bot/" },
    { authorization: `Bearer ${WRONG_TOKEN}` },
  );
  assert.equal(wrong.status, 401);
  const wrongText = await wrong.text();
  assert.equal(JSON.parse(wrongText).code, "bad_data_source_token");
  assert.equal(wrongText.includes(WRONG_TOKEN), false);
  assert.equal(wrongText.includes(SOURCE_TOKEN), false);

  const original = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error("写入摘要时不应该打开链接");
  };
  try {
    const missing = await call(env, "POST", `/projects/${project.id}/data-sources/entries`, {
      sourceName: "黑客松",
      title: "缺头",
      body: "没有 Authorization",
    });
    assert.equal(missing.status, 401);

    const saved = await call(
      env,
      "POST",
      `/projects/${project.id}/data-sources/entries`,
      {
        sourceName: "黑客松",
        title: "本周黑客松",
        body: "全球 AI 黑客松池的助手摘要",
        url: "https://ai-vibe-coding-6oft.pages.grok.bot/",
        collectedAt: "2026-11-12T08:00:00+08:00",
      },
      { authorization: `Bearer ${SOURCE_TOKEN}` },
    );
    assert.equal(saved.status, 201);
    const savedBody = (await saved.json()) as { entry: { title: string; url: string; collectedAt: string }; source: { lastEntryAt: string } };
    assert.equal(savedBody.entry.title, "本周黑客松");
    assert.equal(savedBody.entry.url, "https://ai-vibe-coding-6oft.pages.grok.bot/");
    assert.equal(savedBody.entry.collectedAt, "2026-11-12T00:00:00.000Z");
    assert.equal(savedBody.source.lastEntryAt, "2026-11-12T00:00:00.000Z");
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = original;
  }

  const listed = (await (await call(env, "GET", `/projects/${project.id}/data-sources`)).json()) as {
    sources: Array<{ name: string; entries: Array<{ title: string; body: string }> }>;
  };
  assert.equal(listed.sources[0].name, "黑客松");
  assert.equal(listed.sources[0].entries.length, 1);
  assert.match(listed.sources[0].entries[0].body, /助手摘要/);

  const unknown = await call(
    env,
    "POST",
    `/projects/${project.id}/data-sources/entries`,
    { sourceName: "不存在的来源", title: "标题", body: "正文" },
    { authorization: `Bearer ${SOURCE_TOKEN}` },
  );
  assert.equal(unknown.status, 404);
  assert.match(((await unknown.json()) as { error: string }).error, /不存在的来源/);
});

test("每个来源只保留最近 8 条，停用后选题提示词不再包含它", async () => {
  const env = createTestEnv({ DATA_SOURCE_TOKEN: SOURCE_TOKEN, OPENROUTER_API_KEY: "sk-or-v1-test-key" });
  const project = await createProject(env);
  await call(env, "POST", `/projects/${project.id}/data-sources`, { name: "ai产品发布评测" });
  await call(env, "POST", `/projects/${project.id}/data-sources`, { name: "黑客松" });
  const auth = { authorization: `Bearer ${SOURCE_TOKEN}` };
  for (let day = 1; day <= 9; day += 1) {
    const response = await call(
      env,
      "POST",
      `/projects/${project.id}/data-sources/entries`,
      {
        sourceName: "ai产品发布评测",
        title: `第${day}条`,
        body: `启用摘要正文${day}`,
        collectedAt: new Date(Date.UTC(2026, 0, day)).toISOString(),
      },
      auth,
    );
    assert.equal(response.status, 201);
  }
  const paused = await call(
    env,
    "POST",
    `/projects/${project.id}/data-sources/entries`,
    { sourceName: "黑客松", title: "停用标题", body: "停用摘要贝塔" },
    auth,
  );
  assert.equal(paused.status, 201);

  const before = (await (await call(env, "GET", `/projects/${project.id}/data-sources`)).json()) as {
    sources: Array<{ id: string; name: string; entries: Array<{ title: string }> }>;
  };
  const news = before.sources.find((source) => source.name === "ai产品发布评测");
  assert.ok(news);
  assert.equal(news.entries.length, 8);
  assert.equal(news.entries.some((entry) => entry.title === "第1条"), false);
  assert.equal(news.entries.some((entry) => entry.title === "第9条"), true);
  assert.equal(news.entries[0].title, "第9条");

  const hack = before.sources.find((source) => source.name === "黑客松");
  assert.ok(hack);
  const disabled = await call(env, "PATCH", `/projects/${project.id}/data-sources/${hack.id}`, { enabled: false });
  assert.equal(disabled.status, 200);
  assert.equal(((await disabled.json()) as { source: { enabled: boolean } }).source.enabled, false);

  const original = globalThis.fetch;
  const prompts: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return Response.json({
        data: [
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
      return Response.json({
        data: { is_free_tier: true, limit_remaining: 1, free_model_daily_requests: { used: 0, limit: 50, remaining: 50 } },
      });
    }
    if (url.includes("/chat/completions")) {
      const payload = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const user = payload.messages.find((message) => message.role === "user")?.content ?? "";
      prompts.push(user);
      return Response.json({
        model: "liquid/lfm-3-1.7b:free",
        choices: [{
          message: {
            content: JSON.stringify({
              topics: [
                { title: "看这一则发布", angle: "只讲一条", why: "贴着摘要", hook: "先看变化" },
                { title: "给同事的三句话", angle: "转述", why: "方便转发", hook: "三句话" },
                { title: "还缺什么信息", angle: "边界", why: "不要编排名", hook: "先别下结论" },
                { title: "下周再看", angle: "节奏", why: "摘要会更新", hook: "先记下来" },
              ],
            }),
          },
        }],
      });
    }
    throw new Error(`意外请求 ${url}`);
  };
  try {
    const topics = await call(env, "POST", "/topics", { projectId: project.id, keywords: "发布" });
    assert.equal(topics.status, 200, await topics.clone().text());
    const body = (await topics.json()) as { materialNote: string };
    assert.match(body.materialNote, /选题数据源/);
    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /助手写入的调研摘要/);
    assert.match(prompts[0], /启用摘要正文9/);
    assert.equal(prompts[0].includes("停用摘要贝塔"), false);
    assert.equal(prompts[0].includes("启用摘要正文1"), false);
  } finally {
    globalThis.fetch = original;
  }

  const again = await call(env, "PATCH", `/projects/${project.id}/data-sources/${hack.id}`, { enabled: true });
  assert.equal(again.status, 200);
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/models")) {
      return Response.json({
        data: [{ id: "liquid/lfm-3-1.7b:free", pricing: { prompt: "0", completion: "0" }, architecture: { output_modalities: ["text"] } }],
      });
    }
    if (url.endsWith("/key")) {
      return Response.json({ data: { is_free_tier: true, limit_remaining: 1, free_model_daily_requests: { remaining: 50, used: 0, limit: 50 } } });
    }
    if (url.includes("/chat/completions")) {
      const payload = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      prompts.push(payload.messages.find((message) => message.role === "user")?.content ?? "");
      return Response.json({
        model: "liquid/lfm-3-1.7b:free",
        choices: [{
          message: {
            content: JSON.stringify({
              topics: [
                { title: "两个来源一起看", angle: "对照", why: "都是摘要", hook: "先对照" },
                { title: "发布和活动分开写", angle: "拆开", why: "不要混成热榜", hook: "分开" },
                { title: "只引用写过的句子", angle: "边界", why: "没有阅读量", hook: "别编" },
                { title: "下周再更新", angle: "节奏", why: "助手会再写", hook: "先用这次" },
              ],
            }),
          },
        }],
      });
    }
    throw new Error(`意外请求 ${url}`);
  };
  try {
    prompts.length = 0;
    const topics = await call(env, "POST", "/topics", { projectId: project.id, keywords: "发布" });
    assert.equal(topics.status, 200, await topics.clone().text());
    assert.match(prompts[0], /启用摘要正文9/);
    assert.match(prompts[0], /停用摘要贝塔/);
  } finally {
    globalThis.fetch = original;
  }
});

test("工作台上锁后，助手仍只用 DATA_SOURCE_TOKEN 写入", async () => {
  const env = createTestEnv({ APP_ACCESS_TOKEN: WORKBENCH_TOKEN, DATA_SOURCE_TOKEN: SOURCE_TOKEN });
  const locked = await call(env, "POST", "/projects", { name: "全球AI产品资讯" });
  assert.equal(locked.status, 401);
  const workbench = { authorization: `Bearer ${WORKBENCH_TOKEN}` };
  const project = await createProject(env, workbench);
  const created = await call(env, "POST", `/projects/${project.id}/data-sources`, { name: "ai产品发布评测" }, workbench);
  assert.equal(created.status, 201);
  const usingWorkbenchToken = await call(
    env,
    "POST",
    `/projects/${project.id}/data-sources/entries`,
    { sourceName: "ai产品发布评测", title: "不该用工作台口令", body: "拒绝" },
    workbench,
  );
  assert.equal(usingWorkbenchToken.status, 401);
  const saved = await call(
    env,
    "POST",
    `/projects/${project.id}/data-sources/entries`,
    { sourceName: "ai产品发布评测", title: "只用数据源口令", body: "写入成功" },
    { authorization: `Bearer ${SOURCE_TOKEN}` },
  );
  assert.equal(saved.status, 201);
  const removed = await call(env, "DELETE", `/projects/${project.id}`, undefined, workbench);
  assert.equal(removed.status, 200);
  const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM data_sources`).first<{ n: number }>();
  assert.equal(Number(left?.n ?? -1), 0);
  const entries = await env.DB.prepare(`SELECT COUNT(*) AS n FROM data_source_entries`).first<{ n: number }>();
  assert.equal(Number(entries?.n ?? -1), 0);
});
