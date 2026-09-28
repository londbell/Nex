import type { NexEnv } from "./env.js";

export const DEFAULT_NEX_ENDPOINT_ORIGIN = "https://zcode.z.ai";
export const DEFAULT_BIGMODEL_API_ORIGIN = "https://bigmodel.cn";

// 构建仅注入公开链接；Node 调用方仍可显式传 env，避免读取另一进程的配置。
declare const __NEX_ENDPOINT_ENV__: Record<string, string | undefined> | undefined;
export function pickProductEndpointEnv(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const keys = ["NEX_BASE_URL", "NEX_ENDPOINT_ORIGIN", "BIGMODEL_API_BASE_URL"];
  return Object.fromEntries(
    keys.flatMap((key) => (env[key]?.trim() ? [[key, env[key]!.trim()]] : [])),
  );
}
export function readProductEndpointEnv(): Record<string, string | undefined> {
  return {
    ...(typeof __NEX_ENDPOINT_ENV__ === "undefined" ? {} : __NEX_ENDPOINT_ENV__),
    ...pickProductEndpointEnv(typeof process === "undefined" ? {} : process.env),
  };
}

export interface NexEndpointUrls {
  origin: string;
  apiBaseUrl: string;
  webShareCallbackUrl: string;
  nexPlanOpenAiBaseUrl: string;
  nexPlanAnthropicBaseUrl: string;
  nexPlanBillingCurrentUrl: string;
  nexPlanBillingBalanceUrl: string;
}

export interface RuntimeNexEndpointEnv {
  [key: string]: string | undefined;
  NEX_ENV?: string;
  NEX_BASE_URL?: string;
  NEX_ENDPOINT_ORIGIN?: string;
}

export interface RuntimeBigModelApiEnv {
  [key: string]: string | undefined;
  NEX_ENV?: string;
  BIGMODEL_API_BASE_URL?: string;
}

function readRuntimeEnvValue(
  env: Record<string, string | undefined>,
  key: string,
): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

export function normalizeNexEndpointOrigin(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Nex endpoint origin is empty");
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Nex endpoint origin must use http or https");
  }
  return parsed.origin;
}

export function resolveNexEndpointOrigin(options?: {
  env?: NexEnv;
  envBaseOrigin?: string | null;
  overrideOrigin?: string | null;
}): string {
  const origin = options?.overrideOrigin?.trim() || options?.envBaseOrigin?.trim();
  return origin ? normalizeNexEndpointOrigin(origin) : DEFAULT_NEX_ENDPOINT_ORIGIN;
}

export function resolveRuntimeNexEnv(
  env: RuntimeNexEndpointEnv = readProductEndpointEnv(),
): NexEnv {
  // 产品身份仅用于既有展示与安装标识，不参与地址解析。
  return env.NEX_ENV?.trim().toLowerCase() === "test" ? "test" : "production";
}

export function resolveRuntimeNexEndpointOrigin(
  env: RuntimeNexEndpointEnv = readProductEndpointEnv(),
  options?: { overrideOrigin?: string | null },
): string {
  return resolveNexEndpointOrigin({
    envBaseOrigin:
      readRuntimeEnvValue(env, "NEX_BASE_URL") ?? readRuntimeEnvValue(env, "NEX_ENDPOINT_ORIGIN"),
    overrideOrigin: options?.overrideOrigin,
  });
}

export function buildRuntimeNexEndpointUrls(
  env: RuntimeNexEndpointEnv = readProductEndpointEnv(),
): NexEndpointUrls {
  return buildNexEndpointUrls(resolveRuntimeNexEndpointOrigin(env));
}

export function buildRuntimeNexApiUrl(
  env: RuntimeNexEndpointEnv = readProductEndpointEnv(),
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveRuntimeNexEndpointOrigin(env)}${normalizedPath}`;
}

export function resolveBigModelApiOrigin(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
): string {
  return normalizeNexEndpointOrigin(
    readRuntimeEnvValue(env, "BIGMODEL_API_BASE_URL") ?? DEFAULT_BIGMODEL_API_ORIGIN,
  );
}

export function buildBigModelApiUrl(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
  path: string,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${resolveBigModelApiOrigin(env)}${normalizedPath}`;
}

export function buildBigModelCodingPlanPersonalManageUrl(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
): string {
  // 管理页与业务 API 共用显式 origin，避免把已登录账号带到另一个部署。
  return buildBigModelApiUrl(env, "/coding-plan/personal/overview");
}

export function buildBigModelCodingPlanTeamManageUrl(
  env: RuntimeBigModelApiEnv = readProductEndpointEnv(),
): string {
  return buildBigModelApiUrl(env, "/coding-plan/team/plans");
}

export function buildNexEndpointUrls(origin: string): NexEndpointUrls {
  const normalizedOrigin = normalizeNexEndpointOrigin(origin);
  return {
    origin: normalizedOrigin,
    apiBaseUrl: `${normalizedOrigin}/api/v1`,
    webShareCallbackUrl: `${normalizedOrigin}/cn/share/callback`,
    nexPlanOpenAiBaseUrl: `${normalizedOrigin}/api/v1/nex-plan`,
    nexPlanAnthropicBaseUrl: `${normalizedOrigin}/api/v1/nex-plan/anthropic`,
    nexPlanBillingCurrentUrl: `${normalizedOrigin}/api/v1/nex-plan/billing/current`,
    nexPlanBillingBalanceUrl: `${normalizedOrigin}/api/v1/nex-plan/billing/balance`,
  };
}

export function rewriteNexEndpointUrl(input: string | URL, endpointOrigin: string): string | URL {
  const originalUrl = typeof input === "string" ? input : input.toString();
  let parsed: URL;
  try {
    parsed = new URL(originalUrl);
  } catch {
    return input;
  }
  const sourceOrigin = DEFAULT_NEX_ENDPOINT_ORIGIN;
  if (parsed.origin !== sourceOrigin) {
    return input;
  }

  const targetOrigin = normalizeNexEndpointOrigin(endpointOrigin);
  if (targetOrigin === sourceOrigin) {
    return input;
  }

  const target = new URL(targetOrigin);
  target.pathname = parsed.pathname;
  target.search = parsed.search;
  target.hash = parsed.hash;
  return target.toString();
}
