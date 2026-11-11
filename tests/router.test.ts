import assert from "node:assert/strict";
import test from "node:test";
import {
  isFreeModel,
  isTextChatModel,
  selectFreeTextModels,
  type RawOpenRouterModel,
} from "../src/openrouter/catalog.js";
import {
  PaidModelRejectedError,
  assertAllFree,
  buildModelRoute,
} from "../src/openrouter/router.js";

function model(partial: Partial<RawOpenRouterModel> & { id: string }): RawOpenRouterModel {
  return {
    name: partial.id,
    pricing: { prompt: "0", completion: "0" },
    architecture: {
      modality: "text->text",
      input_modalities: ["text"],
      output_modalities: ["text"],
    },
    endpoints: ["/api/v1/chat/completions"],
    ...partial,
  };
}

test("id 以 :free 结尾视为免费", () => {
  assert.equal(
    isFreeModel(model({ id: "acme/foo:free", pricing: { prompt: "1", completion: "1" } })),
    true,
  );
});

test("pricing.prompt 与 completion 均为 0 视为免费", () => {
  assert.equal(isFreeModel(model({ id: "openrouter/free", pricing: { prompt: "0", completion: "0" } })), true);
});

test("付费定价不是免费模型", () => {
  assert.equal(
    isFreeModel(model({ id: "openai/gpt-4o-mini", pricing: { prompt: "0.15", completion: "0.6" } })),
    false,
  );
});

test("排除音频等非文本输出模型", () => {
  const lyria = model({
    id: "google/lyria-3-pro-preview",
    architecture: {
      modality: "text+image->text+audio",
      input_modalities: ["text", "image"],
      output_modalities: ["text", "audio"],
    },
  });
  assert.equal(isFreeModel(lyria), true);
  assert.equal(isTextChatModel(lyria), false);
});

test("路由只选免费文本模型，优先 preferred，回退全免费", () => {
  const catalog = selectFreeTextModels([
    model({ id: "google/lyria-3-clip-preview", architecture: { output_modalities: ["text", "audio"] } }),
    model({ id: "liquid/lfm-2.5-2.6b:free" }),
    model({ id: "nvidia/nemotron-3.5-lightning:free" }),
    model({ id: "liquid/lfm-3-1.7b:free" }),
    model({ id: "openai/gpt-4o-mini", pricing: { prompt: "0.15", completion: "0.6" } }),
    model({ id: "openrouter/free" }),
  ]);
  const ids = catalog.map((m) => m.id);
  assert.ok(ids.includes("liquid/lfm-3-1.7b:free"));
  assert.ok(!ids.includes("google/lyria-3-clip-preview"));
  assert.ok(!ids.includes("openai/gpt-4o-mini"));

  const route = buildModelRoute(catalog, { preferredId: "liquid/lfm-3-1.7b:free" });
  assert.equal(route.model, "liquid/lfm-3-1.7b:free");
  assert.ok(route.models.includes("liquid/lfm-2.5-2.6b:free"));
  assert.ok(!route.models.includes("openai/gpt-4o-mini"));
  assert.ok(!route.candidates.some((id) => !id.endsWith(":free") && id !== "openrouter/free"));
  assertAllFree([route.model, ...route.models], catalog);
});

test("拒绝把付费模型放进回退链", () => {
  const catalog = selectFreeTextModels([model({ id: "liquid/lfm-3-1.7b:free" })]);
  assert.throws(
    () => assertAllFree(["liquid/lfm-3-1.7b:free", "openai/gpt-4o-mini"], [
      ...catalog,
      model({ id: "openai/gpt-4o-mini", pricing: { prompt: "1", completion: "1" } }),
    ]),
    (err: unknown) => err instanceof PaidModelRejectedError,
  );
});
