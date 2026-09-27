/* 二次开发：遥测依赖 @arms/rum-electron 已移除。
 * 保留同名 no-op 接口，让既有上报器调用点（稳定性/资源/网络/MCP 等埋点）无需改动即可编译；
 * 总开关 NEX_TELEMETRY_ENABLED=false 下所有调用本就是空转，这里只是把空转固化到本地。 */

interface ArmsRumStubClient {
  useReporter: (reporter: unknown) => unknown;
}

interface ArmsRumStub {
  init: (config: unknown) => Promise<unknown>;
  setConfig: (key: string, value: unknown) => void;
  getConfig: () => { env: string };
  sendCustom: (event: unknown) => void;
  sendEvent: (event: unknown) => void;
  client: ArmsRumStubClient;
}

const armsRum: ArmsRumStub = {
  init: async () => ({}),
  setConfig: () => {},
  getConfig: () => ({ env: "local" }),
  sendCustom: () => {},
  sendEvent: () => {},
  client: {
    useReporter: (reporter: unknown) => reporter,
  },
};

export default armsRum;
