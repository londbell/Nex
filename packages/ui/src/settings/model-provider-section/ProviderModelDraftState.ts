import type { ProviderSettingsFormModel } from "@/lib/providerSettingsFormTypes.js";
import { clearManualModelConfig } from "@nex/provider";
import {
  createProviderModelDraftValues,
  type ProviderModelDraftValues,
} from "@/settings/model-provider-section/ProviderModelMetadata.js";

const CONFIG_VALUE_FIELDS = [
  "supportsJsonSchemaOutputValue",
  "supportsNativeWebSearchValue",
  "supportsMidConversationSystemValue",
  "reasoningLevelValuesValue",
] as const;

/** 继承基线（内建规则 + models.dev 命中）映射出的数值字段填充值。 */
function inheritedNumericDefaults(model: ProviderSettingsFormModel): {
  contextWindowValue: string;
  maxOutputTokensValue: string;
  reasoningLevelMapValue: string;
} {
  const inherited = model.inheritedConfig ?? model.config;
  const contextWindow = inherited.properties?.contextWindow;
  const maxOutput = inherited.optionSpecs?.maxOutputTokens?.max;
  const reasoningMap = inherited.optionSpecs?.reasoningLevel?.map;
  return {
    contextWindowValue: contextWindow == null ? "" : String(contextWindow),
    maxOutputTokensValue: maxOutput == null ? "" : String(maxOutput),
    reasoningLevelMapValue: reasoningMap ?? "",
  };
}

/**
 * 只投影未覆盖控件；Host 是推荐规则的唯一解析者，草稿不保存第二份可写 Effective Config。
 * 数值字段额外做"填入"：继承基线（含 models.dev 命中）直接写入空值控件，
 * 用户已编辑或已显式覆盖的字段不动；保存时随个人配置显式落盘。
 */
export function projectModelDraft(
  draft: ProviderModelDraftValues,
  model: ProviderSettingsFormModel,
): ProviderModelDraftValues {
  if (draft.useRecommendedConfigValue === false) return draft;
  const defaults = createProviderModelDraftValues({
    ...model,
    personalConfig: {},
    config: model.inheritedConfig ?? model.config,
  });
  const explicit = new Set(draft.overriddenFieldsValue ?? []);
  const next = { ...draft, inputFormatValue: { ...draft.inputFormatValue } };
  for (const field of CONFIG_VALUE_FIELDS) {
    if (!explicit.has(field)) Object.assign(next, { [field]: defaults[field] });
  }
  for (const field of Object.keys(
    next.inputFormatValue,
  ) as (keyof typeof next.inputFormatValue)[]) {
    if (!explicit.has(`inputFormatValue.${field}`))
      next.inputFormatValue[field] = defaults.inputFormatValue[field];
  }
  // "填入模型信息"：空控件直接填继承基线值，不再是纯占位符。
  const numericDefaults = inheritedNumericDefaults(model);
  for (const field of [
    "contextWindowValue",
    "maxOutputTokensValue",
    "reasoningLevelMapValue",
  ] as const) {
    if (!explicit.has(field) && !next[field].trim()) next[field] = numericDefaults[field];
  }
  return next;
}

export function updateModelDraft(
  draft: ProviderModelDraftValues,
  patch: Partial<ProviderModelDraftValues>,
  model: ProviderSettingsFormModel,
): ProviderModelDraftValues {
  let next: ProviderModelDraftValues = { ...draft };
  if (patch.idValue !== undefined && patch.idValue !== draft.idValue) {
    // 模型 ID 变化时，与上一份基线填充值一致的数值字段是自动填入的，
    // 清空以便按新 ID 重填；与基线不同则是用户手改，保留。
    const previousDefaults = inheritedNumericDefaults(model);
    for (const field of [
      "contextWindowValue",
      "maxOutputTokensValue",
      "reasoningLevelMapValue",
    ] as const) {
      if (draft[field] === previousDefaults[field]) next[field] = "";
    }
  }
  if (
    patch.useRecommendedConfigValue !== undefined &&
    patch.useRecommendedConfigValue !== (draft.useRecommendedConfigValue !== false)
  ) {
    if (patch.useRecommendedConfigValue) {
      return restoreModelDraft(draft, model);
    }
    const projected = projectModelDraft(draft, model);
    const inherited = model.inheritedConfig ?? model.config;
    // 只补空的继承输入；错误的非空用户输入保留，让保存指出错误，不以切换模式吞掉编辑。
    return {
      ...projected,
      contextWindowValue:
        projected.contextWindowValue || String(inherited.properties?.contextWindow ?? ""),
      maxOutputTokensValue:
        projected.maxOutputTokensValue || String(inherited.optionSpecs?.maxOutputTokens?.max ?? ""),
      reasoningLevelMapValue:
        projected.reasoningLevelMapValue || inherited.optionSpecs?.reasoningLevel?.map || "",
      useRecommendedConfigValue: false,
    };
  }
  const explicit = new Set(draft.overriddenFieldsValue ?? []);
  for (const field of CONFIG_VALUE_FIELDS) if (field in patch) explicit.add(field);
  if (patch.inputFormatValue) {
    for (const field of Object.keys(
      patch.inputFormatValue,
    ) as (keyof typeof patch.inputFormatValue)[]) {
      if (patch.inputFormatValue[field] !== draft.inputFormatValue[field])
        explicit.add(`inputFormatValue.${field}`);
    }
  }
  return { ...next, ...patch, overriddenFieldsValue: [...explicit] };
}

/** 恢复是显式草稿动作，即使原本已开启智能配置也要清除可编辑覆盖。 */
export function restoreModelDraft(
  draft: ProviderModelDraftValues,
  model: ProviderSettingsFormModel,
): ProviderModelDraftValues {
  return {
    ...createProviderModelDraftValues({
      ...model,
      config: model.inheritedConfig ?? {},
      personalConfig: clearManualModelConfig(model.personalConfig),
      useRecommendedConfig: true,
    }),
    idValue: draft.idValue,
    enabledValue: draft.enabledValue,
    clearPersonalConfigValue: true,
  };
}

export function modelDraftOverrides(draft: ProviderModelDraftValues): ReadonlySet<string> {
  if (draft.useRecommendedConfigValue === false) return new Set();
  const result = new Set(draft.overriddenFieldsValue ?? []);
  for (const field of [
    "contextWindowValue",
    "maxOutputTokensValue",
    "reasoningLevelMapValue",
  ] as const) {
    if (draft[field].trim()) result.add(field);
    else result.delete(field);
  }
  return result;
}
