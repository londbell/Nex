import assert from "node:assert/strict";
import test from "node:test";
import type { ProviderSettingsFormModel } from "../src/lib/providerSettingsFormTypes.js";
import { createProviderModelDraftValues } from "../src/settings/model-provider-section/ProviderModelMetadata.js";
import {
  projectModelDraft,
  updateModelDraft,
} from "../src/settings/model-provider-section/ProviderModelDraftState.js";
import { modelInfoDraftPatch } from "../src/settings/model-provider-section/useModelInfoLookup.js";

function modelWithBaseline(contextWindow: number, maxOutput: number): ProviderSettingsFormModel {
  const inherited = {
    properties: { contextWindow },
    optionSpecs: { maxOutputTokens: { max: maxOutput } },
  };
  return {
    modelId: "gpt-5.4",
    config: inherited,
    inheritedConfig: inherited,
    personalConfig: {},
  } as unknown as ProviderSettingsFormModel;
}

test("projectModelDraft fills empty text controls from the inherited baseline", () => {
  const model = modelWithBaseline(200_000, 32_000);
  const draft = projectModelDraft(
    { ...createProviderModelDraftValues(model), contextWindowValue: "", maxOutputTokensValue: "" },
    model,
  );
  assert.equal(draft.contextWindowValue, "200000");
  assert.equal(draft.maxOutputTokensValue, "32000");
});

test("updateModelDraft clears auto-filled values on ID change but keeps manual edits", () => {
  const model = modelWithBaseline(200_000, 32_000);
  const draft = {
    ...projectModelDraft(createProviderModelDraftValues(model), model),
    contextWindowValue: "200000",
    maxOutputTokensValue: "555555",
  };
  const next = updateModelDraft(draft, { idValue: "other-model" }, model);
  assert.equal(next.idValue, "other-model");
  assert.equal(next.contextWindowValue, "");
  assert.equal(next.maxOutputTokensValue, "555555");
});

test("modelInfoDraftPatch only writes fields present in the looked-up config", () => {
  assert.deepEqual(modelInfoDraftPatch({}), {});
  assert.deepEqual(
    modelInfoDraftPatch({
      properties: { contextWindow: 1_050_000, inputFormat: { supportsImage: true } },
      optionSpecs: { reasoningLevel: { values: ["low", "high"] } },
    }),
    {
      contextWindowValue: "1050000",
      reasoningLevelValuesValue: ["low", "high"],
      inputFormatValue: {
        supportsText: true,
        supportsImage: true,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: false,
      },
    },
  );
});
