import assert from "node:assert/strict";
import test from "node:test";
import { placeholderPng } from "../src/util/png.js";
import worker from "../src/cloudflare/worker.js";
import { createTestEnv } from "./platform.js";

const ORIGIN = "https://wowacool.example";

interface JobView {
  id: string;
  topic: string;
  status: string;
  title: string;
  content: string;
  tags: string;
  imageCount: number;
  imagePrompts: string[];
  images: Array<{ id: string; filename: string; url: string; prompt: string; source: string }>;
  modelUsed: string | null;
  fallbacksOffered: string[];
  review: { decision: string; note?: string; at: string } | null;
  postNote: { title?: string; content?: string; mediaInfo: string; tags?: string } | null;
  createdAt: string;
  updatedAt: string;
}

async function call(env: Env, method: string, path: string, body?: unknown, headers?: Record<string, string>) {
  const requestHeaders = new Headers(headers);
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    requestHeaders.set("content-type", "application/json");
  }
  return worker.fetch(new Request(ORIGIN + path, { method, headers: requestHeaders, body: payload }), env);
}

async function jobOf(response: Response): Promise<JobView> {
  const data = (await response.json()) as { job: JobView };
  return data.job;
}

test("未批准不能导出，批准后可以下载素材包和官方参数", async () => {
  const env = createTestEnv();
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    throw new Error(`测试不应访问网络：${String(input)}`);
  };
  try {
    const createdResponse = await call(env, "POST", "/jobs", { topic: "一周便当不重样" });
    assert.equal(createdResponse.status, 201);
    const created = await jobOf(createdResponse);
    assert.equal(created.status, "draft");
    assert.ok(created.createdAt);

    const listed = (await (await call(env, "GET", "/jobs")).json()) as {
      jobs: Array<{ id: string; status: string; createdAt: string; topic: string }>;
    };
    assert.equal(listed.jobs[0].id, created.id);
    assert.equal(listed.jobs[0].status, "draft");
    assert.equal(listed.jobs[0].topic, "一周便当不重样");
    assert.ok(listed.jobs[0].createdAt);

    const blocked = await call(env, "POST", `/jobs/${created.id}/export`, {});
    assert.equal(blocked.status, 409);
    const blockedBody = (await blocked.json()) as { code: string; error: string };
    assert.equal(blockedBody.code, "export_blocked");
    assert.match(blockedBody.error, /未批准/);
    assert.equal((await call(env, "GET", `/jobs/${created.id}/package`)).status, 404);

    const drafted = await jobOf(await call(env, "POST", `/jobs/${created.id}/draft`, { fixture: true, imageCount: 2 }));
    assert.equal(drafted.modelUsed, "fixture/local");
    assert.equal(drafted.status, "draft");
    assert.ok(drafted.title);
    assert.equal(Array.from(drafted.title).length <= 20, true);
    assert.equal(drafted.imagePrompts.length, 2);

    const tooLong = "一二三四五六七八九十一二三四五六七八九十一";
    const over = await call(env, "PATCH", `/jobs/${created.id}`, { title: tooLong });
    assert.equal(over.status, 400);
    assert.equal((await jobOf(await call(env, "GET", `/jobs/${created.id}`))).title, drafted.title);

    const tagged = await jobOf(await call(env, "PATCH", `/jobs/${created.id}`, { title: "便当不重样", tags: "便当，备餐" }));
    assert.equal(tagged.title, "便当不重样");
    assert.equal(tagged.tags, "便当,备餐");

    const generatedResponse = await call(env, "POST", `/jobs/${created.id}/images`, { count: 2 });
    assert.equal(generatedResponse.status, 200);
    const generatedBody = (await generatedResponse.json()) as { job: JobView; provider: string };
    assert.equal(generatedBody.provider, "mock");
    assert.equal(generatedBody.job.status, "pending_review");
    assert.equal(generatedBody.job.images.length, 2);
    assert.equal(generatedBody.job.images.every((image) => image.source === "mock"), true);

    const image = await worker.fetch(new Request(ORIGIN + generatedBody.job.images[0].url), env);
    assert.equal(image.status, 200);
    assert.match(image.headers.get("content-disposition") ?? "", /inline/);
    const bytes = new Uint8Array(await image.arrayBuffer());
    assert.deepEqual(Array.from(bytes.subarray(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);

    const form = new FormData();
    const png = placeholderPng(3, 16, 16);
    const pngBytes = new Uint8Array(png.byteLength);
    pngBytes.set(png);
    form.set("file", new File([pngBytes], "cover.png", { type: "image/png" }));
    const uploaded = await worker.fetch(new Request(ORIGIN + `/jobs/${created.id}/images/upload`, { method: "POST", body: form }), env);
    assert.equal(uploaded.status, 200);
    const withUpload = await jobOf(uploaded);
    assert.equal(withUpload.imageCount, 3);
    assert.equal(withUpload.images.some((item) => item.source === "upload"), true);
    assert.equal(withUpload.status, "pending_review");

    const order = [withUpload.images[2].id, withUpload.images[0].id, withUpload.images[1].id];
    const reordered = await jobOf(await call(env, "POST", `/jobs/${created.id}/images/reorder`, { ids: order }));
    assert.deepEqual(reordered.images.map((item) => item.id), order);

    const removed = await jobOf(await call(env, "DELETE", `/jobs/${created.id}/images/${order[0]}`));
    assert.equal(removed.imageCount, 2);
    assert.equal(removed.images.some((item) => item.id === order[0]), false);

    const rejectMissing = await call(env, "POST", `/jobs/${created.id}/review`, { decision: "rejected" });
    assert.equal(rejectMissing.status, 400);
    const rejected = await jobOf(await call(env, "POST", `/jobs/${created.id}/review`, { decision: "rejected", note: "封面再亮一点" }));
    assert.equal(rejected.status, "rejected");
    assert.equal(rejected.review?.note, "封面再亮一点");
    assert.equal((await call(env, "POST", `/jobs/${created.id}/export`, {})).status, 409);

    const approved = await jobOf(
      await call(env, "POST", `/jobs/${created.id}/review`, { decision: "approved", note: "可以发出去" }),
    );
    assert.equal(approved.status, "approved");
    assert.equal(approved.review?.decision, "approved");
    assert.equal(approved.review?.note, "可以发出去");
    assert.ok(approved.postNote);
    const media = JSON.parse(approved.postNote!.mediaInfo) as { image_resources: Array<{ url: string }> };
    assert.equal(media.image_resources.length, 2);
    assert.equal(media.image_resources.every((item) => item.url.startsWith(`${ORIGIN}/jobs/${created.id}/images/`)), true);

    const exportedResponse = await call(env, "POST", `/jobs/${created.id}/export`, {});
    assert.equal(exportedResponse.status, 200);
    const exportedBody = (await exportedResponse.json()) as { job: JobView; postNote: { mediaInfo: string }; downloadUrl: string };
    assert.equal(exportedBody.job.status, "exported");
    assert.equal(exportedBody.downloadUrl, `/jobs/${created.id}/package`);
    assert.match(exportedBody.postNote.mediaInfo, /image_resources/);
    assert.equal((await call(env, "POST", `/jobs/${created.id}/export`, {})).status, 409);
    assert.equal((await call(env, "PATCH", `/jobs/${created.id}`, { title: "改完再发" })).status, 409);

    const bundle = await call(env, "GET", `/jobs/${created.id}/package`);
    assert.equal(bundle.status, 200);
    assert.match(bundle.headers.get("content-type") ?? "", /application\/zip/);
    assert.match(bundle.headers.get("content-disposition") ?? "", /attachment/);
    const zip = new Uint8Array(await bundle.arrayBuffer());
    assert.deepEqual(Array.from(zip.subarray(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
    const zipText = new TextDecoder().decode(zip);
    assert.match(zipText, /postnote\.json/);
    assert.match(zipText, /mediaInfo/);
    assert.match(zipText, /不自动发布/);

    const copy = await jobOf(await call(env, "POST", `/jobs/${created.id}/duplicate`, {}));
    assert.notEqual(copy.id, created.id);
    assert.equal(copy.status, "pending_review");
    assert.equal(copy.review, null);
    assert.equal(copy.imageCount, 2);
    assert.equal((await call(env, "POST", `/jobs/${copy.id}/export`, {})).status, 409);

    assert.equal(calls.some((url) => /xiaohongshu|openrouter/i.test(url)), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("没有密钥或额度用尽时给出可操作的说明，并且不调用付费模型", async () => {
  const env = createTestEnv();
  const created = await jobOf(await call(env, "POST", "/jobs", { topic: "周末市集" }));
  const original = globalThis.fetch;
  let chatCalls = 0;
  globalThis.fetch = async () => {
    chatCalls += 1;
    throw new Error("没有密钥时不应该请求 OpenRouter");
  };
  try {
    const missing = await call(env, "POST", `/jobs/${created.id}/draft`, { imageCount: 1 });
    assert.equal(missing.status, 400);
    const body = (await missing.json()) as { code: string; error: string };
    assert.equal(body.code, "missing_api_key");
    assert.match(body.error, /wrangler secret put OPENROUTER_API_KEY/);
    assert.match(body.error, /示例文案/);
    assert.equal(chatCalls, 0);
    const quota = (await (await call(env, "GET", "/quota")).json()) as { configured: boolean; message: string };
    assert.equal(quota.configured, false);
    assert.match(quota.message, /OPENROUTER_API_KEY/);
  } finally {
    globalThis.fetch = original;
  }

  const keyed = createTestEnv({ OPENROUTER_API_KEY: "sk-or-v1-test-key" });
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
            id: "google/lyria-2:free",
            name: "Lyria",
            pricing: { prompt: "0", completion: "0" },
            architecture: { output_modalities: ["audio"] },
          },
          {
            id: "liquid/lfm-3-1.7b:free",
            name: "LFM",
            pricing: { prompt: "0", completion: "0" },
            architecture: { output_modalities: ["text"] },
            context_length: 4096,
          },
        ],
      });
    }
    if (url.endsWith("/key")) {
      return Response.json({
        data: {
          is_free_tier: true,
          limit_remaining: 1,
          free_model_daily_requests: { used: 50, limit: 50, remaining: 0 },
        },
      });
    }
    if (url.includes("/chat/completions")) {
      const payload = JSON.parse(String(init?.body)) as { model: string; models: string[] };
      assert.equal([...payload.models, payload.model].every((id) => id.endsWith(":free")), true);
      return Response.json({
        model: "openai/gpt-4o",
        choices: [{ message: { content: "不应该被接受" } }],
      });
    }
    throw new Error(`意外请求 ${url}`);
  };
  try {
    const exhausted = await call(keyed, "POST", `/jobs/${(await jobOf(await call(keyed, "POST", "/jobs", { topic: "额度" }))).id}/draft`, {});
    assert.equal(exhausted.status, 429);
    const exhaustedBody = (await exhausted.json()) as { code: string; error: string };
    assert.equal(exhaustedBody.code, "quota_exhausted");
    assert.match(exhaustedBody.error, /不会改用付费模型/);
    assert.equal(urls.some((url) => url.includes("/chat/completions")), false);

    const catalog = (await (await call(keyed, "GET", "/catalog")).json()) as {
      models: Array<{ id: string }>;
      route: { model: string; fallbacks: string[] };
    };
    assert.deepEqual(catalog.models.map((model) => model.id), ["liquid/lfm-3-1.7b:free"]);
    assert.equal(catalog.route.model, "liquid/lfm-3-1.7b:free");
    assert.equal(catalog.route.fallbacks.some((id) => id.includes("gpt")), false);
  } finally {
    globalThis.fetch = original;
  }
});

test("本地 http 导出使用 xhsfile，不把 http 图片链接写进 postNote", async () => {
  const env = createTestEnv();
  const created = await worker.fetch(
    new Request("http://127.0.0.1:8787/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "本地预览" }),
    }),
    env,
  );
  const id = ((await created.json()) as { job: JobView }).job.id;
  await worker.fetch(
    new Request(`http://127.0.0.1:8787/jobs/${id}/draft`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixture: true, imageCount: 1 }),
    }),
    env,
  );
  await worker.fetch(
    new Request(`http://127.0.0.1:8787/jobs/${id}/images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: 1 }),
    }),
    env,
  );
  await worker.fetch(
    new Request(`http://127.0.0.1:8787/jobs/${id}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved", note: "本地通过" }),
    }),
    env,
  );
  const exported = await worker.fetch(
    new Request(`http://127.0.0.1:8787/jobs/${id}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }),
    env,
  );
  assert.equal(exported.status, 200);
  const body = (await exported.json()) as { postNote: { mediaInfo: string }; manifest: { publishReady: boolean } };
  const media = JSON.parse(body.postNote.mediaInfo) as { image_resources: Array<{ url: string }> };
  assert.equal(media.image_resources[0].url.startsWith("xhsfile://export/"), true);
  assert.equal(body.manifest.publishReady, false);
});

test("设置访问口令后，页面仍可打开，接口需要解锁", async () => {
  const env = createTestEnv({ APP_ACCESS_TOKEN: "team-pass" });
  const home = await worker.fetch(new Request(`${ORIGIN}/`), env);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /访问口令/);
  const health = await worker.fetch(new Request(`${ORIGIN}/health`), env);
  assert.equal(health.status, 200);
  assert.equal((await call(env, "GET", "/jobs")).status, 401);

  const wrong = await call(env, "POST", "/session", { token: "nope" });
  assert.equal(wrong.status, 401);
  const login = await call(env, "POST", "/session", { token: "team-pass" });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie") ?? "";
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /wowacool_access=/);
  const unlocked = await call(env, "GET", "/jobs", undefined, { cookie: cookie.split(";")[0] });
  assert.equal(unlocked.status, 200);
});
