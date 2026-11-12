import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/cloudflare/http.js";
import { assertBookmarkUrl } from "../src/cloudflare/bookmarks.js";
import { placeholderPng } from "../src/util/png.js";
import worker from "../src/cloudflare/worker.js";
import { createTestEnv } from "./platform.js";

const ORIGIN = "https://wowacool.example";
const LEGACY_JOB = "job-20261111T131908Z-3a616d05";

const LEGACY_SCHEMA = `
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  image_count INTEGER NOT NULL DEFAULT 0,
  model_used TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  r2_key TEXT,
  url TEXT,
  prompt TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  event TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO jobs (id, topic, status, title, content, tags, image_count, created_at, updated_at)
VALUES ('${LEGACY_JOB}', '旧的桌面整理', 'draft', '', '', '', 0, '2026-11-11T13:19:08.000Z', '2026-11-11T13:19:08.000Z');
`;

interface ProjectView {
  id: string;
  name: string;
  positioning: string;
  niche: string;
  audience: string;
  notes: string;
  archived: boolean;
  materialCount: number;
  jobCount: number;
}

interface MaterialView {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string | null;
  filename: string | null;
  mimeType: string | null;
  downloadUrl: string | null;
}

interface JobView {
  id: string;
  topic: string;
  status: string;
  projectId: string | null;
  projectName: string | null;
  title: string;
  modelUsed: string | null;
}

async function call(env: Env, method: string, path: string, body?: unknown) {
  const headers = new Headers();
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    payload = JSON.stringify(body);
    headers.set("content-type", "application/json");
  }
  return worker.fetch(new Request(ORIGIN + path, { method, headers, body: payload }), env);
}

async function createProject(env: Env, name = "春季护肤", extra: Record<string, unknown> = {}) {
  const response = await call(env, "POST", "/projects", { name, niche: "护肤", audience: "干皮", ...extra });
  assert.equal(response.status, 201);
  return ((await response.json()) as { project: ProjectView }).project;
}

test("项目可以创建、改名、归档和删除，任务不会跟着被删掉", async () => {
  const env = createTestEnv();
  const created = await createProject(env, "春季护肤", { positioning: "干皮晚间护理", notes: "先讲清洁" });
  assert.equal(created.name, "春季护肤");
  assert.equal(created.archived, false);
  assert.equal(created.materialCount, 0);

  const missing = await call(env, "POST", "/projects", { name: "  " });
  assert.equal(missing.status, 400);

  const renamed = await call(env, "PATCH", `/projects/${created.id}`, { name: "春季护肤升级" });
  assert.equal(renamed.status, 200);
  assert.equal(((await renamed.json()) as { project: ProjectView }).project.name, "春季护肤升级");

  const jobResponse = await call(env, "POST", "/jobs", { topic: "干皮晚间卸妆", projectId: created.id });
  assert.equal(jobResponse.status, 201);
  const job = ((await jobResponse.json()) as { job: JobView }).job;
  assert.equal(job.projectId, created.id);
  assert.equal(job.projectName, "春季护肤升级");

  const archived = await call(env, "PATCH", `/projects/${created.id}`, { archived: true });
  assert.equal(((await archived.json()) as { project: ProjectView }).project.archived, true);
  const active = (await (await call(env, "GET", "/projects")).json()) as { projects: ProjectView[] };
  assert.equal(active.projects.some((item) => item.id === created.id), false);
  const archivedList = (await (await call(env, "GET", "/projects?archived=1")).json()) as { projects: ProjectView[] };
  assert.equal(archivedList.projects[0].id, created.id);
  assert.equal((await call(env, "POST", "/jobs", { topic: "再来一条", projectId: created.id })).status, 409);

  const restored = await call(env, "PATCH", `/projects/${created.id}`, { archived: false });
  assert.equal(((await restored.json()) as { project: ProjectView }).project.archived, false);

  const removed = await call(env, "DELETE", `/projects/${created.id}`);
  assert.equal(removed.status, 200);
  const removedBody = (await removed.json()) as { jobsDetached: number };
  assert.equal(removedBody.jobsDetached, 1);
  assert.equal((await call(env, "GET", `/projects/${created.id}`)).status, 404);
  const detached = ((await (await call(env, "GET", `/jobs/${job.id}`)).json()) as { job: JobView }).job;
  assert.equal(detached.projectId, null);
  assert.equal(detached.topic, "干皮晚间卸妆");
  assert.equal(detached.status, "draft");
});

