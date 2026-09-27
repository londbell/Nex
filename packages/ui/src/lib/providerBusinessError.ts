/**
 * nex-plan / provider 业务错误码与前端处理约定。
 *
 * | 场景           | code | HTTP | 前端处理 |
 * |----------------|------|------|----------|
 * | 配额不足       | 1005 | 200  | 禁用入口，刷新配额 |
 * | 模型不可用     | 3006 | 400  | 切换到 Built-in Provider 中的其他模型 |
 * | 参数错误       | 3001 | 400  | 检查请求体 |
 * | 安全校验拒绝   | 3007 | 403  | 客户端无法完成安全校验，提示联系支持 |
 * | 请求过频       | 3002/429 | 429 | 限流提示，稍后重试 |
 * | 上游 HTTP 异常 | 2007 | 500  | 可重试；刷新配额，勿本地扣额度 |
 */

const PROVIDER_BUSINESS_ERROR_CODES = [
  "1005",
  "3006",
  "3001",
  "3007",
  "3002",
  "2007",
  "429",
] as const;

type ProviderBusinessErrorCode = (typeof PROVIDER_BUSINESS_ERROR_CODES)[number];

export type ProviderBusinessErrorUiAction = "refresh-quota" | "switch-model" | "retry-later";

const PROVIDER_BUSINESS_ERROR_MESSAGE_IDS: Record<ProviderBusinessErrorCode, string> = {
  "1005": "nex.error.providerBusiness.1005",
  "3006": "nex.error.providerBusiness.3006",
  "3002": "nex.error.providerBusiness.3002",
  "3001": "nex.error.providerBusiness.3001",
  "3007": "nex.error.providerBusiness.3007",
  "2007": "nex.error.providerBusiness.2007",
  "429": "nex.error.providerBusiness.429",
};

const PROVIDER_BUSINESS_ERROR_UI_ACTIONS: Record<
  ProviderBusinessErrorCode,
  ProviderBusinessErrorUiAction | null
> = {
  "1005": "refresh-quota",
  "3006": "switch-model",
  "3001": null,
  // 3007 安全校验拒绝：客户端无法完成安全校验，没有可执行的恢复动作。
  "3007": null,
  "3002": "retry-later",
  "2007": "retry-later",
  "429": "retry-later",
};

export function isProviderBusinessErrorCode(
  code: string | undefined,
): code is ProviderBusinessErrorCode {
  if (!code) {
    return false;
  }
  return (PROVIDER_BUSINESS_ERROR_CODES as readonly string[]).includes(code);
}

export function getProviderBusinessErrorMessageId(code: string | undefined): string | undefined {
  if (!isProviderBusinessErrorCode(code)) {
    return undefined;
  }
  return PROVIDER_BUSINESS_ERROR_MESSAGE_IDS[code];
}

export function getProviderBusinessErrorUiAction(
  code: string | undefined,
): ProviderBusinessErrorUiAction | null {
  if (!isProviderBusinessErrorCode(code)) {
    return null;
  }
  return PROVIDER_BUSINESS_ERROR_UI_ACTIONS[code];
}

/** 与 core `model-errors.ts` 中 anomaly guard 文案保持一致。 */
export const SUSPICIOUS_EMPTY_MODEL_RESULT_MESSAGE =
  "Model returned no text, no tool calls, and no usage before completing the turn.";

export function isSuspiciousEmptyModelResultMessage(message: string | undefined): boolean {
  if (!message) {
    return false;
  }

  return (
    message.includes(SUSPICIOUS_EMPTY_MODEL_RESULT_MESSAGE) ||
    message.includes("Model returned no text")
  );
}
