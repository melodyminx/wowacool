# 硬约束

## 产品范围

- 只做小红书图文。暂不做视频、抖音、视频号。
- 一期能力：选题 → 出图 + 标题 / 正文 / 话题 → 人工审核 → 导出可发布素材包。
- 官方开放平台 `write_notes` 仍在规划中，先导出素材包，不以开放平台代发。

## 素材包与官方 xhs.postNote

对齐公开文档 https://miniapp.xiaohongshu.com/doc/DC604617 ：

- `title?`：最大 20 字，超出报错
- `content?`：最大 1000 字，超出报错
- `mediaInfo`：必填，`JSON.stringify({ image_resources: [{ url }] })`；图或视频二选一，一期只用图，1–18 张
- `tags?`：话题以英文逗号分割
- url 必须是 `https://` 或 `xhsfile` 本地协议；网络图需 `content-disposition: inline`

本仓库可以生成 postNote 参数，但不得代替用户点发布。

## 允许与禁止

允许：

- 使用 OpenRouter 官方接口生成文案
- 使用 Cloudflare Workers AI 官方绑定做文生图（同一 Cloudflare 账号，不另加供应商密钥）
- 在明确配置后使用 OpenAI 兼容的官方文生图接口；未配置时不发请求
- 本地 CLI 与 `IMAGE_PROVIDER=mock` 继续使用占位图
- 导出素材包，以及约定如何在小程序环境唤起 `xhs.postNote`

禁止：

- 浏览器登录抓取
- 非官方自动发布
- 给别人的笔记批量评论
- 把付费模型放进 OpenRouter 回退链
- 用 Grok Bot / `GenerateImage` 做出图，以免消耗该额度
- 把 Seedance 视频模型当作一期文生图引擎
- 把免费文本模型当作唯一出图引擎
- 将 API Key 打印、写入仓库、或写进 git

评论助手如后续再做，也只针对用户自己的内容，且必须 AI 拟稿、人工确认后再发。本期不实现。

## 密钥

- 只在环境变量或本地 `.env`（已被 gitignore）中读取 `OPENROUTER_API_KEY`
- 仓库只保留 `.env.example`（无值）
- 日志与错误输出必须脱敏
