# wowacool

小红书图文工作台。选题推荐 → 文案 → 竖版出图 → 人工审核 → 导出可发布素材包。线上默认用 Cloudflare Workers AI 出图；本地 CLI 仍用占位图。

总管是「自动视频工作流」；本仓库只做小红书图文，暂不做视频、抖音、视频号。官方 `write_notes` 仍在规划中，本期只导出素材包，并约定如何唤起官方发布页 `xhs.postNote`，由用户自己点发布。不抓取浏览器登录态，不代发。

线上工作台由同一个 Worker 提供：打开 `https://wowacool.melody6188.workers.dev/` 是中文运营页，`GET /health` 仍返回 JSON。先建项目并放入资料，再在项目里推荐选题和创建任务。项目与任务存在 D1，资料文件、图片和素材包存在 R2。没有归到项目的旧任务显示在「未分组」。本地 CLI 继续可用，数据仍在 `data/`，不包含项目层。

## 如何本地跑

要求：Node.js 22.12+（Wrangler 4 部署与类型生成需要；本地 CLI 测试同样使用这个版本）。

```bash
npm install
npm test
```

如需真实文案生成，把 OpenRouter Key 放到环境变量或复制 `.env.example` 为 `.env`（不要把 Key 发到聊天或提交进仓库）：

```bash
# 刷新免费文本模型目录（不计免费对话次数）
npm run cli -- catalog refresh

# 查询额度（不计免费对话次数）
npm run cli -- quota

# 按选题出草稿（会消耗 1 次免费对话额度）
npm run cli -- draft --topic "桌面整理小巧思" --images 3

# 占位出图并进入待审核
npm run cli -- images --job <任务id>

# 人工审核
npm run cli -- review approve --job <任务id>
# 或：npm run cli -- review reject --job <任务id> --note "标题需更具体"

# 导出可发布素材包（未批准会失败）
npm run cli -- export --job <任务id>
```

一条命令跑通本地 mock 流程（不调用大模型、自动批准并导出）：

```bash
npm run cli -- run --topic "桌面整理小巧思" --images 3 --skip-llm --approve
```

导出目录为 `data/exports/<任务id>/`，内含 `manifest.json`、`postnote.json` 和 `images/`。

## 架构要点

- 选题和文案只走 OpenRouter 免费文本模型，带官方 `models` 回退与本地 429 / 不可用切换；回退链禁止出现付费模型，`models` 最多 3 条。
- 工作台出图走 Workers AI 绑定（`@cf/black-forest-labs/flux-2-klein-4b`，请求 768×1024）。`IMAGE_PROVIDER=mock` 才是占位图。不调用 Grok 出图，也不把 Seedance 当文生图。
- 审核门禁强制：未批准不得导出。视频生成和视频发布不做。
- Cloudflare Worker `wowacool` 在 `/` 提供运营工作台，在 `/health` 说明当前出图方式。任务步骤在请求内完成，不依赖队列。本地 CLI 数据仍在 `data/`。

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/CONSTRAINTS.md](docs/CONSTRAINTS.md)、[docs/INTERFACES.md](docs/INTERFACES.md)、[docs/POSTNOTE.md](docs/POSTNOTE.md)。

## 部署到 Cloudflare

Worker 入口是 `src/cloudflare/worker.ts`，配置在 `wrangler.toml`。`GET /` 是运营页，`GET /health` 是 JSON，并写明当前出图 Provider。D1 `wowacool`、R2 `wowacool-assets` 和 Workers AI 绑定 `AI` 都在配置里。没有账号 ID 或 API token。队列保持注释，任务步骤在请求内完成。

新数据库执行 `schema/d1.sql`。已经在跑的数据库 `wowacool` 需要再执行一次项目迁移（只跑一次；`project_id` 已经存在时，`ALTER TABLE` 会失败，那时跳过即可）：

```bash
npx wrangler d1 execute wowacool --remote --file=schema/migrations/0002_projects.sql
```

这次会新增 `projects`、`materials`，并给 `jobs` 增加可空的 `project_id`。旧任务保持 `NULL`，工作台里显示为「未分组」。Worker 在第一次业务请求时也会补上同样的变更，避免还没执行 SQL 时 `/jobs` 不可用。`GET /health` 不改。不要把账号 ID 或 token 写进命令记录。

选题数据源是另一份可重复执行的迁移，不要重跑上面的 `0002_projects.sql`：

```bash
npx wrangler d1 execute wowacool --remote --file=schema/migrations/0003_data_sources.sql
```

助手写入摘要还需要 `npx wrangler secret put DATA_SOURCE_TOKEN`。口令不要写进仓库。未设置 `APP_ACCESS_TOKEN` 时工作台仍然开放，但这条写入接口不会因此开放。

本地检查打包（不上传）：

```bash
npm run deploy:check
```

推到 `main` 后，`.github/workflows/deploy.yml` 用 Wrangler 部署。先在仓库 Settings → Secrets and variables → Actions 添加：

- `CLOUDFLARE_API_TOKEN`：账号 API token，权限选 Edit Cloudflare Workers，并限定到目标账号
- `CLOUDFLARE_ACCOUNT_ID`：该 Cloudflare 账号的 Account ID

创建 token：https://dash.cloudflare.com/?to=/:account/api-tokens  
查找 Account ID：https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/

文案密钥不要写进仓库。部署后执行：

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

`workers.dev` 地址是公开的。如果希望只有团队能打开运营页，再设置可选口令；不设置时页面保持开放，方便部署后直接演示：

```bash
npx wrangler secret put APP_ACCESS_TOKEN
```

未配置 `OPENROUTER_API_KEY` 或免费额度用尽时，页面会说明原因，并可以改用示例选题和示例文案把配图、审核和导出走完。不会改用付费模型。出图使用同一个 Cloudflare 账号上的 Workers AI，不需要新的供应商密钥；要退回占位图，把 `IMAGE_PROVIDER` 设为 `mock`。也可以上传自己的图片。导出的是素材包和官方 `xhs.postNote` 参数，不会发布到小红书。

## 缺口

`write_notes` 仍规划中。视频生成和视频发布不做。D1、R2 和 Workers AI 已绑定，队列仍不使用。完整清单见 [docs/GAPS.md](docs/GAPS.md)。
