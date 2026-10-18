import assert from "node:assert/strict";
import test from "node:test";
import {
  ChannelServer,
  Emitter,
  ProxyChannel,
  SocketProtocol,
  VSBuffer,
  type ISocket,
} from "@nex/rpc";
import { createWebSocketServiceConnection } from "../src/websocket.js";
const createSocket = (url: string) => new FakeWebSocket(url) as unknown as WebSocket;

/** 可执行 spec：socket close/error 必须先终结所有 RPC，再通知 Web owner；新连接不重放旧请求。 */
class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  binaryType = "";
  server: ChannelServer;
  private data = new Emitter<VSBuffer>();
  private closed = new Emitter<void>();
  constructor(_url: string) {
    super();
    const socket: ISocket = {
      onData: this.data.event,
      onClose: this.closed.event,
      onEnd: this.closed.event,
      write: (buffer) =>
        this.dispatchEvent(
          Object.assign(new Event("message"), {
            data: buffer.buffer.buffer.slice(
              buffer.buffer.byteOffset,
              buffer.buffer.byteOffset + buffer.byteLength,
            ),
          }),
        ),
      end: () => {},
      drain: async () => {},
      dispose: () => {},
    };
    this.server = new ChannelServer(new SocketProtocol(socket), "test");
    FakeWebSocket.instances.push(this);
  }
  send(value: Uint8Array) {
    this.data.fire(VSBuffer.wrap(value));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
    this.server.ready();
  }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.dispatchEvent(
      Object.assign(new Event("close"), { code: 1006, reason: "", wasClean: false }),
    );
  }
}

test("断线终结已发出 RPC 和后续调用，回调发生时旧代理已关闭", async () => {
  let notify = 0;
  let pending: Promise<unknown>;
  const opening = createWebSocketServiceConnection("ws://localhost/ws", {
    createSocket,
    onClose: () => {
      notify++;
    },
  });
  const ws = FakeWebSocket.instances.at(-1)!;
  ws.server.registerChannel(
    "system",
    ProxyChannel.fromService({ info: () => new Promise(() => {}) }),
  );
  ws.open();
  const connection = await opening;
  pending = connection.services.systemService.info();
  const rejected = assert.rejects(pending, { name: "ConnectionClosed" });
  ws.close();
  await rejected;
  await assert.rejects(connection.services.systemService.info(), /disposed/);
  assert.equal(notify, 1);
  connection.dispose();
});

test("Initialize 前的排队 RPC 同样终结；error/close 只通知一次", async () => {
  let notify = 0;
  const opening = createWebSocketServiceConnection("ws://localhost/ws", {
    createSocket,
    onClose: () => notify++,
  });
  const ws = FakeWebSocket.instances.at(-1)!;
  ws.readyState = 1;
  ws.dispatchEvent(new Event("open"));
  const connection = await opening;
  const rejected = assert.rejects(connection.services.systemService.info(), {
    name: "ConnectionClosed",
  });
  ws.dispatchEvent(new Event("error"));
  ws.close();
  await rejected;
  assert.equal(notify, 1);
  connection.dispose();
});

test("连接建立前失败不会创建可用服务", async () => {
  const opening = createWebSocketServiceConnection("ws://localhost/ws", { createSocket });
  FakeWebSocket.instances.at(-1)!.dispatchEvent(new Event("error"));
  await assert.rejects(opening, /WebSocket connection failed/);
});

test("readyState 先关闭而 close 事件未到时，发送失败也立即终结 RPC", async () => {
  const opening = createWebSocketServiceConnection("ws://localhost/ws", { createSocket });
  const ws = FakeWebSocket.instances.at(-1)!;
  ws.open();
  const connection = await opening;
  ws.readyState = 3;
  await assert.rejects(connection.services.systemService.info(), { name: "ConnectionClosed" });
  connection.dispose();
});

test("握手无回应有界失败，释放 socket；打开回调抛错同样终结连接", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const opening = createWebSocketServiceConnection("ws://localhost/ws", {
    createSocket,
    connectTimeoutMs: 100,
  });
  const timeoutFailure = assert.rejects(opening, /timed out/);
  t.mock.timers.tick(100);
  await timeoutFailure;
  assert.equal(FakeWebSocket.instances.at(-1)!.readyState, 3);
  const failedCallback = createWebSocketServiceConnection("ws://localhost/ws", {
    createSocket,
    onOpenSocket: () => {
      throw new Error("open callback failure");
    },
  });
  FakeWebSocket.instances.at(-1)!.open();
  await assert.rejects(failedCallback, /open callback failure/);
});
