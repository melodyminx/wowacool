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
IMAGE_PROVIDER=mock
# 未来：
IMAGE_PROVIDER=openai_compatible
IMAGE_GEN_BASE_URL=
IMAGE_GEN_API_KEY=
IMAGE_GEN_MODEL=
IMAGE_GEN_PATH=/images/generations
```

约定未来走 OpenAI 兼容的 `POST {IMAGE_GEN_BASE_URL}{IMAGE_GEN_PATH}`，请求体至少包含 `model`、`prompt`、`size`。在用户给出已验证的调用方式前，该 Provider 只报错、不发请求。禁止把 Seedance 或 Grok Bot 接进这个接口。

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
| POST /jobs | 创建任务 |
| GET /jobs | 任务列表 |
| GET /jobs/:id | 任务详情 |
| PATCH /jobs/:id | 修改标题、正文、话题、出图提示词 |
| POST /jobs/:id/draft | 生成文案。`{ "fixture": true }` 使用示例文案，不调用模型 |
| POST /jobs/:id/images | 按现有 Provider 出图，默认 mock。已有图片时需 `{ "replace": true }` |
| POST /jobs/:id/images/upload | 上传 PNG / JPEG / WEBP / GIF |
| POST /jobs/:id/images/reorder | 调整图片顺序 |
| DELETE /jobs/:id/images/:assetId | 删除一张图 |
| GET /jobs/:id/images/:assetId | 读取图片，`content-disposition: inline` |
| POST /jobs/:id/review | `{ "decision": "approved" \| "rejected", "note"?: string }`。驳回必须带说明 |
| POST /jobs/:id/export | 仅批准后导出素材包与 `postNote` |
| GET /jobs/:id/package | 下载 zip |
| POST /jobs/:id/duplicate | 复制为一条需要重新审核的新任务 |

若设置了 Worker 密钥 `APP_ACCESS_TOKEN`，除 `/`、`/health`、`/favicon.svg` 和 `/session` 外都要先解锁。未设置时这些接口保持开放。
