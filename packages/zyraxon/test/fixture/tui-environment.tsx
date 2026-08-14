/** @jsxImportSource @opentui/solid */
import {
  TuiPathsProvider,
  TuiStartupProvider,
  TuiTerminalEnvironmentProvider,
  type TuiPaths,
} from "@zyraxon-ai/tui/context/runtime"
import type { ParentProps } from "solid-js"

export function TestTuiContexts(
  props: ParentProps<{
    cwd?: string
    directory?: string
    paths?: Partial<TuiPaths>
  }>,
) {
  return (
    <TuiPathsProvider
      value={{
        cwd: props.cwd ?? props.directory ?? "/tmp/zyraxon/packages/zyraxon",
        home: "/tmp/zyraxon/home",
        state: "/tmp/zyraxon/state",
        worktree: "/tmp/zyraxon",
        ...props.paths,
      }}
    >
      <TuiTerminalEnvironmentProvider value={{ platform: "linux" }}>
        <TuiStartupProvider value={{ skipInitialLoading: false }}>{props.children}</TuiStartupProvider>
      </TuiTerminalEnvironmentProvider>
    </TuiPathsProvider>
  )
}
