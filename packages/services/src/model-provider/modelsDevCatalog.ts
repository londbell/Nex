import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import {
  modelConfigDataSchema,
  type ModelInputFormatData,
  type ModelPropertiesData,
} from "@nex/shared/model-config";
import { getAppConfigDir } from "../paths.js";

/**
 * models.dev 公共模型目录客户端。
 *
 * 职责：拉取并缓存 https://models.dev/api.json，把命中的模型条目映射为
 * 稀疏 ModelConfig 覆盖（contextWindow / maxOutputTokens / 输入输出格式 /
 * 工具调用 / JSON Schema 输出），供模型编辑器"填入模型信息"使用。
 *
 * 注意点：用户侧模型 ID 可能带命名空间前缀（如 "cli/gpt-5.6-sol"），
 * 查找时先全量精确匹配，再按命名空间匹配供应商，最后退化为去掉前缀的
 * 模型名跨供应商匹配；大小写不敏感。
 */

const MODELS_DEV_API_URL = "https://models.dev/api.json";

type ModelConfigData = z.infer<typeof modelConfigDataSchema>;
const CACHE_DIR_NAME = "models-dev";
const CACHE_FILE_NAME = "api.json";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

interface ModelsDevModalities {
  readonly input?: readonly string[];
  readonly output?: readonly string[];
}

interface ModelsDevLimit {
  readonly context?: number;
  readonly output?: number;
}

interface ModelsDevModel {
  readonly id?: string;
  readonly name?: string;
  readonly modalities?: ModelsDevModalities;
  readonly limit?: ModelsDevLimit;
  readonly tool_call?: boolean;
  readonly structured_output?: boolean;
}

interface ModelsDevProvider {
  readonly id?: string;
  readonly name?: string;
  readonly models?: Record<string, ModelsDevModel>;
}

type ModelsDevCatalog = Record<string, ModelsDevProvider>;

export interface ModelsDevMatch {
  readonly providerId: string;
  readonly providerName?: string;
  readonly model: ModelsDevModel;
}

interface CatalogCache {
  readonly data: ModelsDevCatalog;
  readonly fetchedAt: number;
}

let memoryCache: CatalogCache | null = null;
let inflight: Promise<ModelsDevCatalog | null> | null = null;

function cacheFilePath(): string {
  return join(getAppConfigDir(), "runtime", CACHE_DIR_NAME, CACHE_FILE_NAME);
}

function readDiskCache(): CatalogCache | null {
  try {
    if (!existsSync(cacheFilePath())) return null;
    const parsed = JSON.parse(readFileSync(cacheFilePath(), "utf8")) as {
      fetchedAt?: number;
      data?: ModelsDevCatalog;
    };
    if (!parsed.data || typeof parsed !== "object") return null;
    return { data: parsed.data, fetchedAt: parsed.fetchedAt ?? 0 };
  } catch {
    return null;
  }
}

function writeDiskCache(cache: CatalogCache): void {
  try {
    const directory = join(getAppConfigDir(), "runtime", CACHE_DIR_NAME);
    mkdirSync(directory, { recursive: true });
    writeFileSync(cacheFilePath(), JSON.stringify(cache), "utf8");
  } catch {
    // 缓存写失败只影响下次拉取速度，不阻塞目录使用。
  }
}

async function fetchCatalog(): Promise<ModelsDevCatalog> {
  const response = await fetch(MODELS_DEV_API_URL, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`models.dev API 响应异常: HTTP ${response.status}`);
  const data = (await response.json()) as ModelsDevCatalog;
  if (!data || typeof data !== "object" || Object.keys(data).length === 0)
    throw new Error("models.dev API 返回了空目录");
  return data;
}

