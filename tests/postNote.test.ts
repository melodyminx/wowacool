import assert from "node:assert/strict";
import test from "node:test";
import { encodePostNotePayload, parseMediaInfo } from "../src/export/postNote.js";
import { encodeApprovedPackage, type ExportManifest } from "../src/export/package.js";
import { POSTNOTE_CONSTRAINTS } from "../src/export/postNote.js";

test("postNote payload 形状与约束", () => {
  const payload = encodePostNotePayload({
    title: "桌面整理小巧思",
    content: "先把常用物品放在手边。",
    tags: "收纳,桌面整理",
    imageUrls: [
      "https://cdn.example.com/1.png",
      "xhsfile://local/2.png",
    ],
  });
  assert.equal(payload.title, "桌面整理小巧思");
  assert.equal(payload.content, "先把常用物品放在手边。");
  assert.equal(payload.tags, "收纳,桌面整理");
  const media = parseMediaInfo(payload.mediaInfo);
  assert.deepEqual(media, {
    image_resources: [
      { url: "https://cdn.example.com/1.png" },
      { url: "xhsfile://local/2.png" },
    ],
  });
});

test("标题超长、图片数量和非法 URL 都会报错", () => {
  assert.throws(
    () =>
      encodePostNotePayload({
        title: "这是一个明显超过二十个字的小红书标题需要被拒绝",
        content: "正文",
        imageUrls: ["https://cdn.example.com/1.png"],
      }),
    /标题超过/,
  );
  assert.throws(
    () => encodePostNotePayload({ title: "标题", content: "正文", imageUrls: [] }),
    /1–18/,
  );
  const nineteen = Array.from({ length: 19 }, (_, i) => `https://cdn.example.com/${i}.png`);
  assert.throws(() => encodePostNotePayload({ title: "标题", content: "正文", imageUrls: nineteen }), /1–18/);
  assert.throws(
    () =>
      encodePostNotePayload({
        title: "标题",
        content: "正文",
        imageUrls: ["http://insecure.example.com/1.png"],
      }),
    /https:\/\/ 或 xhsfile/,
  );
});

test("审核通过的素材包可再编码为同样形状的 postNote 参数", () => {
  const manifest: ExportManifest = {
    version: 1,
    platform: "xiaohongshu",
    kind: "image-text",
    jobId: "job-test",
    topic: "桌面整理小巧思",
    status: "approved",
    exportedAt: "2026-11-11T00:00:00.000Z",
    constraints: POSTNOTE_CONSTRAINTS,
    postNote: encodePostNotePayload({
      title: "桌面整理小巧思",
      content: "正文",
      tags: "收纳",
      imageUrls: ["https://cdn.example.com/1.png"],
    }),
    assets: {
      images: [
        {
          filename: "01.png",
          relativePath: "images/01.png",
          prompt: "图1",
          url: "https://cdn.example.com/1.png",
        },
      ],
    },
    publishReady: true,
    notes: [],
  };
  const again = encodeApprovedPackage(manifest);
  assert.equal(again.title, "桌面整理小巧思");
  assert.deepEqual(parseMediaInfo(again.mediaInfo).image_resources, [{ url: "https://cdn.example.com/1.png" }]);
});
