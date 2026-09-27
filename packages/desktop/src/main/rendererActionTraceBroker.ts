/* 二次开发：遥测已彻底关闭，行为 trace broker 只保留原接口的 no-op 实现，
 * enqueue 丢弃、flush/shutdown 立即完成，IPC 与关闭流程无需感知差异。 */

export interface RendererActionTraceBroker {
  enqueue(batch: unknown): boolean;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

export function createRendererActionTraceBroker(_options: {
  exporter: unknown;
  logger: {
    debug(...args: unknown[]): void;
    warn(...args: unknown[]): void;
  };
  shutdownTimeoutMs?: number;
  flushTimeoutMs?: number;
  exportTimeoutMs?: number;
}): RendererActionTraceBroker {
  return {
    enqueue(_batch: unknown): boolean {
      return false;
    },
    async flush(): Promise<void> {},
    async shutdown(): Promise<void> {},
  };
}
