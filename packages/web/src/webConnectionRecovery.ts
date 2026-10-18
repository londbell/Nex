import type { WebSocketServiceConnection } from "@nex/client";

export type WebServiceConnection = WebSocketServiceConnection;
export type WebConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
type Services = WebServiceConnection["services"];

interface WebConnectionRecoveryOptions {
  connect: (onClose: () => void) => Promise<WebServiceConnection>;
  shouldReconnect: () => Promise<boolean>;
  onServices: (services: Services) => void;
  onStateChange: (state: WebConnectionState) => void;
  scheduleRetry?: (retry: () => void, delayMs: number) => () => void;
}

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];
function connectionClosed(): Error {
  const error = new Error("WebSocket connection is closed");
  error.name = "ConnectionClosed";
  return error;
}

/**
 * 普通 Web 的连接代际所有者。断线立即终结旧 RPC；恢复发布新 accessor，交给现有 UI 租约重订阅。
 * 不缓存、不重放业务命令；Desktop continuous / 手机 attachment 的协议与 owner 边界不变。
 */
export function createWebConnectionRecovery(options: WebConnectionRecoveryOptions) {
  let current: WebServiceConnection | null = null;
  let connecting = false;
  let disposed = false;
  let everConnected = false;
  let stopped = false;
  let attempt = 0;
  let cancelRetry: (() => void) | null = null;
  let broadcastSubscription: { dispose(): void } | null = null;
  type Message = Parameters<Services["broadcastService"]["send"]>[0];
  const messageListeners = new Set<(message: Message) => void>();
  const schedule =
    options.scheduleRetry ??
    ((retry, delayMs) => {
      const timer = setTimeout(retry, delayMs);
      return () => clearTimeout(timer);
    });
  const requireServices = () => {
    if (!current) throw connectionClosed();
    return current.services;
  };

  // StoreProvider 和 platform 闭包只创建一次，只有这两类应用级桥保持身份稳定。
  // 其它 service 必须换对象，让 conversation / controller 注册表按现有代际规则重建订阅。
  const broadcast: Services["broadcastService"] = {
    onMessage: (listener) => {
      messageListeners.add(listener);
      return {
        dispose: () => {
          messageListeners.delete(listener);
        },
      };
    },
    send: async (message) => {
      const target = current;
      if (!target) return;
      try {
        await target.services.broadcastService.send(message);
      } catch (error) {
        // 广播不是已接受业务输入；断线丢弃而非在新代重放，避免主题/语言回环。
        if (current === target && !(error instanceof Error && error.name === "ConnectionClosed"))
          throw error;
      }
    },
    acquireClaim: async (key) => requireServices().broadcastService.acquireClaim(key),
    commitClaim: async (lease) => requireServices().broadcastService.commitClaim(lease),
    releaseClaim: async (lease) => requireServices().broadcastService.releaseClaim(lease),
    tryClaim: async (key) => requireServices().broadcastService.tryClaim(key),
  };
  const mcp: Pick<
    Services["mcpSyncService"],
    "loadMcpFromUserDirectory" | "saveMcpToUserDirectory"
  > = {
    loadMcpFromUserDirectory: async (params) =>
      requireServices().mcpSyncService.loadMcpFromUserDirectory(params),
    saveMcpToUserDirectory: async (params) =>
      requireServices().mcpSyncService.saveMcpToUserDirectory(params),
  };

  function detach() {
    broadcastSubscription?.dispose();
    broadcastSubscription = null;
    const previous = current;
    current = null;
    previous?.dispose(connectionClosed());
  }
  function queueRetry() {
    if (disposed || stopped || !everConnected || cancelRetry || connecting) return;
    const delay = RETRY_DELAYS_MS[Math.min(attempt++, RETRY_DELAYS_MS.length - 1)]!;
    cancelRetry = schedule(() => {
      cancelRetry = null;
      void connect(false).catch(() => {});
    }, delay);
  }
  async function connect(initial: boolean): Promise<void> {
    if (disposed || stopped) throw connectionClosed();
    if (connecting || current) return;
    connecting = true;
    let closed = false;
    if (initial) options.onStateChange("connecting");
    try {
      const allowed = initial || (await options.shouldReconnect());
      if (disposed) throw connectionClosed();
      if (!allowed) {
        stopped = true;
        options.onStateChange("disconnected");
        return;
      }
      const next = await options.connect(() => {
        if (closed || disposed) return;
        closed = true;
        detach();
        if (everConnected) {
          options.onStateChange("reconnecting");
          queueRetry();
        }
      });
      if (closed || disposed) {
        next.dispose(connectionClosed());
        throw connectionClosed();
      }
      current = next;
      everConnected = true;
      attempt = 0;
      broadcastSubscription = next.services.broadcastService.onMessage((message) => {
        // 固定本次分发的监听快照，避免 listener 里重绑订阅导致同一消息重复分发。
        if (current === next)
          for (const listener of Array.from(messageListeners)) listener(message);
      });
      options.onServices({ ...next.services, broadcastService: broadcast });
      options.onStateChange("connected");
    } catch (error) {
      if (initial && !disposed) options.onStateChange("disconnected");
      throw error;
    } finally {
      connecting = false;
      if (!current) queueRetry();
    }
  }
  return {
    mcpService: mcp,
    start: () => connect(true),
    retry: () => {
      if (disposed || stopped || connecting || current || !everConnected) return;
      cancelRetry?.();
      cancelRetry = null;
      void connect(false).catch(() => {});
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      cancelRetry?.();
      cancelRetry = null;
      detach();
      messageListeners.clear();
    },
  };
}
