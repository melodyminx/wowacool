# 官方 xhs.postNote 约定

来源：https://miniapp.xiaohongshu.com/doc/DC604617 （公开文档，已核对）。

这是「唤起发布页」，不是代发。用户必须自己点发布。

## 参数

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| title | string | 否 | 最大 20 字，超出报错 |
| content | string | 否 | 最大 1000 字，超出报错 |
| mediaInfo | string | 是 | `JSON.stringify({ image_resources: [{ url }] })`；图或视频二选一，一期只用图，1–18 张 |
| tags | string | 否 | 话题以英文逗号分割 |

url 必须是 `https://` 或 `xhsfile` 本地协议。网络图需 `content-disposition: inline`。

## 本仓库行为

- 导出前校验标题、正文、图片数量。
- 纯函数 `encodePostNotePayload` 生成上述参数，不发网络请求。
- 本地 mock 导出若还没有可公开访问的 https 图床，会写入约定占位 `xhsfile://export/<jobId>/<filename>`，并在清单 `notes` 与 `publishReady` 中标明：真正唤起前需要替换为真实 https 或小红书本地 xhsfile 资源。
- 不要在本期实现浏览器自动登录或非官方发布。

## 开放平台

`write_notes` 仍为规划中：https://openaccount.xiaohongshu.com/docs/scope 。即使将来开通，也应先经人工审核，再由官方接口或官方发布页完成发布。
