# 接口约定

## OpenRouter

基址：`https://openrouter.ai/api/v1`  
鉴权：`Authorization: Bearer $OPENROUTER_API_KEY`

| 用途 | 方法 | 路径 | 是否计入免费对话次数 |
| --- | --- | --- | --- |
| 刷新模型目录 | GET | `/models` | 否 |
| 查询密钥额度 | GET | `/key` | 否 |
| 生成文案 | POST | `/chat/completions` | 是 |

额度响应关注 `data.free_model_daily_requests.{used,limit,remaining}` 以及 `data.limit_remaining`（密钥积分上限）。不要把 `label` 或密钥写入磁盘。

聊天请求必须类似：

```json
{
  "model": "liquid/lfm-3-1.7b:free",
  "models": ["liquid/lfm-2.5-2.6b:free", "nvidia/nemotron-3.5-lightning:free", "openrouter/free"],
  "messages": [],
  "max_tokens": 2048
}
```

`models` 回退列表只能全是免费文本模型，且最多 3 条。见 https://openrouter.ai/docs/guides/routing/model-fallbacks ；更长列表会返回 400，其余候选由本地切换。

文案输出约定为 JSON：`{ "title", "content", "tags": [], "imagePrompts": [] }`。本地会做解析、截断和校验。

## 文生图 Provider

```ts
interface ImageProvider {
  readonly id: string;
  generate(specs: { prompt: string; index: number }[]): Promise<GeneratedImage[]>;
}
```

环境变量：

```
IMAGE_PROVIDER=workers_ai
WORKERS_AI_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-4b
# 显式占位图：
# IMAGE_PROVIDER=mock
# 可选，配齐后才发请求：
# IMAGE_PROVIDER=openai_compatible
# IMAGE_GEN_BASE_URL=
# IMAGE_GEN_API_KEY=
# IMAGE_GEN_MODEL=
# IMAGE_GEN_PATH=/images/generations
```

Workers AI 走 Worker 里的 `AI` 绑定，不在浏览器里调用。FLUX.2 [klein] 4B 用 multipart 传入 `prompt`、`width=768`、`height=1024`。FLUX.1 schnell 只有 `prompt` 和 `steps`，若改用它，返回的方图会居中裁成 3:4。

OpenAI 兼容接口为 `POST {IMAGE_GEN_BASE_URL}{IMAGE_GEN_PATH}`，请求体包含 `model`、`prompt`、`size=768x1024`、`response_format=b64_json`。地址或模型名像 Seedance、Grok、xAI 时直接拒绝，不发请求。

## 本地任务 JSON

`data/jobs/<id>/job.json` 字段见 `src/types.ts` 的 `Job`。状态机：

`draft` →（出图）`pending_review` → `approved` | `rejected` →（仅 approved）`exported`

## 导出素材包

```
data/exports/<jobId>/
  manifest.json
  postnote.json
  README.txt
  image-prompts.txt
  images/01.png ...
```

`manifest.postNote` 与 `postnote.json` 对齐官方 payload。编码函数：`encodePostNotePayload`、`encodeApprovedPackage`，均不发网络请求。

## Worker 路由

`GET /` 返回中文运营页。`GET /health` 返回 JSON。下面的任务路由读写 D1 / R2，不发布笔记。

