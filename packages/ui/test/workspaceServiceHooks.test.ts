import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { Event, ProxyChannel } from "@nex/rpc";

/**
 * 可执行 spec：同一组件 undefined → path → other → undefined 时，三个 hook 的调用槽位不变。
 * 无 path 始终返回当前 ServiceProvider 的服务（task 保留既有缓存代理），不改为 base 服务。
 * 状态所有者仍是 ServiceProvider、tab store 和 remote workspace session store；wrapper 不拥有路由状态。
 * identity 优先隔离同路径远端；preferredRemoteSessionId 原样传递；本地 path 使用 base，
 * 旧版无 identity 的 remote tab 才允许 path fallback，远端断连不能回落本机。
 * 顺序：props → 无条件读取 context / workspace 路由 → 按 path 选择 → 既有 task 代理。
 * 环境没有 DOM / react-test-renderer：执行真实源码，仅 mock React 槽位和 store 读取；
 * 不把 SSR 当成 update 验证，也不声称覆盖 React DOM 的订阅提交和卸载生命周期。
 */
type Service = { marker: string };
type Services = {
  nexSessionService: Service;
  nexAgentService: Service;
  nexTaskService: Service;
};
type Target = {
  workspacePath?: string;
  preferredRemoteSessionId?: string | null;
  workspaceIdentity?: string | null;
};
type Tab = {
  id: string;
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
  remoteTarget?: object;
};
type RemoteState = {
  baseServices: Services | null;
  sessionsById: Record<string, { services: Services }>;
  sessionIdByWorkspaceIdentity: Record<string, string>;
  sessionIdByWorkspacePath: Record<string, string>;
};
type TabState = {
  activeTabId: string | null;
  activeWorkspacePath: string | null;
  activeWorkspaceIdentity: string | null;
  tabs: Tab[];
};
type Hook = (path?: string, remoteSessionId?: string | null, identity?: string | null) => Service;

function createServices(marker: string): Services {
  return {
    nexSessionService: { marker: `${marker}:session` },
    nexAgentService: { marker: `${marker}:agent` },
    nexTaskService: { marker: `${marker}:task` },
  };
}

