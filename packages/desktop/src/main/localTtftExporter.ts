/* 二次开发：遥测已彻底关闭，本地 TTFT 不再构建/导出 OTLP 指标。
 * 保留 createLocalTtftExporter 的原签名，enqueue/shutdown 均为 no-op，
 * IPC 通道（ReportLocalTtftBatch）照常注册但数据直接丢弃。 */

export function createLocalTtftExporter(_options: {
  env: Record<string, string | undefined>;
  now?: () => number;
  version: string;
  logger: { warn(...args: unknown[]): void };
}) {
  return {
    enqueue(_input: unknown): void {},
    async shutdown(): Promise<void> {},
  };
}
