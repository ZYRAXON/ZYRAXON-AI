import { createEffect, createMemo, createSignal, For, onMount, Show, onCleanup, type Accessor, type JSX } from "solid-js"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  type DragEvent,
} from "@thisbeyond/solid-dnd"
import { ConstrainDragXAxis } from "@/utils/solid-dnd"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { type LocalProject } from "@/context/layout"

interface SidebarExtension {
  id: string
  name: string
  displayName: string
  icon?: string
  isActive: boolean
}

export const SidebarContent = (props: {
  mobile?: boolean
  opened: Accessor<boolean>
  aimMove: (event: MouseEvent) => void
  projects: Accessor<LocalProject[]>
  renderProject: (project: LocalProject) => JSX.Element
  handleDragStart: (event: unknown) => void
  handleDragEnd: () => void
  handleDragOver: (event: DragEvent) => void
  openProjectLabel: JSX.Element
  openProjectKeybind: Accessor<string | undefined>
  onOpenProject: () => void
  renderProjectOverlay: () => JSX.Element
  settingsLabel: Accessor<string>
  settingsKeybind: Accessor<string | undefined>
  onOpenSettings: () => void
  helpLabel: Accessor<string>
  onOpenHelp: () => void
  renderPanel: () => JSX.Element
}): JSX.Element => {
  const expanded = createMemo(() => !!props.mobile || props.opened())
  const placement = () => (props.mobile ? "bottom" : "right")
  const [activeExtensions, setActiveExtensions] = createSignal<SidebarExtension[]>([])
  const [selectedExt, setSelectedExt] = createSignal<string | null>(null)
  let panel: HTMLDivElement | undefined

  createEffect(() => {
    const el = panel
    if (!el) return
    if (expanded()) {
      el.removeAttribute("inert")
      return
    }
    el.setAttribute("inert", "")
  })

  const generateFallbackIcon = (id: string, name: string): string => {
    const initials = (name || id).slice(0, 2).toUpperCase()
    const hash = Array.from(id).reduce((h, c) => c.charCodeAt(0) + ((h << 5) - h), 0)
    const hue = Math.abs(hash) % 360
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="hsl(${hue},65%,45%)"/><text x="32" y="32" dy=".1em" text-anchor="middle" dominant-baseline="central" fill="white" font-family="system-ui,sans-serif" font-size="22" font-weight="600">${initials}</text></svg>`
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }

  const loadExtensions = async () => {
    const api = (window as any).api

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const merged = new Map<string, SidebarExtension>()

        // Source 1: extensionHost.getExtensions() — filesystem scan, base64 icons
        if (api?.extensionHost?.getExtensions) {
          try {
            const hostList: any[] = await api.extensionHost.getExtensions() ?? []
            for (const ext of hostList) {
              if (ext.isActive) {
                merged.set(ext.id, {
                  id: ext.id,
                  name: ext.name || ext.id.split(".").pop() || ext.id,
                  displayName: ext.displayName || ext.id,
                  icon: ext.icon || "",
                  isActive: true,
                })
              }
            }
          } catch {}
        }

        // Source 2: getInstalledExtensions() — installed.json manifest
        // installed.json may use short IDs (e.g. "marscode-extension")
        // while scanner uses full IDs (e.g. "MarsCode.marscode-extension")
        // Match by checking if full ID ends with ".<shortId>" or equals shortId
        if (api?.getInstalledExtensions) {
          try {
            const manifestList: any[] = await api.getInstalledExtensions() ?? []
            for (const ext of manifestList) {
              if (ext.status !== "active") continue
              const shortId = ext.id
              // Find matching entry in merged by full ID
              let matchedKey: string | undefined
              for (const [key] of merged) {
                if (key === shortId || key.endsWith(`.${shortId}`) || key.includes(shortId)) {
                  matchedKey = key
                  break
                }
              }
              if (matchedKey) {
                // Ensure icon is filled (prefer base64 from scanner, fallback to manifest)
                const existing = merged.get(matchedKey)!
                if (!existing.icon && ext.icon) {
                  existing.icon = ext.icon
                }
              } else {
                // New entry not found in scanner — add with fallback icon
                const icon = ext.icon || generateFallbackIcon(shortId, ext.displayName || shortId)
                merged.set(shortId, {
                  id: shortId,
                  name: shortId,
                  displayName: ext.displayName || shortId,
                  icon,
                  isActive: true,
                })
              }
            }
          } catch {}
        }

        // Generate fallback icons for any extensions still missing icons
        for (const [key, ext] of merged) {
          if (!ext.icon) {
            ext.icon = generateFallbackIcon(key, ext.displayName)
          }
        }

        if (merged.size > 0) {
          setActiveExtensions(Array.from(merged.values()))
          return
        }
      } catch {}
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  onMount(() => { loadExtensions() })

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase()

  const getAvatarColor = (id: string) => {
    const colors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
      "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
    ]
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  return (
    <div class="flex h-full w-full min-w-0 overflow-hidden">
      <div
        data-component="sidebar-rail"
        class="w-16 shrink-0 bg-background-base flex flex-col items-center overflow-hidden"
        onMouseMove={props.aimMove}
      >
        <div class="flex-1 min-h-0 w-full">
          <DragDropProvider
            onDragStart={props.handleDragStart}
            onDragEnd={props.handleDragEnd}
            onDragOver={props.handleDragOver}
            collisionDetector={closestCenter}
          >
            <DragDropSensors />
            <ConstrainDragXAxis />
            <div class="h-full w-full flex flex-col items-center gap-3 px-3 py-3 overflow-y-auto no-scrollbar">
              <SortableProvider ids={props.projects().map((p) => p.worktree)}>
                <For each={props.projects()}>{(project) => props.renderProject(project)}</For>
              </SortableProvider>

              {/* Active Extension Icons */}
              <Show when={activeExtensions().length > 0}>
                <div class="w-8 h-px bg-border-base my-1" />
                <For each={activeExtensions()}>
                  {(ext) => (
                    <Tooltip placement={placement()} value={ext.displayName}>
                      <button
                        classList={{
                          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-all": true,
                          "ring-2 ring-text-interactive-base ring-offset-1 ring-offset-background-base": selectedExt() === ext.id,
                          "hover:bg-surface-raised-base-hover": selectedExt() !== ext.id,
                        }}
                        onClick={() => setSelectedExt(selectedExt() === ext.id ? null : ext.id)}
                        aria-label={ext.displayName}
                      >
                        <Show
                          when={ext.icon}
                          fallback={
                            <span class={`w-8 h-8 rounded-md flex items-center justify-center text-12-semibold text-white ${getAvatarColor(ext.id)}`}>
                              {getInitials(ext.displayName)}
                            </span>
                          }
                        >
                          <img
                            src={ext.icon}
                            class="w-8 h-8 rounded-md"
                            alt=""
                            onError={(e) => {
                              const img = e.currentTarget
                              img.style.display = "none"
                              const fallback = document.createElement("span")
                              fallback.className = `w-8 h-8 rounded-md flex items-center justify-center text-12-semibold text-white ${getAvatarColor(ext.id)}`
                              fallback.textContent = getInitials(ext.displayName)
                              img.parentElement?.appendChild(fallback)
                            }}
                          />
                        </Show>
                      </button>
                    </Tooltip>
                  )}
                </For>
              </Show>

              <Tooltip
                placement={placement()}
                value={
                  <div class="flex items-center gap-2">
                    <span>{props.openProjectLabel}</span>
                    <Show when={!props.mobile && !!props.openProjectKeybind()}>
                      <span class="text-icon-base text-12-medium">{props.openProjectKeybind()}</span>
                    </Show>
                  </div>
                }
              >
                <IconButton
                  icon="plus"
                  variant="ghost"
                  size="large"
                  onClick={props.onOpenProject}
                  aria-label={typeof props.openProjectLabel === "string" ? props.openProjectLabel : undefined}
                />
              </Tooltip>
            </div>
            <DragOverlay>{props.renderProjectOverlay()}</DragOverlay>
          </DragDropProvider>
        </div>
        <div class="shrink-0 w-full pt-3 pb-6 flex flex-col items-center gap-2">
          <TooltipKeybind placement={placement()} title={props.settingsLabel()} keybind={props.settingsKeybind() ?? ""}>
            <IconButton
              icon="settings-gear"
              variant="ghost"
              size="large"
              onClick={props.onOpenSettings}
              aria-label={props.settingsLabel()}
            />
          </TooltipKeybind>
          <Tooltip placement={placement()} value={props.helpLabel()}>
            <IconButton
              icon="help"
              variant="ghost"
              size="large"
              onClick={props.onOpenHelp}
              aria-label={props.helpLabel()}
            />
          </Tooltip>
        </div>
      </div>

      <div
        ref={(el) => {
          panel = el
        }}
        classList={{ "flex-1 flex h-full min-h-0 min-w-0 overflow-hidden": true, "pointer-events-none": !expanded() }}
        aria-hidden={!expanded()}
      >
        {props.renderPanel()}
      </div>
    </div>
  )
}