/** 加载目录：内存 → 磁盘（未过期）→ 网络；任何失败都退回过期数据或 null。 */
export async function loadModelsDevCatalog(): Promise<ModelsDevCatalog | null> {
  const now = Date.now();
  if (memoryCache && now - memoryCache.fetchedAt < REFRESH_INTERVAL_MS) return memoryCache.data;
  const disk = readDiskCache();
  if (disk && now - disk.fetchedAt < REFRESH_INTERVAL_MS) {
    memoryCache = disk;
    return disk.data;
  }
  inflight ??= fetchCatalog()
    .then((data) => {
      memoryCache = { data, fetchedAt: Date.now() };
      writeDiskCache(memoryCache);
      return data;
    })
    .catch(() => (disk ? (memoryCache = disk).data : null))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 命名空间感知查找，返回所有命中条目。跨供应商同名模型很常见
 * （聚合商与官方并存，字段值需要聚合后再信任）：
 * 1. 全量精确匹配完整 ID；
 * 2. "ns/model" 形式：额外尝试去掉命名空间后的模型名；
 * 3. 大小写不敏感。
 */
export function findModelsDevModels(
  catalog: ModelsDevCatalog,
  modelId: string,
): ModelsDevMatch[] {
  const raw = modelId.trim();
  if (!raw) return [];
  const normalized = normalizeId(raw);
  const candidates = new Set([raw, normalized]);
  const separatorIndex = raw.indexOf("/");
  if (separatorIndex > 0 && separatorIndex < raw.length - 1) {
    const rest = raw.slice(separatorIndex + 1);
    candidates.add(rest);
    candidates.add(normalizeId(rest));
  }
  const matches: ModelsDevMatch[] = [];
  for (const [providerId, provider] of Object.entries(catalog)) {
    for (const [modelKey, model] of Object.entries(provider.models ?? {})) {
      if (candidates.has(modelKey) || candidates.has(normalizeId(modelKey))) {
        matches.push({ providerId, providerName: provider.name, model });
      }
    }
  }
  return matches;
}

const INPUT_MODALITY_KEYS = {
  text: "supportsText",
  image: "supportsImage",
  video: "supportsVideo",
  audio: "supportsAudio",
  pdf: "supportsPdf",
} as const satisfies Record<string, keyof ModelInputFormatData>;

/** 众数聚合；平票时数值取最大（更接近官方值），布尔取 true 优先。 */
function majorityValue<T extends number | boolean>(values: readonly T[]): T | undefined {
  if (values.length === 0) return undefined;
  const counts = new Map<string, { value: T; count: number }>();
  for (const value of values) {
    const entry = counts.get(String(value));
    if (entry) entry.count += 1;
    else counts.set(String(value), { value, count: 1 });
  }
  return [...counts.values()].sort(
    (a, b) =>
      b.count - a.count ||
      (typeof b.value === "number" && typeof a.value === "number"
        ? b.value - a.value
        : Number(b.value === true) - Number(a.value === true)),
  )[0]!.value;
}

/** 跨供应商聚合同一模型的条目，产出单一稀疏覆盖。 */
export function modelConfigOverlayFromMatches(matches: readonly ModelsDevMatch[]): ModelConfigData {
  const contexts = matches
    .map((m) => m.model.limit?.context)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const outputs = matches
    .map((m) => m.model.limit?.output)
    .filter((v): v is number => typeof v === "number" && v > 0);
  const toolCalls = matches
    .map((m) => m.model.tool_call)
    .filter((v): v is boolean => typeof v === "boolean");
  const structured = matches
    .map((m) => m.model.structured_output)
    .filter((v): v is boolean => typeof v === "boolean");

  const properties: Partial<ModelPropertiesData> = {};
  const contextWindow = majorityValue(contexts);
  if (contextWindow !== undefined) properties.contextWindow = contextWindow;
  const toolCall = majorityValue(toolCalls);
  if (toolCall !== undefined) properties.supportsToolCall = toolCall;
  const structuredOutput = majorityValue(structured);
  if (structuredOutput !== undefined) properties.supportsJsonSchemaOutput = structuredOutput;

  // 输入模态：任一条目声明支持的类型视为支持；有模态数据时缺失类型按不支持。
  const withModalities = matches.filter((m) => Array.isArray(m.model.modalities?.input));
  if (withModalities.length > 0) {
    const inputFormat: Partial<ModelInputFormatData> = {};
    for (const key of Object.values(INPUT_MODALITY_KEYS)) inputFormat[key] = false;
    for (const match of withModalities) {
      for (const modality of match.model.modalities!.input!) {
        const key = INPUT_MODALITY_KEYS[modality as keyof typeof INPUT_MODALITY_KEYS];
        if (key) inputFormat[key] = true;
      }
    }
    properties.inputFormat = inputFormat as ModelInputFormatData;
    properties.outputFormat = { supportsText: true };
  }

  const propertiesResult =
    Object.keys(properties).length > 0 ? (properties as ModelPropertiesData) : undefined;
  const maxOutputTokens = majorityValue(outputs);
  const optionSpecs =
    maxOutputTokens !== undefined ? { maxOutputTokens: { max: maxOutputTokens } } : undefined;
  if (!propertiesResult && !optionSpecs) return {};
  return {
    ...(propertiesResult ? { properties: propertiesResult } : {}),
    ...(optionSpecs ? { optionSpecs } : {}),
  };
}

type SparseRecord = Record<string, unknown>;

function mergeSection<T extends SparseRecord>(
  base: T | null | undefined,
  overlay: T,
): T {
  const merged: SparseRecord = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged as T;
}

/** 稀疏合并：models.dev 命中的字段覆盖基线（内建通配推荐），未命中的字段保留基线。 */
export function mergeModelConfigData(
  base: ModelConfigData,
  overlay: ModelConfigData,
): ModelConfigData {
  const merged: ModelConfigData = { ...base };
  const overlayProperties = overlay.properties;
  if (overlayProperties) {
    const baseProperties = merged.properties;
    merged.properties = {
      ...mergeSection(baseProperties, overlayProperties),
      ...(overlayProperties.inputFormat
        ? {
            inputFormat: mergeSection(baseProperties?.inputFormat, overlayProperties.inputFormat),
          }
        : {}),
      ...(overlayProperties.outputFormat
        ? {
            outputFormat: mergeSection(
              baseProperties?.outputFormat,
              overlayProperties.outputFormat,
            ),
          }
        : {}),
    } as ModelPropertiesData;
  }
  if (overlay.optionSpecs) {
    merged.optionSpecs = mergeSection(merged.optionSpecs, overlay.optionSpecs);
  }
  return merged;
}

export interface ModelsDevModelInfo {
  readonly found: boolean;
  readonly providerId?: string;
  readonly config: ModelConfigData;
}

/** "获取模型信息"入口：按模型 ID 查询 models.dev 并聚合成稀疏配置；失败返回 found:false。 */
export async function lookupModelsDevModelInfo(modelId: string): Promise<ModelsDevModelInfo> {
  try {
    const catalog = await loadModelsDevCatalog();
    if (!catalog) return { found: false, config: {} };
    const matches = findModelsDevModels(catalog, modelId);
    if (matches.length === 0) return { found: false, config: {} };
    return {
      found: true,
      providerId: matches[0]!.providerId,
      config: modelConfigOverlayFromMatches(matches),
    };
  } catch {
    return { found: false, config: {} };
  }
}
