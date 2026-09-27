/* 二次开发：遥测已彻底关闭，OTLP trace 出口固定为 undefined。
 * 保留 createRendererActionTraceExporter 原签名，供 index.ts 的 broker 装配点使用。 */

type EnvRecord = Record<string, string | undefined>;

export function createRendererActionTraceExporter(_env: EnvRecord): undefined {
  return undefined;
}