| 路由 | 含义 |
| --- | --- |
| GET /health | 存活检查 |
| GET / | 运营工作台 |
| GET /quota | 查询额度；未配置密钥时返回说明，不报 500 |
| POST /catalog/refresh | 刷新免费文本模型目录 |
| GET /catalog | 查看已缓存的免费文本模型与当前路由 |
| GET /projects | 项目列表。`?archived=1` 只看已归档 |
| POST /projects | 创建项目。`{ name, positioning?, niche?, audience?, notes? }` |
| GET /projects/:id | 项目详情和资料列表 |
| PATCH /projects/:id | 改名、改说明，或 `{ "archived": true \| false }` |
| DELETE /projects/:id | 删除项目、资料和选题数据源。任务保留，`projectId` 变为空 |
| GET /projects/:id/materials | 资料列表 |
| POST /projects/:id/materials | 添加资料。JSON：`{ kind: "note" \| "link", title?, body?, url? }`。文件用 multipart 字段 `file`，可选 `title` / `note` |
| GET /projects/:id/materials/:materialId | 文件下载；文字和链接返回 JSON |
| DELETE /projects/:id/materials/:materialId | 删除一份资料 |
| GET /projects/:id/data-sources | 选题数据源列表，含最近摘要。随工作台口令；未设置 `APP_ACCESS_TOKEN` 时和工作台一样可打开 |
| POST /projects/:id/data-sources | 添加数据源。`{ "name": "ai产品发布评测" }`。同名返回 409。不收集写入口令 |
| PATCH /projects/:id/data-sources/:sourceId | `{ "enabled": true \| false }`。停用后选题和文案不再读它 |
| POST /projects/:id/data-sources/entries | 助手按名称写入一条摘要。必须带 `Authorization: Bearer`，口令是 Worker 密钥 `DATA_SOURCE_TOKEN`，不是工作台口令。未配置该密钥时返回 503，口令不对返回 401。即使没有设置 `APP_ACCESS_TOKEN`，这条写入也不对公众开放 |
| POST /projects/:id/data-sources/:sourceId/entries | 同上，用数据源 id 而不是名称 |
| POST /topics | 推荐选题。`{ niche?, audience?, keywords?, idea?, count?, projectId? }`。带 `projectId` 时，免费文本模型会看到该项目的资料和已启用选题数据源。`{ "fixture": true }` 返回示例选题，不调用模型 |
| POST /jobs | 创建任务。选题可以带角度和钩子，最长 240 字。可选 `projectId` |
| GET /jobs | 任务列表。`?projectId=` 只看一个项目，`?unassigned=1` 只看未分组 |
| GET /jobs/:id | 任务详情 |
| PATCH /jobs/:id | 修改标题、正文、话题、出图提示词 |
| POST /jobs/:id/draft | 生成文案。`{ "fixture": true }` 使用示例文案，不调用模型 |
| POST /jobs/:id/images | 按当前 Provider 出图。已有图片时需 `{ "replace": true }`。`{ "index": 2, "replace": true }` 只重画第 2 张 |
| POST /jobs/:id/images/upload | 上传 PNG / JPEG / WEBP / GIF |
| POST /jobs/:id/images/reorder | 调整图片顺序 |
| DELETE /jobs/:id/images/:assetId | 删除一张图 |
| GET /jobs/:id/images/:assetId | 读取图片，`content-disposition: inline` |
| POST /jobs/:id/review | `{ "decision": "approved" \| "rejected", "note"?: string }`。驳回必须带说明 |
| POST /jobs/:id/export | 仅批准后导出素材包与 `postNote` |
| GET /jobs/:id/package | 下载 zip |
| POST /jobs/:id/duplicate | 复制为一条需要重新审核的新任务 |

任务 JSON 额外返回 `projectId` 和 `projectName`。没有项目时 `projectId` 为 `null`。选题和文案响应额外返回 `materialsUsed` 与 `materialNote`；没有项目时分别是 `0` 和 `null`，项目还没有资料时会说明这次只按关键词来写。已启用且有摘要的选题数据源会出现在 `materialNote` 里，并写进提示词，标明为助手写入的调研摘要。

助手写入摘要的 JSON：

```json
{
  "sourceName": "ai产品发布评测",
  "title": "本周发布摘要",
  "body": "markdown 或纯文本",
  "url": "https://example.com/note",
  "collectedAt": "2026-11-12T08:00:00+08:00"
}
```

`sourceName` 只在按名称写入时需要，数据源必须已经在项目里建好。`url` 和 `collectedAt` 可省略。按 id 写入时不要带 `sourceName`。请求头是 `Authorization: Bearer <DATA_SOURCE_TOKEN>` 和 `Content-Type: application/json`。不要把口令写进仓库或页面。

若设置了 Worker 密钥 `APP_ACCESS_TOKEN`，除 `/`、`/health`、`/favicon.svg` 和 `/session` 外，工作台接口都要先解锁。选题数据源的写入不使用这个口令，只认 `DATA_SOURCE_TOKEN`。未设置 `APP_ACCESS_TOKEN` 时，工作台接口保持开放，写入接口仍然关闭。
