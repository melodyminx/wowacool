import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCopy, validateCopy } from "../src/copywriting/validate.js";
import { parseCopyResponse } from "../src/copywriting/generate.js";

test("标题超过 20 字被校验出来，normalize 会截断", () => {
  const tooLong = "这是一个明显超过二十个字的小红书标题需要被截断";
  const issues = validateCopy({ title: tooLong, content: "正文", tags: "收纳" });
  assert.ok(issues.some((i) => i.field === "title"));
  const normalized = normalizeCopy({ title: tooLong, content: "正文", tags: "#收纳，桌面" });
  assert.equal(Array.from(normalized.title).length, 20);
  assert.equal(normalized.tags, "收纳,桌面");
});

test("正文超过 1000 字被校验并截断", () => {
  const content = "哈".repeat(1005);
  const issues = validateCopy({ title: "桌面整理", content, tags: "" });
  assert.ok(issues.some((i) => i.field === "content"));
  const normalized = normalizeCopy({ title: "桌面整理", content, tags: "" });
  assert.equal(Array.from(normalized.content).length, 1000);
});

test("可以从模型输出中解析 JSON 文案", () => {
  const raw = '```json\n{"title":"桌面整理小巧思","content":"先把常用的东西放在手边。","tags":["收纳","桌面"],"imagePrompts":["图1","图2","图3"]}\n```';
  const draft = parseCopyResponse(raw, "桌面整理小巧思", 3);
  assert.equal(draft.title, "桌面整理小巧思");
  assert.equal(draft.tags, "收纳,桌面");
  assert.equal(draft.imagePrompts.length, 3);
});
