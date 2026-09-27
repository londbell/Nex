import { getNexCopy } from "@nex/i18n";
import type { CommandCenterApp } from "./command-center.js";

export function modelSetupRequiredResponse(locale?: string): string {
  const copy = getNexCopy(locale).tui.modelSetupRequired;
  return [copy.message, copy.help].join("\n");
}

/** Registry already applies provider availability, including personal providers. */
export function createTuiModelAvailabilityChecker(
  getApp: () => Promise<CommandCenterApp>,
): () => Promise<boolean> {
  return async () => {
    const app = await getApp();
    return ((await app.listModels?.()) ?? []).some((model) => !model.disabledReason);
  };
}