async function createHarness() {
  const contextServices = createServices("context");
  const baseServices = createServices("base");
  const remoteA = createServices("remote-a");
  const remoteB = createServices("remote-b");
  const remoteState: RemoteState = {
    baseServices,
    sessionsById: { a: { services: remoteA }, b: { services: remoteB } },
    sessionIdByWorkspaceIdentity: { "endpoint-a": "a", "endpoint-b": "b" },
    sessionIdByWorkspacePath: { "/shared": "b" },
  };
  const tabState: TabState = {
    activeTabId: null,
    activeWorkspacePath: null,
    activeWorkspaceIdentity: null,
    tabs: [],
  };
  let slots: string[] = [];
  let previousSlots: string[] | undefined;
  const slot = (name: string) => {
    slots.push(name);
  };
  const modules: Record<string, unknown> = {
    react: {
      useMemo: (factory: () => unknown) => {
        slot("useMemo");
        return factory();
      },
    },
    "@nex/rpc": { Event, ProxyChannel },
    "@/hooks/useServices.js": {
      useServices: () => {
        slot("useContext:services");
        return contextServices;
      },
      useOptionalServices: () => {
        slot("useContext:services");
        return contextServices;
      },
    },
    "@/store/TabStoreProvider.js": {
      useTabStore: (selector: (state: TabState) => unknown) => {
        slot("useStore:tabs");
        return selector(tabState);
      },
    },
    "@/store/tabStore.js": { isWorkspaceTab: () => true },
    "@/store/remoteWorkspaceSessionStore.js": {
      useRemoteWorkspaceSessionStore: (selector: (state: RemoteState) => unknown) => {
        slot("useStore:remote");
        return selector(remoteState);
      },
    },
    "@/lib/taskQueryCache.js": {
      buildTaskWorkspaceKey: (path: string, identity?: string) => identity?.trim() || path,
    },
    "@/lib/memoryDiagnostics.js": { uiMemoryDiagnosticsRegistry: { register: () => {} } },
  };
  // 只替换外部读取边界；wrapper、identity resolver、断连代理和 task 缓存代理执行当前源码。
  async function load(relativePath: string) {
    const source = await readFile(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      fileName: relativePath,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports: Record<string, unknown> = {};
    runInNewContext(compiled, {
      exports,
      require: (specifier: string) => {
        assert.ok(specifier in modules, `未声明的测试依赖: ${specifier}`);
        return modules[specifier];
      },
      TextEncoder,
    });
    modules[`@/${relativePath.replace(/\.tsx?$/, ".js")}`] = exports;
    return exports;
  }
  await load("lib/remoteWorkspaceServiceError.ts");
  await load("lib/workspaceServiceResolver.ts");
  await load("hooks/useResolvedRemoteWorkspaceSessionId.ts");
  await load("hooks/useWorkspaceServices.tsx");
  const session = (await load("hooks/useNexSessionService.ts")).useNexSessionService as Hook;
  const agent = (await load("hooks/useNexAgentService.ts")).useNexAgentService as Hook;
  const task = (await load("hooks/useNexTaskService.ts")).useNexTaskService as Hook;

  function Component(target: Target) {
    slot("component:before");
    const args = [
      target.workspacePath,
      target.preferredRemoteSessionId,
      target.workspaceIdentity,
    ] as const;
    const result = [session(...args), agent(...args), task(...args)];
    slot("component:after");
    return result;
  }
  function render(target: Target) {
    slots = [];
    const result = Component(target);
    if (previousSlots) {
      assert.deepEqual(slots, previousSlots, "同一组件更新不能改变 hook 调用槽位");
    }
    previousSlots = [...slots];
    return result;
  }
  function assertServices(result: Service[], expected: Services) {
    assert.equal(result[0], expected.nexSessionService);
    assert.equal(result[1], expected.nexAgentService);
    // task 的既有 wrapper 是缓存 Proxy，不能要求它与 raw service 引用相等。
    assert.equal(result[2].marker, expected.nexTaskService.marker);
  }
  return {
    render,
    assertServices,
    contextServices,
    baseServices,
    remoteA,
    remoteB,
    remoteState,
    tabState,
  };
}

test("三个 hook 在 undefined → path → other → undefined 更新中保持槽位与 context 语义", async () => {
  const h = await createHarness();
  const initial = h.render({});
  h.assertServices(initial, h.contextServices);
  h.assertServices(h.render({ workspacePath: "/local" }), h.baseServices);
  h.assertServices(h.render({ workspacePath: "/other" }), h.baseServices);
  const final = h.render({});
  h.assertServices(final, h.contextServices);
  assert.equal(final[2], initial[2], "task 继续复用原有 service 代理缓存");
  h.remoteState.baseServices = null;
  h.assertServices(h.render({ workspacePath: "/local" }), h.contextServices);
  // 即使当前 tab/显式元数据是远端，无 path 仍使用当前 context，而非 workspace 解析结果。
  h.assertServices(
    h.render({ workspaceIdentity: "missing", preferredRemoteSessionId: "missing" }),
    h.contextServices,
  );
});

test("三个 hook 原样传递 identity / remoteSessionId，同路径不借用其它 endpoint", async () => {
  const h = await createHarness();
  h.assertServices(h.render({}), h.contextServices);
  h.assertServices(
    h.render({ workspacePath: "/shared", workspaceIdentity: " endpoint-a " }),
    h.remoteA,
  );
  h.assertServices(
    h.render({ workspacePath: "/shared", workspaceIdentity: "endpoint-b" }),
    h.remoteB,
  );
  h.assertServices(
    h.render({
      workspacePath: "/shared",
      workspaceIdentity: "endpoint-a",
      preferredRemoteSessionId: "b",
    }),
    h.remoteB,
  );
  h.assertServices(h.render({}), h.contextServices);
});

test("远端断连保留拒绝 RPC / 空事件代理；path fallback 只用于旧远端 tab", async () => {
  const h = await createHarness();
  h.assertServices(h.render({}), h.contextServices);
  const disconnected = h.render({ workspacePath: "/shared", workspaceIdentity: "missing" });
  for (const service of disconnected) {
    const proxy = service as unknown as {
      query: () => Promise<unknown>;
      onAgentRuntimeRestarted: (listener: () => void) => { dispose: () => void };
    };
    await assert.rejects(proxy.query(), { code: "NEX_REMOTE_WORKSPACE_DISCONNECTED" });
    proxy.onAgentRuntimeRestarted(() => assert.fail("断连事件不能发布")).dispose();
  }
  // path 索引有远端绑定，但本地调用不能借用它。
  h.assertServices(h.render({ workspacePath: "/shared" }), h.baseServices);
  h.tabState.tabs = [{ id: "legacy", workspacePath: "/shared", remoteTarget: {} }];
  h.tabState.activeTabId = "legacy";
  h.tabState.activeWorkspacePath = "/shared";
  h.assertServices(h.render({ workspacePath: "/shared" }), h.remoteB);
  delete h.remoteState.sessionsById.b;
  const lost = h.render({ workspacePath: "/shared" });
  for (const service of lost) {
    await assert.rejects((service as unknown as { query: () => Promise<unknown> }).query(), {
      code: "NEX_REMOTE_WORKSPACE_DISCONNECTED",
    });
  }
  h.assertServices(h.render({}), h.contextServices);
});
