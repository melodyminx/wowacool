# 架构概览

## 角色

- **自动视频工作流**：总管。负责选题、审核对接、向用户汇报。本期本仓库不实现总管侧调度。
- **本仓库（杂活执行通道）**：按选题生成标题 / 正文 / 话题，走占位或未来低成本文生图，强制人工审核后导出可发布素材包。

一期只做小红书图文，不做视频、抖音、视频号。

## 本地主路径

```
选题
  → OpenRouter 免费文本模型生成文案（标题 ≤20 字，正文 ≤1000 字，话题英文逗号分割）
  → 文生图 Provider（默认 mock 占位图，1–18 张）
  → 状态变为 pending_review
  → 人工批准 / 驳回
  → 仅批准后导出 data/exports/<jobId>/
  → manifest.postNote 对齐官方 xhs.postNote 参数
```

本地数据全部落在文件系统：

- `data/catalog/free-models.json`：免费文本模型目录缓存
- `data/catalog/quota-snapshot.json`：额度快照（不含密钥）
- `data/jobs/<jobId>/job.json` 与 `images/`
- `data/exports/<jobId>/`：可发布素材包
- `data/logs/`：运行日志（自动脱敏）

这套本地路径不依赖 Cloudflare。线上运营页走同一个领域函数，但把任务写到 D1、把图片和素材包写到 R2。Worker `wowacool`（`src/cloudflare/worker.ts`）在 `GET /` 返回工作台，在 `GET /health` 返回 JSON。表结构见 `schema/d1.sql`，现有库已经包含这些表，没有额外迁移。队列未启用，文案、出图、审核和导出都在当前请求里完成。

## 免费模型路由

1. `GET https://openrouter.ai/api/v1/models` 刷新目录。
2. 真正免费：`id` 以 `:free` 结尾，或 `pricing.prompt` 与 `pricing.completion` 均为 0。
3. 只要通用文本聊天模型：`output_modalities` 含 `text`，且不含 `audio` / `image` / `video` / `speech`，避免把 Google Lyria 等音频生成模型纳入回退链。若目录提供 `endpoints`，还需支持 `/api/v1/chat/completions`。
4. 优先使用仍可用的 `liquid/lfm-3-1.7b:free`（可用 `OPENROUTER_PREFERRED_MODEL` 覆盖），否则按估算参数量从小到大排列。目录以运行时为准，不把静态名单当作唯一来源。
5. 调用 `POST /api/v1/chat/completions` 时同时传官方 `models` 回退数组，且数组里只能是免费文本模型。官方文档明确：若回退到付费模型，将按付费模型计费。`models` 最多 3 条（2026-11-11 实测 chat/completions 对更长数组返回 400）；其余免费候选由本地切换接力。
6. 本地再做一层：遇到 429、模型不可用、无端点等情况时，从候选名单中去掉失败模型并切换，写入日志。若日额度耗尽（`GET /api/v1/key` 的 `free_model_daily_requests.remaining === 0` 或错误信息表明 daily limit），停止而不是盲目换模。

部分免费模型 reasoning 不可关，请求默认 `max_tokens=2048`，避免只有推理过程没有可见 content。

## 出图

出图不走 Grok Bot / `GenerateImage` 额度。`ImageProvider` 接口与 `mock` 实现已落地；`openai_compatible` 仅预留环境变量与报错说明。用户已有 Seedance 接口，但是视频模型，一期禁止当作文生图引擎。免费文本模型只写草稿和出图提示词，不能作为唯一出图引擎。

## 审核与导出

审核门禁是硬约束：`status !== approved` 时拒绝导出。导出清单的 `postNote` 字段直接对齐官方唤起参数。`encodePostNotePayload` 是纯函数，不发网络请求。辅助发布只能约定如何唤起 `xhs.postNote`，由用户自己点发布，本仓库不实现自动发布、浏览器登录抓取或非官方发布。

## Cloudflare 映射

| 本地 | 线上 |
| --- | --- |
| `data/jobs` | D1 `jobs` / `assets`，图片对象在 R2 |
| `data/exports` | R2 `jobs/<id>/export/`，并提供 zip 下载 |
| `data/catalog` | D1 `model_catalog` / `quota_snapshots` |
| CLI 命令 | Worker 路由，在请求内执行 |

D1 绑定 `DB`（数据库 `wowacool`）和 R2 绑定 `ASSETS`（桶 `wowacool-assets`）写在 `wrangler.toml`。队列仍注释。可选密钥 `APP_ACCESS_TOKEN` 不写进仓库；未设置时运营页公开可开。
