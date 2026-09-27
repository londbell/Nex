import type { LaunchMarks } from "@nex/shared";

export function shouldReportLaunchToInput(state: {
  isStartupRenderBlocked: boolean;
  alreadyReported: boolean;
}): boolean {
  // 门禁清除 = RootStartupLoading 退场、输入框挂载。
  return !state.alreadyReported && !state.isStartupRenderBlocked;
}

export function readRendererLaunchTimings(): {
  marks: LaunchMarks | null;
  rendererStart: number;
  reactCommit: number;
} | null {
  const w = window as Window & {
    __NEX_LAUNCH_MARKS__?: LaunchMarks | null;
    __NEX_RENDERER_START__?: number;
    __NEX_REACT_COMMIT_AT__?: number;
  };
  const rendererStart = w.__NEX_RENDERER_START__;
  const reactCommit = w.__NEX_REACT_COMMIT_AT__;
  if (typeof rendererStart !== "number" || typeof reactCommit !== "number") {
    return null;
  }
  return { marks: w.__NEX_LAUNCH_MARKS__ ?? null, rendererStart, reactCommit };
}
