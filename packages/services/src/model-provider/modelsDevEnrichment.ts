import type { ModelId } from "@nex/provider";
import type {
  IProviderSettingsService,
  ModelInfoLookupResult,
} from "./providerFacadeServices.js";
import { lookupModelsDevModelInfo } from "./modelsDevCatalog.js";

/**
 * "获取模型信息"装配：给 provider-settings 服务追加 models.dev 手动查询方法。
 *
 * 仅可在 Node 进程使用（依赖 node:fs 磁盘缓存）；浏览器 bundle 只应拿到
 * RPC 描述符与包装后的服务实例。resolveModelConfig 保持纯规则引擎结果，
 * models.dev 只在用户点击"获取模型信息"时按需查询。
 */
export function createProviderSettingsWithModelsDevLookup(
  base: IProviderSettingsService,
): IProviderSettingsService {
  return {
    ...base,
    lookupModelInfo: async (modelId: ModelId): Promise<ModelInfoLookupResult> => {
      const info = await lookupModelsDevModelInfo(modelId);
      return {
        found: info.found,
        ...(info.providerId !== undefined ? { providerId: info.providerId } : {}),
        config: info.config as ModelInfoLookupResult["config"],
      };
    },
  };
}
