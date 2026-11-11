import assert from "node:assert/strict";
import test from "node:test";
import { MockImageProvider } from "../src/images/mock.js";
import { OpenAiCompatibleImageProvider } from "../src/images/openaiCompatible.js";
import { assertImageCount, toImageSpecs } from "../src/images/provider.js";

test("mock 出图支持 1 张和 18 张，拒绝 0 和 19", async () => {
  const provider = new MockImageProvider();
  const one = await provider.generate(toImageSpecs(["只有一张"]));
  assert.equal(one.length, 1);
  assert.equal(one[0].filename, "01.png");
  assert.equal(one[0].bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), true);

  const eighteenPrompts = Array.from({ length: 18 }, (_, i) => `图${i + 1}`);
  const eighteen = await provider.generate(toImageSpecs(eighteenPrompts));
  assert.equal(eighteen.length, 18);
  assert.equal(eighteen[17].filename, "18.png");

  assert.throws(() => assertImageCount(0), /1–18/);
  assert.throws(() => assertImageCount(19), /1–18/);
  await assert.rejects(() => provider.generate([]), /1–18/);
});

test("未配置的真实文生图 Provider 拒绝发请求", async () => {
  const provider = new OpenAiCompatibleImageProvider({});
  await assert.rejects(
    () => provider.generate(toImageSpecs(["测试"])),
    /文生图 Provider 未配置/,
  );
});
