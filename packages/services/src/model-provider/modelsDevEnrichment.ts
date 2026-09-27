import type { ModelConfigResolution, ResolveModelConfigInput } from "@nex/provider";
import type { IProviderSettingsService } from "./providerFacadeServices.js";
import { lookupModelsDevOverlay, mergeModelConfigData } from "./modelsDevCatalog.js";

/**
 * "填入模型信息"装配：在 server 侧给 provider-settings 服务的模型配置解析
 * 叠加 models.dev 目录命中结果。
 *
 * 仅可在 Node 进程使用（依赖 node:fs 磁盘缓存）；浏览器 bundle 只应拿到
 * RPC 描述符与包装后的服务实例。
 */
export function createModelsDevEnrichedProviderSettingsService(
  base: IProviderSettingsService,
): IProviderSettingsService {
  return {
    ...base,
    resolveModelConfig: async (input: ResolveModelConfigInput): Promise<ModelConfigResolution> => {
      const resolution = await base.resolveModelConfig(input);
      // models.dev 命中条目覆盖占位基线（内建通配推荐）；查找或网络失败
      // 都退回规则引擎结果，不阻塞编辑器。
      try {
        const overlay = await lookupModelsDevOverlay(input.modelId);
        if (!overlay) return resolution;
        return {
          ...resolution,
          inheritedConfig: mergeModelConfigData(resolution.inheritedConfig, overlay),
          // 无个人草稿路径下 effectiveConfig 就是占位基线的完整视图，一并覆盖。
          effectiveConfig:
            "personalConfig" in input
              ? resolution.effectiveConfig
              : mergeModelConfigData(resolution.effectiveConfig, overlay),
        };
      } catch {
        return resolution;
      }
    },
  };
}
