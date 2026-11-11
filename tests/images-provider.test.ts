import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "../src/constants.js";
import { fitPortrait, isPortraitRatio } from "../src/images/aspect.js";
import { OpenAiCompatibleImageProvider } from "../src/images/openaiCompatible.js";
import { readImageSize } from "../src/images/raster.js";
import { toImageSpecs } from "../src/images/provider.js";
import { buildWorkersAiCall, WorkersAiImageProvider } from "../src/images/workersAi.js";
import { encodePng, placeholderPng } from "../src/util/png.js";
import worker from "../src/cloudflare/worker.js";
import { createTestEnv } from "./platform.js";

const require = createRequire(import.meta.url);
const jpeg = require("jpeg-js") as {
  encode(image: { data: Buffer | Uint8Array; width: number; height: number }, quality?: number): { data: Uint8Array };
};

test("已经是 3:4 的图保持原字节，方图会居中裁成 3:4", () => {
  const portrait = placeholderPng(0, 6, 8);
  const kept = fitPortrait(portrait);
  assert.equal(Buffer.compare(Buffer.from(kept.bytes), portrait), 0);
  assert.equal(kept.mimeType, "image/png");

  const square = placeholderPng(1, 8, 8);
  const fitted = fitPortrait(square);
  const size = readImageSize(fitted.bytes);
  assert.ok(size);
  assert.equal(isPortraitRatio(size.width, size.height), true);
  assert.equal(size.width * 4, size.height * 3);
});

test("方图 JPEG 也会裁成 3:4", () => {
  const data = Buffer.alloc(4 * 4 * 4, 255);
  const encoded = jpeg.encode({ data, width: 4, height: 4 }, 90);
  const fitted = fitPortrait(encoded.data);
  const size = readImageSize(fitted.bytes);
  assert.ok(size);
  assert.equal(isPortraitRatio(size.width, size.height), true);
});

test("Workers AI 请求官方 3:4 尺寸，并且不走浏览器或 Grok", async () => {
  const call = buildWorkersAiCall("@cf/black-forest-labs/flux-2-klein-4b", "干净的厨房台面");
  assert.ok(call.input.multipart);
  const form = await new Response(call.input.multipart.body, {
    headers: { "content-type": call.input.multipart.contentType },
  }).formData();
  assert.equal(form.get("width"), String(PORTRAIT_WIDTH));
  assert.equal(form.get("height"), String(PORTRAIT_HEIGHT));
  assert.equal(form.get("prompt"), "干净的厨房台面");
  assert.throws(() => buildWorkersAiCall("@cf/bytedance/seedance", "no"), /Seedance|视频/);

  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Workers AI 应该走绑定，不应该 fetch");
  };
  try {
    const provider = new WorkersAiImageProvider({
      async run(model, input) {
        assert.equal(model, "@cf/black-forest-labs/flux-2-klein-4b");
        assert.ok(input && typeof input === "object" && "multipart" in input);
        return { image: encodePng({ width: 8, height: 8, color: [20, 40, 60] }).toString("base64") };
      },
    });
    const images = await provider.generate(toImageSpecs(["台面"]));
    assert.equal(images[0].provider, "workers_ai");
    assert.equal(images[0].mimeType, "image/png");
    const size = readImageSize(images[0].bytes);
    assert.ok(size);
    assert.equal(isPortraitRatio(size.width, size.height), true);
  } finally {
    globalThis.fetch = original;
  }
});

test("OpenAI 兼容接口配齐后会请求 3:4，Seedance 不发请求", async () => {
  const banned = new OpenAiCompatibleImageProvider({
    baseUrl: "https://example.invalid/seedance/v1",
    apiKey: "secret-key",
    model: "seedance-1",
  });
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error("不该发出请求");
  };
  try {
    await assert.rejects(() => banned.generate(toImageSpecs(["a"])), /Seedance|视频/);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }

  const provider = new OpenAiCompatibleImageProvider({
    baseUrl: "https://images.example/v1",
    apiKey: "secret-key",
    model: "flux-test",
    path: "/images/generations",
  });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    assert.equal(url, "https://images.example/v1/images/generations");
    const payload = JSON.parse(String(init?.body)) as { size: string; model: string };
    assert.equal(payload.size, `${PORTRAIT_WIDTH}x${PORTRAIT_HEIGHT}`);
    assert.equal(payload.model, "flux-test");
    assert.equal(String(init?.headers && (init.headers as Record<string, string>).Authorization).includes("secret-key"), true);
    const png = encodePng({ width: 6, height: 8, color: [10, 20, 30] });
    return Response.json({ data: [{ b64_json: png.toString("base64") }] });
  };
  try {
    const images = await provider.generate(toImageSpecs(["一张"]));
    assert.equal(images[0].provider, "openai_compatible");
    assert.equal(images[0].filename, "01.png");
  } finally {
    globalThis.fetch = original;
  }
});

test("工作台用 Workers AI 绑定保存真实图片，替换前要确认", async () => {
  const env = createTestEnv({
    IMAGE_PROVIDER: "workers_ai",
    AI: {
      async run() {
        return { image: encodePng({ width: 8, height: 8, color: [200, 80, 60] }).toString("base64") };
      },
    },
  });
  const created = await worker.fetch(
    new Request("https://wowacool.example/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "台面收纳" }),
    }),
    env,
  );
  const id = ((await created.json()) as { job: { id: string } }).job.id;
  await worker.fetch(
    new Request(`https://wowacool.example/jobs/${id}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixture: true, imageCount: 1 }),
    }),
    env,
  );
  const blocked = await worker.fetch(
    new Request(`https://wowacool.example/jobs/${id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    }),
    env,
  );
  assert.equal(blocked.status, 200);
  const first = (await blocked.json()) as { provider: string; job: { images: Array<{ id: string; source: string; url: string }> } };
  assert.equal(first.provider, "workers_ai");
  assert.equal(first.job.images[0].source, "workers_ai");
  const file = await worker.fetch(new Request(`https://wowacool.example${first.job.images[0].url}`), env);
  assert.equal(file.headers.get("content-type"), "image/png");
  const size = readImageSize(new Uint8Array(await file.arrayBuffer()));
  assert.ok(size);
  assert.equal(isPortraitRatio(size.width, size.height), true);

  const confirm = await worker.fetch(
    new Request(`https://wowacool.example/jobs/${id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    }),
    env,
  );
  assert.equal(confirm.status, 409);
  assert.equal(((await confirm.json()) as { code: string }).code, "confirm_replace");

  const redraw = await worker.fetch(
    new Request(`https://wowacool.example/jobs/${id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ index: 1, replace: true }),
    }),
    env,
  );
  assert.equal(redraw.status, 200);
  const again = (await redraw.json()) as { job: { images: Array<{ id: string; source: string }> } };
  assert.equal(again.job.images.length, 1);
  assert.equal(again.job.images[0].source, "workers_ai");
  assert.notEqual(again.job.images[0].id, first.job.images[0].id);
});
