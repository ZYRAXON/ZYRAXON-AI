import { For, Match, Show, Switch, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { DragDropProvider as DndKitProvider, PointerSensor } from "@dnd-kit/solid"
import { isSortable } from "@dnd-kit/solid/sortable"
import { Accessibility, AutoScroller, Feedback, PointerActivationConstraints } from "@dnd-kit/dom"
import { RestrictToHorizontalAxis } from "@dnd-kit/abstract/modifiers"
import { RestrictToElement } from "@dnd-kit/dom/modifiers"
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  type DragEvent,
} from "@thisbeyond/solid-dnd"
import { Tabs } from "@zyraxon-ai/ui/tabs"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { Icon } from "@zyraxon-ai/ui/icon"
import { TooltipKeybind } from "@zyraxon-ai/ui/tooltip"
import { ResizeHandle } from "@zyraxon-ai/ui/resize-handle"
import { Mark } from "@zyraxon-ai/ui/logo"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { KeybindV2 } from "@zyraxon-ai/ui/v2/keybind-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"
import type { SnapshotFileDiff, VcsFileDiff } from "@zyraxon-ai/sdk/v2"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import { useDialog } from "@zyraxon-ai/ui/context/dialog"

import FileTree from "@/components/file-tree"
import { normalizeFileTreeV2Path } from "@/components/file-tree-v2-model"
import { SessionContextUsage } from "@/components/session-context-usage"

