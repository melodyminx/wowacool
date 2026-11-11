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
    writeNotes: string;
    humanReviewRequired: boolean;
    app: string;
  };
  assert.equal(body.ok, true);
  assert.equal(body.service, "wowacool");
  assert.equal(body.phase, "1");
  assert.equal(body.imageProvider, "mock");
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

test("unknown routes return 404 and do not pretend to publish", async () => {
  const response = await worker.fetch(new Request("https://wowacool.example/publish", { method: "POST" }), bare);
  assert.equal(response.status, 404);
});
