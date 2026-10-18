import assert from "node:assert/strict";
import test from "node:test";
import {
  createWebConnectionRecovery,
  type WebServiceConnection,
} from "../src/webConnectionRecovery.js";

/**
 * 可执行 spec：Web connection recovery 是 socket 代际、重试计时器和当前服务的唯一所有者。
 * 断线 → 旧 RPC fail-closed → 单路退避/鉴权 → 新 accessor → 同实例 UI 重绑并重新订阅。
 * 不重放 RPC / 已接受输入；不改 Host owner/lease、workspace identity 或 Desktop continuous 协议。
 * broadcast / MCP 因应用级闭包保持稳定，其他服务身份换代；草稿和 tab 仍由原 UI store 持有。
 * dispose → 待决鉴权允许 → 不再连接或发布；MCP 非 thenable，缓存方法始终路由当前代。
 * broadcast 丢弃 ConnectionClosed，当前代的其它错误原样抛出；不缓存离线广播。
 */
function harness(shouldReconnect?: () => Promise<boolean>) {
  type Services = WebServiceConnection["services"];
  const attempts: Array<{
    close: () => void;
    resolve: (connection: WebServiceConnection) => void;
    reject: (error: Error) => void;
  }> = [];
  const servicesSeen: Services[] = [];
  const states: string[] = [];
  const sleeps: Array<() => void> = [];
  let allowed = true;
  const recovery = createWebConnectionRecovery({
    connect: (onClose) =>
      new Promise((resolve, reject) => {
        attempts.push({ close: onClose, resolve, reject });
      }),
    shouldReconnect: shouldReconnect ?? (async () => allowed),
    onServices: (services) => servicesSeen.push(services),
    onStateChange: (state) => states.push(state),
    scheduleRetry: (retry) => {
      sleeps.push(retry);
      return () => {
        const i = sleeps.indexOf(retry);
        if (i !== -1) sleeps.splice(i, 1);
      };
    },
  });
  const connection = (marker: string) => {
    type Message = Parameters<Services["broadcastService"]["send"]>[0];
    const listeners = new Set<(message: Message) => void>();
    const messages = {
      fire: (message: Message) => {
        for (const listener of listeners) listener(message);
      },
    };
    const calls: string[] = [];
    let disposed = false;
    const broadcast = {
      onMessage: (listener: (message: Message) => void) => {
        listeners.add(listener);
        return {
          dispose: () => {
            listeners.delete(listener);
          },
        };
      },
      send: async () => {
        calls.push(marker);
      },
      acquireClaim: async () => ({ status: "unavailable" as const }),
      commitClaim: async () => {},
      releaseClaim: async () => {},
      tryClaim: async () => false,
    };
    const raw = {
      broadcastService: broadcast,
      nexAgentService: { marker },
      mcpSyncService: { loadMcpFromUserDirectory: async () => marker },
    } as unknown as Services;
    return {
      services: raw,
      dispose: () => {
        disposed = true;
      },
      messages,
      calls,
      isDisposed: () => disposed,
    };
  };
  return {
    recovery,
    attempts,
    servicesSeen,
    states,
    sleeps,
    connection,
    disallow: () => {
      allowed = false;
    },
  };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("断线后单路重连，新服务换代而 broadcast/MCP 继续工作，不重放调用", async () => {
  const h = harness();
  const opening = h.recovery.start();
  const first = h.connection("first");
  h.attempts[0]!.resolve(first);
  await opening;
  const oldServices = h.servicesSeen[0]!;
  const received: unknown[] = [];
  const listener = oldServices.broadcastService.onMessage((message) => received.push(message));
  await oldServices.broadcastService.send({ channel: "test", payload: null });
  h.attempts[0]!.close();
  h.attempts[0]!.close();
  await flush();
  assert.equal(first.isDisposed(), true);
  assert.equal(h.sleeps.length, 1);
  await assert.rejects(h.recovery.mcpService.loadMcpFromUserDirectory({}), {
    name: "ConnectionClosed",
  });
  h.sleeps.shift()!();
  await flush();
  const second = h.connection("second");
  h.attempts[1]!.resolve(second);
  await flush();
  const newServices = h.servicesSeen[1]!;
  assert.notEqual(oldServices.nexAgentService, newServices.nexAgentService);
  assert.equal(oldServices.broadcastService, newServices.broadcastService);
  assert.notEqual(oldServices.mcpSyncService, newServices.mcpSyncService);
  second.messages.fire({ channel: "new", payload: null });
  first.messages.fire({ channel: "stale", payload: null });
  assert.deepEqual(received, [{ channel: "new", payload: null }]);
  await oldServices.broadcastService.send({ channel: "test", payload: null });
  assert.deepEqual(first.calls, ["first"]);
  assert.deepEqual(second.calls, ["second"]);
  assert.deepEqual(h.states, ["connecting", "connected", "reconnecting", "connected"]);
  listener.dispose();
  h.recovery.dispose();
});

test("重试失败继续退避；手动重试取消等待且不建立并发连接", async () => {
  const h = harness();
  const opening = h.recovery.start();
  h.attempts[0]!.resolve(h.connection("first"));
  await opening;
  h.attempts[0]!.close();
  await flush();
  h.recovery.retry();
  h.recovery.retry();
  await flush();
  assert.equal(h.sleeps.length, 0);
  assert.equal(h.attempts.length, 2);
  h.attempts[1]!.reject(new Error("offline"));
  await flush();
  assert.equal(h.sleeps.length, 1);
  h.recovery.dispose();
  assert.equal(h.sleeps.length, 0);
});

test("明确未登录时停止重连；dispose 后迟到成功不能覆盖新状态", async () => {
  const h = harness();
  const opening = h.recovery.start();
  h.attempts[0]!.resolve(h.connection("first"));
  await opening;
  h.disallow();
  h.attempts[0]!.close();
  await flush();
  h.sleeps.shift()!();
  await flush();
  assert.equal(h.attempts.length, 1);
  assert.equal(h.states.at(-1), "disconnected");
  h.recovery.dispose();

  const other = harness();
  const pending = other.recovery.start();
  other.recovery.dispose();
  const late = other.connection("late");
  other.attempts[0]!.resolve(late);
  await assert.rejects(pending, { name: "ConnectionClosed" });
  assert.equal(late.isDisposed(), true);
  assert.equal(other.servicesSeen.length, 0);
});

test("首连失败交给原启动错误，不开始后台重试；ACK 前关闭不能发布已死服务", async () => {
  const h = harness();
  const opening = h.recovery.start();
  h.attempts[0]!.reject(new Error("initial failure"));
  await assert.rejects(opening, /initial failure/);
  assert.equal(h.sleeps.length, 0);
  h.recovery.dispose();

  const early = harness();
  const pending = early.recovery.start();
  early.attempts[0]!.close();
  const dead = early.connection("dead");
  early.attempts[0]!.resolve(dead);
  await assert.rejects(pending, { name: "ConnectionClosed" });
  assert.equal(dead.isDisposed(), true);
  assert.equal(early.servicesSeen.length, 0);
  early.recovery.dispose();
});

test("shouldReconnect 待决期间 dispose，迟到允许不能再连接或发布服务", async (t) => {
  let allow!: (allowed: boolean) => void;
  let checks = 0;
  const permission = new Promise<boolean>((resolve) => {
    allow = resolve;
  });
  const h = harness(() => {
    checks++;
    return permission;
  });
  t.after(() => h.recovery.dispose());
  const opening = h.recovery.start();
  const first = h.connection("first");
  h.attempts[0]!.resolve(first);
  await opening;
  h.attempts[0]!.close();
  h.sleeps.shift()!();
  assert.equal(checks, 1);
  assert.equal(h.attempts.length, 1);
  h.recovery.dispose();
  const statesAtDispose = [...h.states];
  allow(true);
  await flush();
  h.recovery.retry();
  assert.equal(first.isDisposed(), true);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.servicesSeen.length, 1);
  assert.equal(h.sleeps.length, 0);
  assert.deepEqual(h.states, statesAtDispose);
});