const reviewTabID = "session-side-panel-review-tab"
const reviewTabPanelID = "session-side-panel-review-tabpanel"
const fileBrowserTabPanelID = "session-side-panel-file-browser-tabpanel"
import { SessionContextTab, SortableTab, SortableTabV2, FileVisual } from "@/components/session"
import { OpenInAppV2 } from "@/components/session/open-in-app-v2"
import { useCommand } from "@/context/command"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import { createFileTabListSync } from "@/pages/session/file-tab-scroll"
import { FileTabContent } from "@/pages/session/file-tabs"
import {
  SESSION_OPEN_FILE_TAB,
  createOpenSessionFileTab,
  createSessionTabs,
  getTabReorderIndex,
  shouldShowFileTree,
  type Sizing,
} from "@/pages/session/helpers"
import { setSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { SessionFileBrowserTab, type SessionFileBrowserState } from "@/pages/session/v2/session-file-browser-tab"
import { EcosystemPanel } from "@/pages/session/ecosystem-panel"
import { getPreviewActive, setPreviewActiveState, getPreviewWidth, setPreviewWidthState } from "@/pages/session/preview-state"


type RenderDiff = (SnapshotFileDiff & { file: string }) | VcsFileDiff

function renderDiff(value: SnapshotFileDiff | VcsFileDiff): value is RenderDiff {
  return typeof value.file === "string"
}

export function SessionSidePanel(props: {
  canReview: () => boolean
  diffs: () => (SnapshotFileDiff | VcsFileDiff)[]
  diffsReady: () => boolean
  empty: () => string
  hasReview: () => boolean
  reviewHasFocusableContent: () => boolean
  reviewCount: () => number
  reviewPanel: () => JSX.Element
  reviewSidebarToggle?: (disabled: boolean) => JSX.Element
  fileBrowserState?: SessionFileBrowserState
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  reviewSnap: boolean
  size: Sizing
  stacked?: boolean
}) {
  const layout = useLayout()
  const settings = useSettings()
  const file = useFile()
  const language = useLanguage()
  const command = useCommand()
  const dialog = useDialog()
  const sdk = useSDK()
  const { sessionKey, tabs, view, params } = useSessionLayout()
  const projectDirectory = createMemo(() => sdk().directory)

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const shown = settings.visibility.fileTree
  const previewActive = getPreviewActive()
  const setPreviewActive = setPreviewActiveState
  const previewWidth = getPreviewWidth()

  const reviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened())
  const reviewTab = createMemo(() => isDesktop())

  const diffs = createMemo(() => props.diffs().filter(renderDiff))
  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const file = normalizeFileTreeV2Path(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(file, kind)

      const parts = file.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const empty = (msg: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
      </div>
    </div>
  )

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const openReviewPanel = () => {
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const openTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive,
  })

  const tabState = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab,
    review: reviewTab,
    hasReview: props.canReview,
    fileBrowser: () => !!props.fileBrowserState,
  })
  const contextOpen = tabState.contextOpen
  const openFileOpen = tabState.openFileOpen
  const panelTabs = tabState.panelTabs
  const openedTabs = tabState.openedTabs
  const activeTab = tabState.activeTab
  const activeFileTab = tabState.activeFileTab
  const open = createMemo(
    () => reviewOpen() || previewActive() || activeTab() === "allfiles" || activeTab() === "ecosystem",
  )
  const panelWidth = createMemo(() => {
    if (!open()) return "0px"
    if (previewActive()) return `${previewWidth()}px`
    return "auto"
  })
  const treeWidth = createMemo(() => "0px")

  const fileTreeTab = () => layout.fileTree.tab()

  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  const showAllFiles = () => {
    if (fileTreeTab() !== "changes") return
    layout.fileTree.setTab("all")
  }

  let fileFilter: HTMLInputElement | undefined
  let tabList: HTMLDivElement | undefined
  const temporaryTab = tabs().preview
  const previewTab = (value: string) => {
    const next = normalizeTab(value)
    tabs().previewTab(next)
    const path = file.pathFromTab(next)
    if (path) void file.load(path)
    openReviewPanel()
    queueMicrotask(() => tabs().setActive(next))
  }
  const openFileBrowser = () => {
    previewTab(SESSION_OPEN_FILE_TAB)
    queueMicrotask(() => fileFilter?.focus())
  }
  const activateTab = (value: string) => {
    const next = normalizeTab(value)
    const path = file.pathFromTab(next)
    if (path) void file.load(path)
    if (next === "review") openReviewPanel()
    setPreviewActive(next === "ecosystem")
    tabs().setActive(next)
  }

  // Sync preview state with actual tab. previewActive is a global singleton —
  // if the tab changed away from ecosystem (e.g. session switch), reset it
  // so the side panel doesn't stay open with empty content.
  let skipPreviewSync = false
  createEffect(() => {
    const isActive = previewActive()
    if (skipPreviewSync) {
      skipPreviewSync = false
      return
    }
    if (isActive && activeTab() !== "ecosystem") {
      skipPreviewSync = true
      setPreviewActive(false)
    } else if (!isActive && activeTab() === "ecosystem") {
      skipPreviewSync = true
      tabs().setActive("review")
    }
  })
  const browserTab = createMemo(() => {
    if (!props.fileBrowserState) return undefined
    const active = activeTab()
    if (active === SESSION_OPEN_FILE_TAB) return SESSION_OPEN_FILE_TAB
    if (active && file.pathFromTab(active)) return active
    return activeFileTab()
  })
  // Keep the file-browser shell mounted while any file tab exists. Kobalte briefly
  // selects Review while the tab For replaces a preview trigger, which would
  // otherwise dispose the sidebar and reset scroll.
  const fileBrowserMounted = createMemo(() => {
    if (!props.fileBrowserState) return false
    return openedTabs().length > 0 || openFileOpen() || !!browserTab()
  })
  const fileBrowserVisible = createMemo(() => {
    const active = activeTab()
    return active !== "review" && active !== "context" && active !== "empty"
  })
  const openFileKeybind = createMemo(() => command.keybindParts("file.open"))
  const closeTabKeybind = createMemo(() => command.keybindParts("tab.close"))
  const [store, setStore] = createStore({
    activeDraggable: undefined as string | undefined,
  })

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const currentTabs = tabs().all()
    const toIndex = getTabReorderIndex(currentTabs, draggable.id.toString(), droppable.id.toString())
    if (toIndex === undefined) return
    tabs().move(draggable.id.toString(), toIndex)
  }

  const handleDragEnd = () => {
    setStore("activeDraggable", undefined)
  }

  createEffect(() => {
    if (!file.ready()) return

    setSessionHandoff(sessionKey(), {
      files: tabs()
        .all()
        .reduce<Record<string, SelectedLineRange | null>>((acc, tab) => {
          const path = file.pathFromTab(tab)
          if (!path) return acc

          const selected = file.selectedLines(path)
          acc[path] =
            selected && typeof selected === "object" && "start" in selected && "end" in selected
              ? (selected as SelectedLineRange)
              : null

          return acc
        }, {}),
    })
  })

  return (
    <Show when={isDesktop() && !(settings.general.newLayoutDesigns() && !params.id)}>
      <aside
        id="review-panel"
        aria-label={language.t("session.panel.reviewAndFiles")}
        aria-hidden={!open()}
        inert={!open()}
        class="relative min-w-0 flex overflow-hidden"
        classList={{
          "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
          "bg-background-base": !settings.general.newLayoutDesigns(),
          "h-full shrink-0": !props.stacked,
          "h-full min-h-0": props.stacked,
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap,
          "rounded-[10px] shadow-[var(--v2-elevation-raised)] overflow-hidden": settings.general.newLayoutDesigns(),
          "flex-1": reviewOpen(),
          "hidden": !open(),
        }}
        style={{ width: open() ? panelWidth() : "0px" }}
      >
        <Show when={open()}>
          <div
            class="size-full flex"
            classList={{
              "border-l border-border-weaker-base": !settings.general.newLayoutDesigns(),
            }}
          >
            <Show when={reviewOpen() || previewActive() || activeTab() === "ecosystem"}>
              <div
                class="relative min-w-0 h-full flex-1 overflow-hidden"
                classList={{
                  "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
                  "bg-background-base": !settings.general.newLayoutDesigns(),
                }}
              >
                {/* Preview resize handle — drag to make preview bigger/smaller */}
                <Show when={previewActive()}>
                  <div onPointerDown={() => props.size.start()}>
                    <ResizeHandle
                      direction="horizontal"
                      edge="start"
                      size={previewWidth()}
                      min={360}
                      max={1200}
                      onResize={(width) => {
                        props.size.touch()
                        setPreviewWidthState(width)
                      }}
                    />
                  </div>
                </Show>
                <div
                  class="size-full min-w-0 h-full"
                  classList={{
                    "bg-v2-background-bg-base": settings.general.newLayoutDesigns(),
                    "bg-background-base": !settings.general.newLayoutDesigns(),
                  }}
                >
                  <Show
                    when={props.fileBrowserState}
                    fallback={
                      <DragDropProvider
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                        collisionDetector={closestCenter}
                      >
                        <DragDropSensors />
                        <ConstrainDragYAxis />
                        <Tabs value={activeTab()} onChange={activateTab}>
                          <div class="sticky top-0 shrink-0 flex">
                            <Tabs.List
                              ref={(el: HTMLDivElement) => {
                                const stop = createFileTabListSync({ el, contextOpen })
                                onCleanup(stop)
                              }}
                            >
                              <Tabs.Trigger
                                value="allfiles"
                                class="flex items-center gap-1.5"
                              >
                                <Icon name="open-file" size="small" />
                                <span>{language.t("session.files.all")}</span>
                              </Tabs.Trigger>
                              <Show when={reviewTab() && props.canReview()}>
                                <Tabs.Trigger
                                  value="review"
                                  id={reviewTabID}
                                  aria-controls={activeTab() === "review" ? reviewTabPanelID : undefined}
                                >
                                  <div class="flex items-center gap-1.5">
                                    <div>{language.t("session.tab.review")}</div>
                                    <Show when={props.hasReview()}>
                                      <div>{props.reviewCount()}</div>
                                    </Show>
                                  </div>
                                </Tabs.Trigger>
                              </Show>
                              <Show when={contextOpen()}>
                                <Tabs.Trigger
                                  value="context"
                                  closeButton={
                                    <TooltipKeybind
                                      title={language.t("common.closeTab")}
                                      keybind={command.keybind("tab.close")}
                                      placement="bottom"
                                      gutter={10}
                                    >
                                      <IconButton
                                        icon="close-small"
                                        variant="ghost"
                                        class="h-5 w-5"
                                        onClick={() => tabs().close("context")}
                                        aria-label={language.t("common.closeTab")}
                                      />
                                    </TooltipKeybind>
                                  }
                                  hideCloseButton
                                  onMiddleClick={() => tabs().close("context")}
                                >
                                  <div class="flex items-center gap-2">
                                    <SessionContextUsage variant="indicator" />
                                    <div>{language.t("session.tab.context")}</div>
                                  </div>
                                </Tabs.Trigger>
                              </Show>
                              <Tabs.Trigger value="ecosystem">
                                <div class="flex items-center gap-1.5">
                                  <Icon name="puzzle" size="small" />
                                  <span>Ecosystem</span>
                                </div>
                              </Tabs.Trigger>
                              <SortableProvider ids={openedTabs()}>
                                <For each={panelTabs()}>
                                  {(tab) => (
                                    <Show
                                      when={tab === SESSION_OPEN_FILE_TAB}
                                      fallback={
                                        <SortableTab
                                          tab={tab}
                                          temporary={temporaryTab() === tab}
                                          onTabClose={tabs().close}
                                          onTabDoubleClick={temporaryTab() === tab ? openTab : undefined}
                                        />
                                      }
                                    >
                                      <Tabs.Trigger
                                        value={SESSION_OPEN_FILE_TAB}
                                        closeButton={
                                          <TooltipKeybind
                                            title={language.t("common.closeTab")}
                                            keybind={command.keybind("tab.close")}
                                            placement="bottom"
                                            gutter={10}
                                          >
                                            <IconButton
                                              icon="close-small"
                                              variant="ghost"
                                              class="h-5 w-5"
                                              onClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                              aria-label={language.t("common.closeTab")}
                                            />
                                          </TooltipKeybind>
                                        }
                                        hideCloseButton
                                        onMiddleClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                      >
                                        <div class="flex items-center gap-1.5 italic">
                                          <Icon name="open-file" size="small" />
                                          <span>{language.t("command.file.open")}</span>
                                        </div>
                                      </Tabs.Trigger>
                                    </Show>
                                  )}
                                </For>
                              </SortableProvider>
                            </Tabs.List>
                          </div>

                          <Show when={activeTab() === "allfiles"}>
                            <div class="h-full min-h-0 overflow-hidden bg-background-stronger px-3 py-0">
                              <Show
                                when={nofiles()}
                                fallback={
                                  <FileTree
                                    path=""
                                    class="pt-3"
                                    modified={diffFiles()}
                                    kinds={kinds()}
                                    onFileClick={(node) => openTab(file.tab(node.path))}
                                  />
                                }
                              >
                                <div class="h-full flex items-center justify-center">
                                  <div class="text-14-regular text-text-weak">{language.t("session.files.empty")}</div>
                                </div>
                              </Show>
                            </div>
                          </Show>

                          <Show when={reviewTab() && props.canReview() && activeTab() === "review"}>
                            <div
                              id={reviewTabPanelID}
                              role="tabpanel"
                              aria-labelledby={reviewTabID}
                              tabIndex={props.reviewHasFocusableContent() ? undefined : 0}
                              data-slot="tabs-content"
                              class="flex flex-col h-full overflow-hidden contain-strict"
                            >
                              <div class="flex-1 min-h-0 overflow-hidden">
                                {props.reviewPanel()}
                              </div>
                            </div>
                          </Show>


                          <Show when={activeTab() === "empty"}>
                            <Tabs.Content value="empty" class="flex flex-col h-full overflow-hidden contain-strict">
                              <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                                <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                                  <Mark class="w-14 opacity-10" />
                                  <div class="text-14-regular text-text-weak max-w-56">
                                    {language.t("session.files.selectToOpen")}
                                  </div>
                                </div>
                              </div>
                            </Tabs.Content>
                          </Show>

                          <Show when={activeTab() === "context"}>
                            <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                              <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                                <SessionContextTab />
                              </div>
                            </Tabs.Content>
                          </Show>

                          <Show when={activeTab() === "ecosystem"}>
                            <Tabs.Content value="ecosystem" class="flex flex-col h-full overflow-hidden contain-strict">
                              <EcosystemPanel />
                            </Tabs.Content>
                          </Show>

                          <Show when={activeFileTab()} keyed>
                            {(tab) => <FileTabContent tab={tab} />}
                          </Show>
                        </Tabs>
                        <DragOverlay>
                          <Show when={store.activeDraggable} keyed>
                            {(tab) => {
                              const path = file.pathFromTab(tab)
                              return (
                                <div data-component="tabs-drag-preview">
                                  <Show when={path}>
                                    {(p) => <FileVisual active path={p()} temporary={temporaryTab() === tab} />}
                                  </Show>
                                </div>
                              )
                            }}
                          </Show>
                        </DragOverlay>
                      </DragDropProvider>
                    }
                  >
                    <DndKitProvider
                      sensors={[
                        PointerSensor.configure({
                          activationConstraints: [new PointerActivationConstraints.Distance({ value: 4 })],
                          preventActivation: (event) =>
                            event.target instanceof Element &&
                            (!!event.target.closest('[data-slot="tabs-trigger-close-button"]') ||
                              !!event.target.closest(".session-review-v2-open-in-app-slot")),
                        }),
                      ]}
                      modifiers={[
                        RestrictToHorizontalAxis,
                        RestrictToElement.configure({ element: () => tabList ?? null }),
                      ]}
                      plugins={(defaults) => [
                        ...defaults.filter((plugin) => plugin !== Accessibility),
                        AutoScroller.configure({ acceleration: 8, threshold: { x: 0.05, y: 0 } }),
                        Feedback.configure({ dropAnimation: null }),
                      ]}
                      onDragEnd={(event) => {
                        const source = event.operation.source
                        if (event.canceled || !isSortable(source) || source.initialIndex === source.index) return
                        tabs().move(source.id.toString(), source.index)
                      }}
                    >
                      <Tabs value={activeTab()} onChange={activateTab}>
                        <div class="session-review-v2-tabs-bar sticky top-0 shrink-0 flex items-center">
                          <Tabs.List
                            ref={(el: HTMLDivElement) => {
                              tabList = el
                              const stop = createFileTabListSync({ el, contextOpen })
                              onCleanup(stop)
                            }}
                          >
                            <Tabs.Trigger
                              value="allfiles"
                              class="flex items-center gap-1.5"
                            >
                              <Icon name="open-file" size="small" />
                              <span>{language.t("session.files.all")}</span>
                            </Tabs.Trigger>
                            <Show when={reviewTab() && props.canReview()}>
                              <Tabs.Trigger
                                value="review"
                                id={reviewTabID}
                                aria-controls={activeTab() === "review" ? reviewTabPanelID : undefined}
                              >
                                {props.hasReview()
                                  ? language.t("session.review.filesChanged", { count: props.reviewCount() })
                                  : language.t("session.tab.review")}
                              </Tabs.Trigger>
                            </Show>
                            <Show when={contextOpen()}>
                              <Tabs.Trigger
                                value="context"
                                closeButton={
                                  <TooltipV2
                                    value={
                                      <>
                                        {language.t("common.closeTab")}
                                        <Show when={closeTabKeybind().length > 0}>
                                          <KeybindV2 keys={closeTabKeybind()} variant="neutral" />
                                        </Show>
                                      </>
                                    }
                                    placement="bottom"
                                    gutter={10}
                                  >
                                    <IconButton
                                      icon="close-small"
                                      variant="ghost"
                                      class="h-5 w-5"
                                      onClick={() => tabs().close("context")}
                                      aria-label={language.t("common.closeTab")}
                                    />
                                  </TooltipV2>
                                }
                                hideCloseButton
                                onMiddleClick={() => tabs().close("context")}
                              >
                                <div class="flex items-center gap-2">
                                  <SessionContextUsage variant="indicator" />
                                  <div>{language.t("session.tab.context")}</div>
                                </div>
                              </Tabs.Trigger>
                            </Show>
                            <Tabs.Trigger value="ecosystem">
                              <div class="flex items-center gap-1.5">
                                <Icon name="puzzle" size="small" />
                                <span>Ecosystem</span>
                              </div>
                            </Tabs.Trigger>
                            <For each={panelTabs()}>
                              {(tab) => (
                                <Show
                                  when={tab === SESSION_OPEN_FILE_TAB}
                                  fallback={
                                    <SortableTabV2
                                      tab={tab}
                                      index={() => tabs().all().indexOf(tab)}
                                      temporary={temporaryTab() === tab}
                                      onTabClose={tabs().close}
                                      onTabDoubleClick={temporaryTab() === tab ? openTab : undefined}
                                    />
                                  }
                                >
                                  <Tabs.Trigger
                                    value={SESSION_OPEN_FILE_TAB}
                                    closeButton={
                                      <TooltipV2
                                        value={
                                          <>
                                            {language.t("common.closeTab")}
                                            <Show when={closeTabKeybind().length > 0}>
                                              <KeybindV2 keys={closeTabKeybind()} variant="neutral" />
                                            </Show>
                                          </>
                                        }
                                        placement="bottom"
                                        gutter={10}
                                      >
                                        <IconButton
                                          icon="close-small"
                                          variant="ghost"
                                          class="h-5 w-5"
                                          onClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                          aria-label={language.t("common.closeTab")}
                                        />
                                      </TooltipV2>
                                    }
                                    hideCloseButton
                                    onMiddleClick={() => tabs().close(SESSION_OPEN_FILE_TAB)}
                                  >
                                    <div class="flex items-center gap-1.5 italic">
                                      <Icon name="open-file" size="small" />
                                      <span>{language.t("command.file.open")}</span>
                                    </div>
                                  </Tabs.Trigger>
                                </Show>
                              )}
                            </For>
                          </Tabs.List>
                          <div
                            class="session-review-v2-open-in-app-slot shrink-0 flex items-center pr-3"
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <OpenInAppV2 directory={projectDirectory} />
                          </div>
                        </div>

                        <Show when={activeTab() === "allfiles"}>
                          <div class="h-full min-h-0 overflow-hidden bg-background-stronger px-3 py-0">
                            <Show
                              when={nofiles()}
                              fallback={
                                <FileTree
                                  path=""
                                  class="pt-3"
                                  modified={diffFiles()}
                                  kinds={kinds()}
                                  onFileClick={(node) => openTab(file.tab(node.path))}
                                />
                              }
                            >
                              <div class="h-full flex items-center justify-center">
                                <div class="text-14-regular text-text-weak">{language.t("session.files.empty")}</div>
                              </div>
                            </Show>
                          </div>
                        </Show>

                        <Show when={reviewTab() && props.canReview() && activeTab() === "review"}>
                          <div
                            id={reviewTabPanelID}
                            role="tabpanel"
                            aria-labelledby={reviewTabID}
                            tabIndex={props.reviewHasFocusableContent() ? undefined : 0}
                            data-slot="tabs-content"
                            class="flex flex-col h-full overflow-hidden contain-strict"
                          >
                            <div class="flex-1 min-h-0 overflow-hidden">
                              {props.reviewPanel()}
                            </div>
                          </div>
                        </Show>

                        <Show when={activeTab() === "empty"}>
                          <Tabs.Content value="empty" class="flex flex-col h-full overflow-hidden contain-strict">
                            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                              <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                                <Mark class="w-14 opacity-10" />
                                <div class="text-14-regular text-text-weak max-w-56">
                                  {language.t("session.files.selectToOpen")}
                                </div>
                              </div>
                            </div>
                          </Tabs.Content>
                        </Show>

                        <Show when={activeTab() === "context"}>
                          <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                              <SessionContextTab />
                            </div>
                          </Tabs.Content>
                        </Show>


                        <Show when={activeTab() === "ecosystem"}>
                          <Tabs.Content value="ecosystem" class="flex flex-col h-full overflow-hidden contain-strict">
                            <EcosystemPanel />
                          </Tabs.Content>
                        </Show>

                        <Show when={fileBrowserMounted()}>
                          <div
                            id={fileBrowserTabPanelID}
                            role="tabpanel"
                            data-slot="tabs-content"
                            class="h-full min-h-0 overflow-hidden"
                            classList={{ hidden: !fileBrowserVisible() }}
                            inert={!fileBrowserVisible() || undefined}
                          >
                            <SessionFileBrowserTab
                              tab={browserTab() ?? activeFileTab() ?? SESSION_OPEN_FILE_TAB}
                              placeholder={
                                (browserTab() ?? activeFileTab() ?? SESSION_OPEN_FILE_TAB) === SESSION_OPEN_FILE_TAB
                              }
                              active={file.pathFromTab(browserTab() ?? activeFileTab() ?? "")}
                              kinds={kinds()}
                              state={props.fileBrowserState!}
                              onSelect={(path) => previewTab(file.tab(path))}
                              onSelectPermanent={(path) => openTab(file.tab(path))}
                              filterRef={(element) => (fileFilter = element)}
                            />
                          </div>
                        </Show>
                      </Tabs>
                    </DndKitProvider>
                  </Show>
                </div>
              </div>
            </Show>

          </div>
        </Show>
      </aside>
    </Show>
  )
}
