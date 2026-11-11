# 缺口清单

以下事项会阻塞完整上线或官方发布，但不阻塞本期「本地可跑通」的架构与 mock 流程。

## 参考资料未对上

- 飞书模板 https://kcn0extbygpm.feishu.cn/wiki/ZM1awBOODifBzekPmE6c5eOAn7f 需登录，本次未读到。
- B 站 BV1LNpo61E8g 公开信息接口返回 412，未对上视频细节。
- 架构按总管简报 + OpenRouter / 小红书官方文档搭建，待补对上述模板与视频后如有差异再调整。

## 托管与部署

- 代码在 GitHub 仓库 `wowacool`。推到 `main` 时 `.github/workflows/deploy.yml` 会用 Wrangler 部署 Worker `wowacool`。
- 部署前需要在 GitHub Actions 设置仓库密钥 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`。不要把这两个值写进仓库。
- `GET /` 是运营工作台，`GET /health` 仍是 JSON。D1 与 R2 已绑定。`schema/d1.sql` 已应用到数据库 `wowacool`，本次没有新增列，部署前不用再跑 SQL。
- 队列保持未绑定。不要在配置里写账号 ID。

## 出图

- 工作台默认 `IMAGE_PROVIDER=workers_ai`，通过 Worker 的 `AI` 绑定调用 `@cf/black-forest-labs/flux-2-klein-4b`，请求 768×1024（3:4）。绑定缺失时接口会说明，不会偷偷改成占位图。
- `IMAGE_PROVIDER=mock` 仍是明确的占位图回退。本地 CLI 没有 AI 绑定，默认继续 mock。
- `IMAGE_PROVIDER=openai_compatible` 只在地址、模型和密钥都配齐时发请求。Seedance 与 Grok / xAI 会被拒绝。
- 免费文本模型只写选题、草稿和出图提示词，不是出图引擎。
- 视频生成和视频发布仍然不做。

## 发布能力缺失

- 开放平台 `write_notes` scope 仍为「规划中」（https://openaccount.xiaohongshu.com/docs/scope）。
- 辅助发布需小红书小程序 / 小组件环境才能真正唤起 `xhs.postNote`。本地导出的 `xhsfile://export/...` 只是素材包占位协议，真正唤起前需要替换为可访问的 `https://` 或小红书本地 `xhsfile` 资源。
- 导出的图片 URL 指向 Worker 自身，响应带 `content-disposition: inline`。若设置了 `APP_ACCESS_TOKEN`，这些链接需要口令，真正唤起小红书前要换成可公开访问的 https 图片。未设置口令时，链接对知道地址的人开放。

## OpenRouter 额度有限

- 未充值账号免费模型大约 20 RPM / 50 RPD；累计充值约 $10 后约 1000 RPD。
- 免费模型名单与可用性会变化，必须以运行时目录为准。
- 部分免费模型 reasoning 不可关，需要足够 `max_tokens`。
- 额度用尽后应停止或等待，而不是回退到付费模型。

## 总管对接

- 「自动视频工作流」与本执行通道之间的选题下发、审核回传、向用户汇报协议尚未形式化。本期只提供本地 CLI 与任务 JSON，供总管后续接入。
