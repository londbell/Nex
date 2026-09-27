interface AppLaunchGateLike {
  consume(): boolean;
}

interface RendererReadyInput {
  rendererId: number;
}

export function createAppLaunchCoordinator(appLaunchGate: AppLaunchGateLike) {
  return {
    onRendererReady({ rendererId }: RendererReadyInput): boolean {
      void rendererId;
      return appLaunchGate.consume();
    },
  };
}