test("资料可以贴文字、存链接、上传和删除，文件在下载接口里", async () => {
  const env = createTestEnv();
  const project = await createProject(env);
  const note = await call(env, "POST", `/projects/${project.id}/materials`, {
    kind: "note",
    title: "产品说明",
    body: "主打燕麦蜂蜜卸妆膏，适合干皮。",
  });
  assert.equal(note.status, 201);
  const noteBody = (await note.json()) as { material: MaterialView };
  assert.equal(noteBody.material.kind, "note");
  assert.match(noteBody.material.body, /燕麦蜂蜜/);

  const original = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => {
    fetched += 1;
    throw new Error("已经写了标题，不应该再去读网页");
  };
  try {
    const link = await call(env, "POST", `/projects/${project.id}/materials`, {
      kind: "link",
      url: "https://example.com/oat",
      title: "官网说明",
      body: "只记卖点，不抓正文",
    });
    assert.equal(link.status, 201);
    assert.equal(fetched, 0);
    const blocked = await call(env, "POST", `/projects/${project.id}/materials`, {
      kind: "link",
      url: "https://www.xiaohongshu.com/explore/abc",
      title: "热帖",
    });
    assert.equal(blocked.status, 400);
    assert.equal(((await blocked.json()) as { code: string }).code, "blocked_url");
    assert.equal((await call(env, "POST", `/projects/${project.id}/materials`, { kind: "link", url: "http://127.0.0.1/secret" })).status, 400);
    assert.equal((await call(env, "POST", `/projects/${project.id}/materials`, { kind: "link", url: "https://v.douyin.com/abc" })).status, 400);
  } finally {
    globalThis.fetch = original;
  }

  const form = new FormData();
  form.set("file", new File([new TextEncoder().encode("成分是燕麦和蜂蜜")], "brief.md", { type: "text/markdown" }));
  form.set("title", "成分说明");
  const uploaded = await worker.fetch(new Request(ORIGIN + `/projects/${project.id}/materials`, { method: "POST", body: form }), env);
  assert.equal(uploaded.status, 201);
  const file = ((await uploaded.json()) as { material: MaterialView }).material;
  assert.equal(file.kind, "file");
  assert.match(file.body, /燕麦和蜂蜜/);
  assert.ok(file.downloadUrl);
  const download = await call(env, "GET", file.downloadUrl!);
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type") ?? "", /text\/markdown/);
  assert.match(download.headers.get("x-content-type-options") ?? "", /nosniff/);
  assert.equal(await download.text(), "成分是燕麦和蜂蜜");

  const pdf = new FormData();
  pdf.set("file", new File([new TextEncoder().encode("%PDF-1.4\n% binary")], "report.pdf", { type: "application/pdf" }));
  pdf.set("note", "第三方检测，未抽取正文");
  const pdfResponse = await worker.fetch(new Request(ORIGIN + `/projects/${project.id}/materials`, { method: "POST", body: pdf }), env);
  assert.equal(pdfResponse.status, 201);
  const pdfMaterial = ((await pdfResponse.json()) as { material: MaterialView }).material;
  assert.equal(pdfMaterial.mimeType, "application/pdf");
  assert.equal(pdfMaterial.body, "第三方检测，未抽取正文");
  assert.equal(pdfMaterial.body.includes("%PDF"), false);

  const png = new FormData();
  const bytes = placeholderPng(3, 8, 8);
  const pngBytes = new Uint8Array(bytes.byteLength);
  pngBytes.set(bytes);
  png.set("file", new File([pngBytes], "pack.png", { type: "image/png" }));
  png.set("title", "包装正面");
  const imageResponse = await worker.fetch(new Request(ORIGIN + `/projects/${project.id}/materials`, { method: "POST", body: png }), env);
  assert.equal(imageResponse.status, 201);
  const image = ((await imageResponse.json()) as { material: MaterialView }).material;
  assert.equal(image.mimeType, "image/png");
  const imageDownload = await call(env, "GET", image.downloadUrl!);
  assert.match(imageDownload.headers.get("content-disposition") ?? "", /inline/);

  const rejected = new FormData();
  rejected.set("file", new File([new Uint8Array([0, 1, 2, 3, 4])], "brief.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const bad = await worker.fetch(new Request(ORIGIN + `/projects/${project.id}/materials`, { method: "POST", body: rejected }), env);
  assert.equal(bad.status, 400);
  assert.equal(((await bad.json()) as { code: string }).code, "bad_material");

  const listed = (await (await call(env, "GET", `/projects/${project.id}/materials`)).json()) as { materials: MaterialView[] };
  assert.equal(listed.materials.length, 5);
  const removed = await call(env, "DELETE", `/projects/${project.id}/materials/${file.id}`);
  assert.equal(removed.status, 200);
  assert.equal((await call(env, "GET", file.downloadUrl!)).status, 404);
  const after = (await (await call(env, "GET", `/projects/${project.id}`)).json()) as { materials: MaterialView[] };
  assert.equal(after.materials.some((item) => item.id === file.id), false);
});

test("没写标题时只读网页 title，不跟随跳转", async () => {
  const env = createTestEnv();
  const project = await createProject(env);
  const original = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    assert.equal((init as RequestInit | undefined)?.redirect, "manual");
    return new Response("<html><title>燕麦说明 &amp; 干皮</title><body>不要保存这段正文</body></html>", {
      headers: { "content-type": "text/html" },
    });
  };
  try {
    const response = await call(env, "POST", `/projects/${project.id}/materials`, {
      kind: "link",
      url: "https://example.com/oat",
    });
    assert.equal(response.status, 201);
    const body = (await response.json()) as { material: MaterialView; titleFetched: boolean };
    assert.equal(body.titleFetched, true);
    assert.equal(body.material.title, "燕麦说明 & 干皮");
    assert.equal(body.material.body.includes("不要保存"), false);
    assert.deepEqual(urls, ["https://example.com/oat"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("书签拒绝小红书、抖音和内网地址", () => {
  assert.equal(assertBookmarkUrl("https://example.com/a"), "https://example.com/a");
  assert.throws(() => assertBookmarkUrl("https://www.xiaohongshu.com/explore/1"), (error: unknown) => {
    return error instanceof HttpError && error.code === "blocked_url";
  });
  assert.throws(() => assertBookmarkUrl("http://169.254.169.254/latest"), (error: unknown) => {
    return error instanceof HttpError && error.code === "blocked_url";
  });
});

test("任务归到项目里；没有项目的旧任务仍然可用", async () => {
  const env = createTestEnv();
  const project = await createProject(env);
  const inside = ((await (await call(env, "POST", "/jobs", { topic: "项目里的选题", projectId: project.id })).json()) as { job: JobView }).job;
  const outside = ((await (await call(env, "POST", "/jobs", { topic: "还没分组" })).json()) as { job: JobView }).job;
  assert.equal(outside.projectId, null);
  assert.equal((await call(env, "POST", "/jobs", { topic: "不存在", projectId: "project-missing" })).status, 404);

  const scoped = (await (await call(env, "GET", `/jobs?projectId=${project.id}`)).json()) as { jobs: JobView[] };
  assert.deepEqual(scoped.jobs.map((job) => job.id), [inside.id]);
  const loose = (await (await call(env, "GET", "/jobs?unassigned=1")).json()) as { jobs: JobView[] };
  assert.equal(loose.jobs.some((job) => job.id === outside.id), true);
  assert.equal(loose.jobs.some((job) => job.id === inside.id), false);
  const all = (await (await call(env, "GET", "/jobs")).json()) as { jobs: JobView[] };
  assert.equal(all.jobs.length, 2);

  const copy = ((await (await call(env, "POST", `/jobs/${inside.id}/duplicate`, {})).json()) as { job: JobView }).job;
  assert.equal(copy.projectId, project.id);
  assert.notEqual(copy.id, inside.id);

  const legacy = createTestEnv({}, { schema: LEGACY_SCHEMA });
  const health = await call(legacy, "GET", "/health");
  assert.equal(health.status, 200);
  const healthBody = (await health.json()) as { ok: boolean; service: string; humanReviewRequired: boolean };
  assert.equal(healthBody.ok, true);
  assert.equal(healthBody.service, "wowacool");
  assert.equal(healthBody.humanReviewRequired, true);

  const listed = (await (await call(legacy, "GET", "/jobs")).json()) as { jobs: JobView[] };
  assert.equal(listed.jobs[0].id, LEGACY_JOB);
  assert.equal(listed.jobs[0].projectId, null);
  assert.equal(listed.jobs[0].topic, "旧的桌面整理");
  const again = (await (await call(legacy, "GET", `/jobs/${LEGACY_JOB}`)).json()) as { job: JobView };
  assert.equal(again.job.status, "draft");
  const migrated = await createProject(legacy, "迁过去之后");
  const moved = ((await (await call(legacy, "POST", "/jobs", { topic: "新任务", projectId: migrated.id })).json()) as { job: JobView }).job;
  assert.equal(moved.projectId, migrated.id);
  const stillThere = ((await (await call(legacy, "GET", `/jobs/${LEGACY_JOB}`)).json()) as { job: JobView }).job;
  assert.equal(stillThere.topic, "旧的桌面整理");
  assert.equal(stillThere.projectId, null);
});

test("选题会带上项目资料；没有密钥时不访问模型，没有资料时仍可按关键词出示例", async () => {
  const env = createTestEnv();
  const project = await createProject(env);
  await call(env, "POST", `/projects/${project.id}/materials`, {
    kind: "note",
    title: "燕麦蜂蜜",
    body: "主打燕麦蜂蜜卸妆膏，适合干皮晚间使用。",
  });
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("没有密钥时不应该请求 OpenRouter，也不该抓资料链接");
  };
  try {
    const missing = await call(env, "POST", "/topics", { projectId: project.id, keywords: "卸妆" });
    assert.equal(missing.status, 400);
    const missingBody = (await missing.json()) as { code: string; error: string };
    assert.equal(missingBody.code, "missing_api_key");
    assert.match(missingBody.error, /不会改用付费模型/);
    assert.match(missingBody.error, /示例选题/);

    const fixture = await call(env, "POST", "/topics", { projectId: project.id, keywords: "卸妆", fixture: true });
    assert.equal(fixture.status, 200);
    const fixtureBody = (await fixture.json()) as {
      fixture: boolean;
      modelUsed: string;
      materialsUsed: number;
      materialNote: string;
      topics: Array<{ title: string; why: string }>;
    };
    assert.equal(fixtureBody.fixture, true);
    assert.equal(fixtureBody.modelUsed, "fixture/local");
    assert.equal(fixtureBody.materialsUsed, 1);
    assert.match(fixtureBody.materialNote, /1 份资料/);
    assert.match(fixtureBody.topics[0].why, /燕麦蜂蜜/);

    const fromMaterials = await call(env, "POST", "/topics", { projectId: project.id, fixture: true });
    assert.equal(fromMaterials.status, 200);
    assert.equal(((await fromMaterials.json()) as { materialsUsed: number }).materialsUsed, 1);
  } finally {
    globalThis.fetch = original;
  }

  const empty = await createProject(env, "空项目", { niche: "", audience: "" });
  const noBrief = await call(env, "POST", "/topics", { projectId: empty.id, fixture: true });
  assert.equal(noBrief.status, 400);
  assert.equal(((await noBrief.json()) as { code: string }).code, "missing_brief");
  const keywordsOnly = await call(env, "POST", "/topics", { projectId: empty.id, keywords: "收纳", fixture: true });
  assert.equal(keywordsOnly.status, 200);
  const keywordsBody = (await keywordsOnly.json()) as { materialsUsed: number; materialNote: string; topics: unknown[] };
  assert.equal(keywordsBody.materialsUsed, 0);
  assert.match(keywordsBody.materialNote, /还没有资料/);
  assert.equal(keywordsBody.topics.length >= 4, true);
});

test("有密钥时，选题和文案请求都包含项目资料，并且只用免费文本模型", async () => {
  const env = createTestEnv({ OPENROUTER_API_KEY: "sk-or-v1-test-key" });
  const project = await createProject(env);
  await call(env, "POST", `/projects/${project.id}/materials`, {
    kind: "note",
    title: "产品说明",
    body: "主打燕麦蜂蜜卸妆膏，适合干皮晚间使用。",
  });
  const created = ((await (await call(env, "POST", "/jobs", { topic: "干皮晚间卸妆", projectId: project.id })).json()) as { job: JobView }).job;
  const original = globalThis.fetch;
  const prompts: string[] = [];
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
      return Response.json({
        data: { is_free_tier: true, limit_remaining: 1, free_model_daily_requests: { used: 1, limit: 50, remaining: 49 } },
      });
    }
    if (url.includes("/chat/completions")) {
      const payload = JSON.parse(String(init?.body)) as {
        model: string;
        models: string[];
        messages: Array<{ role: string; content: string }>;
      };
      assert.equal([...payload.models, payload.model].every((id) => id.endsWith(":free")), true);
      assert.equal(payload.models.length <= 3, true);
      const user = payload.messages.find((message) => message.role === "user")?.content ?? "";
      prompts.push(user);
      assert.match(user, /燕麦蜂蜜卸妆膏/);
      if (user.includes("出图提示词")) {
        return Response.json({
          model: payload.model,
          choices: [{ message: { content: JSON.stringify({ title: "干皮晚间卸妆", content: "先把脸洗干净。", tags: ["卸妆", "干皮", "护肤"], imagePrompts: ["竖版"] }) } }],
        });
      }
      return Response.json({
        model: payload.model,
        choices: [{ message: { content: JSON.stringify({ topics: [
          { title: "干皮先卸这一步", angle: "只讲卸妆", why: "资料里写了干皮", hook: "先卸干净" },
          { title: "燕麦蜂蜜怎么用", angle: "按用法", why: "贴着产品说明", hook: "厚敷一会儿" },
          { title: "晚间清洁顺序", angle: "顺序", why: "好执行", hook: "顺序别反" },
          { title: "卸完再保湿", angle: "收尾", why: "干皮需要", hook: "别停在清洁" },
        ] }) } }],
      });
    }
    throw new Error(`意外请求 ${url}`);
  };
  try {
    const topics = await call(env, "POST", "/topics", { projectId: project.id, keywords: "卸妆" });
    assert.equal(topics.status, 200);
    const topicBody = (await topics.json()) as { fixture: boolean; materialsUsed: number; modelUsed: string };
    assert.equal(topicBody.fixture, false);
    assert.equal(topicBody.materialsUsed, 1);
    assert.equal(topicBody.modelUsed.endsWith(":free"), true);

    const drafted = await call(env, "POST", `/jobs/${created.id}/draft`, { imageCount: 1 });
    assert.equal(drafted.status, 200);
    const draftBody = (await drafted.json()) as { fixture: boolean; materialsUsed: number; job: JobView };
    assert.equal(draftBody.fixture, false);
    assert.equal(draftBody.materialsUsed, 1);
    assert.equal(draftBody.job.projectId, project.id);
    assert.equal(Array.from(draftBody.job.title).length <= 20, true);
    assert.equal(prompts.length, 2);
    assert.equal(urls.some((url) => /xiaohongshu|douyin|seedance|grok/i.test(url)), false);
  } finally {
    globalThis.fetch = original;
  }
});
