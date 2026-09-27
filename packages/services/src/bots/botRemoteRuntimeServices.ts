import {
  ChannelClient,
  MessagePortProtocol,
  ProxyChannel,
  type MessagePortLike,
  type MessagePortPayload,
} from "@nex/rpc";
import {
  INexTaskService,
  type INexTaskService as INexTaskServiceShape,
} from "#src/session/nexTaskService.js";
import {
  INexAgentService,
  type INexAgentService as INexAgentServiceShape,
} from "#src/nex-agent/nexAgent.js";
import {
  INexSessionService,
  type INexSessionService as INexSessionServiceShape,
} from "#src/nex-session/nexSession.js";
import {
  IModelSelectionService,
  type IModelSelectionService as IModelSelectionServiceShape,
} from "#src/model-provider/providerFacadeServices.js";

interface PortLike {
  on?(event: "message", listener: (event: { data: MessagePortPayload }) => void): void;
  off?(event: "message", listener: (event: { data: MessagePortPayload }) => void): void;
  addEventListener?(
    event: "message",
    listener: (event: { data: MessagePortPayload }) => void,
  ): void;
  removeEventListener?(
    event: "message",
    listener: (event: { data: MessagePortPayload }) => void,
  ): void;
  postMessage(message: MessagePortPayload): void;
  start?(): void;
  close?(): void;
}

function toMessagePortLike(port: PortLike): MessagePortLike {
  return {
    addEventListener(type, listener) {
      if (port.addEventListener) {
        port.addEventListener(type, listener);
        return;
      }
      port.on?.(type, listener);
    },
    removeEventListener(type, listener) {
      if (port.removeEventListener) {
        port.removeEventListener(type, listener);
        return;
      }
      port.off?.(type, listener);
    },
    postMessage(data) {
      port.postMessage(data);
    },
    start() {
      port.start?.();
    },
    close() {
      port.close?.();
    },
  };
}

export interface RemoteBotWorkspaceRuntimeServices {
  nexAgentService: INexAgentServiceShape;
  nexTaskService: INexTaskServiceShape;
  nexSessionService: INexSessionServiceShape;
  modelSelectionService: IModelSelectionServiceShape;
}

export function createRemoteRuntimeServicesFromPort(
  port: unknown,
): RemoteBotWorkspaceRuntimeServices {
  const protocol = new MessagePortProtocol(toMessagePortLike(port as PortLike));
  const client = new ChannelClient(protocol);
  return {
    nexAgentService: ProxyChannel.toService<INexAgentServiceShape>(
      client.getChannel(INexAgentService.channelName),
    ),
    nexTaskService: ProxyChannel.toService<INexTaskServiceShape>(
      client.getChannel(INexTaskService.channelName),
    ),
    nexSessionService: ProxyChannel.toService<INexSessionServiceShape>(
      client.getChannel(INexSessionService.channelName),
    ),
    modelSelectionService: ProxyChannel.toService<IModelSelectionServiceShape>(
      client.getChannel(IModelSelectionService.channelName),
    ),
  };
}
