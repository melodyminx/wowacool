import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/cloudflare/worker.js";

const bare = { IMAGE_PROVIDER: "mock", PHASE: "1" } as Env;

test("GET /health stays JSON for ops checks", async () => {
  const response = await worker.fetch(new Request("https://wowacool.example/health"), bare);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  const body = (await response.json()) as {
    ok: boolean;
    service: string;
    phase: string;
    imageProvider: string;
    imageReady: boolean;
    imageMessage?: string;
    writeNotes: string;
    humanReviewRequired: boolean;
    app: string;
  };
  assert.equal(body.ok, true);
  assert.equal(body.service, "wowacool");
  assert.equal(body.phase, "1");
  assert.equal(body.imageProvider, "mock");
  assert.equal(body.imageReady, true);
  assert.match(body.imageMessage ?? "", /占位图/);
  assert.equal(body.writeNotes, "planned");
  assert.equal(body.humanReviewRequired, true);
  assert.equal(body.app, "/");
});

test("GET / serves the Chinese workbench instead of health JSON", async () => {
  const response = await worker.fetch(new Request("https://wowacool.example/"), bare);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  const html = await response.text();
  assert.equal(html.startsWith("<!DOCTYPE html>"), true);
  assert.match(html, /小红书图文工作台/);
  assert.match(html, /即将推出/);
  assert.match(html, /人工审核/);
  assert.match(html, /示例文案/);
  assert.match(html, /推荐选题/);
  assert.match(html, /创建并生成文案/);
  assert.match(html, /创建项目/);
  assert.match(html, /项目资料/);
  assert.match(html, /未分组/);
  assert.match(html, /切换项目/);
  assert.match(html, /当前项目/);
  assert.match(html, /全部项目/);
  assert.match(html, /wowacool-project/);
  assert.match(html, /id="project-switcher"/);
  assert.match(html, /不做视频生成或视频发布/);
  assert.doesNotMatch(html, /配图只用占位图/);
  assert.match(html, /viewport/);
  assert.doesNotMatch(html, /"mode": "health"/);
});

test("job routes without D1 or R2 explain the missing binding", async () => {
  const response = await worker.fetch(new Request("https://wowacool.example/jobs", { method: "POST", body: "{}" }), bare);
  assert.equal(response.status, 503);
  const body = (await response.json()) as { ok: boolean; error: string; code: string };
  assert.equal(body.ok, false);
  assert.equal(body.code, "bindings_missing");
  assert.match(body.error, /D1/);
});

test("workers_ai without the AI binding says so and does not pretend to be mock", async () => {
  const env = { IMAGE_PROVIDER: "workers_ai", PHASE: "2" } as Env;
  const response = await worker.fetch(new Request("https://wowacool.example/health"), env);
  const body = (await response.json()) as { imageProvider: string; imageReady: boolean; imageMessage: string };
  assert.equal(body.imageProvider, "workers_ai");
  assert.equal(body.imageReady, false);
  assert.match(body.imageMessage, /AI 绑定/);
  assert.doesNotMatch(body.imageMessage, /Grok 出图额度不足/);
});

test("unknown routes return 404 and do not pretend to publish", async () => {
  const response = await worker.fetch(new Request("https://wowacool.example/publish", { method: "POST" }), bare);
  assert.equal(response.status, 404);
});
