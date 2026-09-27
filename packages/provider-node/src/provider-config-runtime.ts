import {
  ProviderConfigService,
  type ProviderConfigLayerSnapshot,
  type ProviderConfigLayerUpdate,
} from "@nex/provider";
import { NodeNexBuiltinProviderConfigSource } from "./nex-builtin-provider-config-source.js";
import {
  NodePersonalProviderConfigRepository,
  type PersonalProviderConfigRecoveryEvent,
} from "./personal-provider-config-repository.js";

export interface NodeProviderConfigRuntimeOptions {
  readonly nexBuiltinFilePath: string;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly importLegacy?: (
    nexBuiltin: ProviderConfigLayerSnapshot,
  ) => Promise<ProviderConfigLayerUpdate | null>;
  readonly watch?: boolean;
}

/**
 * 组装一个 Node.js 进程内共享的 Nex Built-in/Personal Config 运行边界。
 *
 * Built-in 只读构建期嵌入的 bundled 配置；远端刷新与运行时缓存已随
 * zcode 控制面依赖一并移除，模型信息补充由 models.dev 目录承担。
 */
export class NodeProviderConfigRuntime {
  readonly configService: ProviderConfigService;
  readonly #nexBuiltinSource: NodeNexBuiltinProviderConfigSource;
  readonly #personalRepository: NodePersonalProviderConfigRepository;
  #startPromise: Promise<void> | null = null;
  #disposed = false;

  constructor(options: NodeProviderConfigRuntimeOptions) {
    this.#nexBuiltinSource = new NodeNexBuiltinProviderConfigSource({
      bundledFilePath: options.nexBuiltinFilePath,
      watch: options.watch,
    });
    this.#personalRepository = new NodePersonalProviderConfigRepository({
      filePath: options.personalFilePath,
      onRecovery: options.onPersonalConfigRecovery,
      onPollingError: options.onPersonalConfigPollingError,
      pollingIntervalMs: options.personalPollingIntervalMs,
      ...(options.importLegacy
        ? {
            importLegacy: async () => options.importLegacy!(await this.#nexBuiltinSource.read()),
          }
        : {}),
    });
    this.configService = new ProviderConfigService({
      nexBuiltinSource: this.#nexBuiltinSource,
      personalRepository: this.#personalRepository,
    });
  }

  resolveNexBuiltinActiveFilePath(): Promise<string> {
    return Promise.resolve(this.#nexBuiltinSource.activeFilePath);
  }

  get personalRepository(): import("@nex/provider").PersonalProviderConfigRepository {
    return this.#personalRepository;
  }

  start(): Promise<void> {
    if (this.#disposed) throw new Error("NodeProviderConfigRuntime 已 dispose");
    if (this.#startPromise) return this.#startPromise;
    const startPromise = this.configService.read().then(() => undefined);
    this.#startPromise = startPromise;
    void startPromise.catch(() => {
      if (this.#startPromise === startPromise) this.#startPromise = null;
    });
    return startPromise;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.configService.dispose();
    this.#personalRepository.dispose();
    this.#nexBuiltinSource.dispose();
  }
}

export function createNodeProviderConfigRuntime(
  options: NodeProviderConfigRuntimeOptions,
): NodeProviderConfigRuntime {
  return new NodeProviderConfigRuntime(options);
}
