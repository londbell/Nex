import {
  Emitter,
  VSBuffer,
  SocketProtocol,
  ChannelClient,
  type IMessagePassingProtocol,
  type ISocket,
} from "@nex/rpc";
import type { IServiceAccessor } from "@nex/services";
import { RemoteServiceAccess } from "./remoteServiceAccess.js";

export interface WebSocketConnectionCloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
}

interface WebSocketConnectionOptions {
  onClose?: (event: WebSocketConnectionCloseEvent) => void;
  onOpenSocket?: (socket: WebSocket) => void;
  createSocket?: (url: string) => WebSocket;
  connectTimeoutMs?: number;
}

export interface WebSocketServiceConnection {
  services: IServiceAccessor;
  dispose: (reason?: Error) => void;
}

function wrapBrowserWebSocket(ws: WebSocket): ISocket {
  const onData = new Emitter<VSBuffer>();
  const onClose = new Emitter<void>();
  const onEnd = new Emitter<void>();
  const receive = (event: MessageEvent) => {
    onData.fire(VSBuffer.wrap(new Uint8Array(event.data as ArrayBuffer)));
  };
  ws.binaryType = "arraybuffer";
  ws.addEventListener("message", receive);
  return {
    onData: onData.event,
    onClose: onClose.event,
    onEnd: onEnd.event,
    write(buffer) {
      // 原因：关闭的 socket 曾静默丢弃 RPC，调用方永远等不到 ACK；由连接所有者同步终结 client。
      if (ws.readyState !== WebSocket.OPEN) throw new Error("WebSocket connection is closed");
      ws.send(buffer.buffer as Uint8Array<ArrayBuffer>);
    },
    end: () => ws.close(),
    drain: () => Promise.resolve(),
    dispose: () => {
      ws.removeEventListener("message", receive);
      onData.dispose();
      onClose.dispose();
      onEnd.dispose();
      ws.close();
    },
  };
}

/** 与 MessagePort 相同的明确生命周期：close/error 先拒绝 RPC，再通知上层恢复。 */
export function createWebSocketServiceConnection(
  wsUrl: string,
  options?: WebSocketConnectionOptions,
): Promise<WebSocketServiceConnection> {
  return new Promise((resolve, reject) => {
    const ws = options?.createSocket?.(wsUrl) ?? new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      finish(
        { code: 1006, reason: "", wasClean: false },
        new Error("WebSocket connection timed out"),
      );
    }, options?.connectTimeoutMs ?? 10_000);
    let disposed = false;
    let opened = false;
    let client: ChannelClient | null = null;
    let protocol: SocketProtocol | null = null;
    let socket: ISocket | null = null;
    function cleanup(reason?: Error) {
      if (disposed) return;
      disposed = true;
      clearTimeout(timeout);
      ws.removeEventListener("open", open);
      ws.removeEventListener("error", error);
      ws.removeEventListener("close", close);
      // SocketProtocol 不传递关闭信号，必须显式释放 ChannelClient 才能 settle 排队/在途 RPC。
      client?.dispose(reason);
      protocol?.dispose();
      if (socket) socket.dispose();
      else ws.close();
    }
    function finish(event: WebSocketConnectionCloseEvent, reason?: Error) {
      if (disposed) return;
      cleanup(reason);
      if (!opened) reject(reason ?? new Error(`WebSocket closed before ready (${event.code})`));
      options?.onClose?.(event);
    }
    function error() {
      finish(
        { code: 1006, reason: "", wasClean: false },
        opened ? undefined : new Error("WebSocket connection failed"),
      );
    }
    function close(event: CloseEvent) {
      finish({ code: event.code, reason: event.reason, wasClean: event.wasClean });
    }
    function open() {
      if (disposed) return;
      opened = true;
      clearTimeout(timeout);
      socket = wrapBrowserWebSocket(ws);
      protocol = new SocketProtocol(socket);
      const activeProtocol = protocol;
      // 即使 readyState 先变、close 事件尚未派发，也不得留下 send 失败后的 pending RPC。
      client = new ChannelClient({
        onMessage: activeProtocol.onMessage,
        send: (buffer) => {
          try {
            activeProtocol.send(buffer);
          } catch {
            finish({ code: 1006, reason: "", wasClean: false });
          }
        },
      });
      const services = new RemoteServiceAccess(client);
      try {
        options?.onOpenSocket?.(ws);
        resolve({ services, dispose: cleanup });
      } catch (cause) {
        const reason = cause instanceof Error ? cause : new Error(String(cause));
        cleanup(reason);
        reject(reason);
        options?.onClose?.({ code: 1006, reason: "", wasClean: false });
      }
    }
    ws.addEventListener("error", error);
    ws.addEventListener("close", close);
    ws.addEventListener("open", open);
  });
}

export async function connectViaWebSocket(
  wsUrl: string,
  options?: WebSocketConnectionOptions,
): Promise<IServiceAccessor> {
  return (await createWebSocketServiceConnection(wsUrl, options)).services;
}

export function connectViaProtocol(protocol: IMessagePassingProtocol): IServiceAccessor {
  const client = new ChannelClient(protocol);
  return new RemoteServiceAccess(client);
}