test("MCP 非 thenable、Symbol 无方法，缓存方法跨断线保持身份并调用新代", async (t) => {
  const h = harness();
  t.after(() => h.recovery.dispose());
  const opening = h.recovery.start();
  h.attempts[0]!.resolve(h.connection("first"));
  await opening;
  const mcp = h.recovery.mcpService;
  const load = mcp.loadMcpFromUserDirectory;
  assert.equal(Reflect.get(mcp, "then"), undefined);
  assert.equal(Reflect.get(mcp, Symbol.toStringTag), undefined);
  assert.equal(Reflect.get(mcp, Symbol.iterator), undefined);
  assert.equal(await Promise.resolve(mcp), mcp);
  assert.equal(mcp.loadMcpFromUserDirectory, load);
  assert.equal(await load({}), "first");
  h.attempts[0]!.close();
  await assert.rejects(load({}), { name: "ConnectionClosed" });
  assert.equal(mcp.loadMcpFromUserDirectory, load);
  h.sleeps.shift()!();
  await flush();
  h.attempts[1]!.resolve(h.connection("second"));
  await flush();
  assert.notEqual(h.servicesSeen[1]!.mcpSyncService, mcp);
  assert.equal(h.recovery.mcpService.loadMcpFromUserDirectory, load);
  assert.equal(await load({}), "second");
  assert.equal(await Promise.resolve(mcp), mcp);
});

test("broadcast 丢弃 ConnectionClosed 与离线发送，当前代其它错误原样抛出", async (t) => {
  const h = harness();
  t.after(() => h.recovery.dispose());
  const opening = h.recovery.start();
  const first = h.connection("first");
  h.attempts[0]!.resolve(first);
  await opening;
  const broadcast = h.servicesSeen[0]!.broadcastService;
  const message = { channel: "regression", payload: null };
  let sends = 0;
  const closed = Object.assign(new Error("test connection closed"), { name: "ConnectionClosed" });
  let failure: unknown = closed;
  first.services.broadcastService.send = async () => {
    sends++;
    throw failure;
  };
  await broadcast.send(message);
  const other = new Error("test broadcast failure");
  failure = other;
  await assert.rejects(broadcast.send(message), (error: unknown) => error === other);
  failure = "test non-Error failure";
  await assert.rejects(broadcast.send(message), (error: unknown) => error === failure);
  assert.equal(sends, 3);
  h.attempts[0]!.close();
  await broadcast.send(message);
  assert.equal(sends, 3);
  h.sleeps.shift()!();
  await flush();
  const second = h.connection("second");
  h.attempts[1]!.resolve(second);
  await flush();
  assert.deepEqual(second.calls, []);
  await broadcast.send(message);
  assert.deepEqual(second.calls, ["second"]);
});
