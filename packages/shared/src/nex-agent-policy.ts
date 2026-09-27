import { z } from "zod";
import type { CommandAgentSource } from "./command-types.js";
import type { NexProvider } from "./nex-task-types-core.js";

export const NEX_AGENT_PROVIDER = "glm" satisfies NexProvider;
export const NEX_AGENT_PROVIDER_LABEL = "Nex Agent";
export const NEX_COMMAND_AGENT_SOURCE = "nexAgent" satisfies CommandAgentSource;

export const nexAgentProviderSchema = z.literal(NEX_AGENT_PROVIDER);

export const NEX_COMMAND_AGENT_SOURCES = [
  NEX_COMMAND_AGENT_SOURCE,
] as const satisfies readonly CommandAgentSource[];

export function normalizeAgentProviderToNexAgent(
  _provider?: NexProvider | null,
): NexProvider {
  return NEX_AGENT_PROVIDER;
}

export function isNexAgentProvider(
  provider: NexProvider | null | undefined,
): provider is typeof NEX_AGENT_PROVIDER {
  return provider === NEX_AGENT_PROVIDER;
}
