import { isApiKeyAccess, type ProviderConfigObject } from "@nex/provider";

/**
 * "从 /v1/models 获取"：用供应商已配置的 Base URL、密钥和额外请求头请求
 * `{baseUrl}/models`，解析出模型 ID 列表。
 *
 * 兼容常见响应形态：
 * - OpenAI / Anthropic：`{ data: [{ id }] }`
 * - Gemini：`{ models: [{ name: "models/xxx" }] }`
 * - 部分自建网关：直接返回数组（元素为字符串或对象）
 */

const REMOTE_MODEL_LIST_TIMEOUT_MS = 15_000;
const ANTHROPIC_API_VERSION = "2023-06-01";

export interface RemoteModelList {
  readonly ids: readonly string[];
}

export function buildRemoteModelListRequest(config: ProviderConfigObject): {
  readonly url: string;
  readonly headers: Headers;
} {
  const api = config.api;
  const baseUrl = api?.baseUrl?.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("Provider base URL is not configured");
  // Headers 大小写不敏感，用户自定义的 Authorization / X-Api-Key 不会被默认值重复写入。
  const headers = new Headers(api?.headers ?? undefined);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  const apiKey = isApiKeyAccess(config.access) ? config.access.apiKey?.trim() : undefined;
  if (apiKey) {
    if (api?.type === "anthropic-messages") {
      if (!headers.has("x-api-key")) headers.set("x-api-key", apiKey);
      if (!headers.has("anthropic-version"))
        headers.set("anthropic-version", ANTHROPIC_API_VERSION);
    } else if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${apiKey}`);
    }
  }
  return { url: `${baseUrl}/models`, headers };
}

function modelEntries(payload: unknown): readonly unknown[] {
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== "object" || payload === null) return [];
  const { data, models } = payload as { data?: unknown; models?: unknown };
  if (Array.isArray(data)) return data;
  if (Array.isArray(models)) return models;
  return [];
}

function modelEntryId(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (typeof entry !== "object" || entry === null) return undefined;
  const { id, name } = entry as { id?: unknown; name?: unknown };
  if (typeof id === "string") return id;
  if (typeof name === "string") return name;
  return undefined;
}

/** 解析 /models 响应为去重后的模型 ID；Gemini 的 `models/` 前缀会被去掉。 */
export function parseRemoteModelIds(payload: unknown): string[] {
  const ids = modelEntries(payload)
    .map(modelEntryId)
    .map((id) => id?.trim().replace(/^models\//, ""))
    .filter((id): id is string => Boolean(id));
  return [...new Set(ids)];
}

export async function fetchRemoteModelList(
  config: ProviderConfigObject,
  request: typeof fetch = fetch,
): Promise<RemoteModelList> {
  const { url, headers } = buildRemoteModelListRequest(config);
  const response = await request(url, {
    headers,
    signal: AbortSignal.timeout(REMOTE_MODEL_LIST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Model list request failed: HTTP ${response.status}`);
  return { ids: parseRemoteModelIds(await response.json()) };
}
