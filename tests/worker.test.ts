import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/cloudflare/worker.js";

test("GET /health identifies wowacool and keeps image generation on mock", async () => {
  const response = await worker.fetch(new Request("https://wowacool.example/health"), {
    IMAGE_PROVIDER: "mock",
    PHASE: "1",
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    ok: boolean;
    service: string;
    imageProvider: string;
    writeNotes: string;
    humanReviewRequired: boolean;
  };
  assert.equal(body.ok, true);
  assert.equal(body.service, "wowacool");
  assert.equal(body.imageProvider, "mock");
  assert.equal(body.writeNotes, "planned");
  assert.equal(body.humanReviewRequired, true);
});

test("planned job routes do not publish or call external APIs", async () => {
  const response = await worker.fetch(
    new Request("https://wowacool.example/jobs/job_123/export", { method: "POST" }),
    { IMAGE_PROVIDER: "mock", PHASE: "1" },
  );
  assert.equal(response.status, 501);
  const body = (await response.json()) as { ok: boolean; error: string };
  assert.equal(body.ok, false);
  assert.match(body.error, /does not publish notes/);
});

test("unknown routes return 404", async () => {
  const response = await worker.fetch(new Request("https://wowacool.example/scrape"), {
    IMAGE_PROVIDER: "mock",
    PHASE: "1",
  });
  assert.equal(response.status, 404);
});
