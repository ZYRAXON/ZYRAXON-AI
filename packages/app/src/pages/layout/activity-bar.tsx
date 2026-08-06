import { createSignal, For, Show, type Accessor, type JSX } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"

export interface ActivityBarEntry {
  id: string
  icon: string
  label: string
  badge?: number
}

export const ActivityBar = (props: {
  entries: Accessor<ActivityBarEntry[]>
  activeId: Accessor<string | null>
  onSelect: (id: string) => void
}): JSX.Element => {
  return (
    <div
      data-component="activity-bar"
      class="w-12 shrink-0 bg-background-base flex flex-col items-center border-r border-border-base"
    >
      <div class="flex-1 flex flex-col items-center gap-1 pt-2">
        <For each={props.entries()}>
          {(entry) => (
            <ActivityBarIcon
              icon={entry.icon}
              label={entry.label}
              badge={entry.badge}
              active={props.activeId() === entry.id}
              onClick={() => props.onSelect(entry.id)}
            />
          )}
        </For>
      </div>
    </div>
  )
}

function ActivityBarIcon(props: {
  icon: string
  label: string
  badge?: number
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <Tooltip placement="right" value={props.label}>
      <button
        classList={{
          "relative w-10 h-10 flex items-center justify-center rounded-md cursor-pointer transition-colors": true,
          "bg-surface-raised-base hover:bg-surface-raised-base-hover": props.active,
          "hover:bg-surface-raised-base-hover": !props.active,
        }}
        onClick={props.onClick}
        aria-label={props.label}
      >
        <Show when={props.active}>
          <div class="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-text-interactive-base rounded-r" />
        </Show>
        <Show
          when={props.icon.startsWith("<")}
          fallback={
            <span class="text-icon-base text-sm font-medium">
              {props.icon.slice(0, 2).toUpperCase()}
            </span>
          }
        >
          <svg
            viewBox="0 0 20 20"
            class="w-5 h-5 text-icon-base"
            innerHTML={props.icon}
          />
        </Show>
        <Show when={props.badge && props.badge > 0}>
          <div class="absolute -top-0.5 -right-0.5 min-w-4 h-4 flex items-center justify-center rounded-full bg-text-interactive-base text-background-base text-[10px] font-bold px-1">
            {props.badge}
          </div>
        </Show>
      </button>
    </Tooltip>
  )
}
