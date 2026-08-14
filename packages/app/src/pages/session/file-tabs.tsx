import { createEffect, createMemo, createSignal, Match, on, onCleanup, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import { Dynamic } from "solid-js/web"
import { makeEventListener } from "@solid-primitives/event-listener"
import type { FileSearchHandle } from "@zyraxon-ai/session-ui/file"
import { useFileComponent } from "@zyraxon-ai/ui/context/file"
import { cloneSelectedLineRange, previewSelectedLines } from "@zyraxon-ai/session-ui/pierre/selection-bridge"
import { createLineCommentController } from "@zyraxon-ai/session-ui/line-comment-annotations"
import { createLineCommentControllerV2 } from "@zyraxon-ai/session-ui/v2/line-comment-annotations-v2"
import { sampledChecksum } from "@zyraxon-ai/core/util/encode"
import { DropdownMenu } from "@zyraxon-ai/ui/dropdown-menu"
import { IconButton } from "@zyraxon-ai/ui/icon-button"
import { LineCommentV2OverflowIcon } from "@zyraxon-ai/ui/v2/line-comment-v2"
import { MenuV2 } from "@zyraxon-ai/ui/v2/menu-v2"
import { Tabs } from "@zyraxon-ai/ui/tabs"
import { ScrollView } from "@zyraxon-ai/ui/scroll-view"
import { showToast } from "@/utils/toast"
import { selectionFromLines, useFile, type FileSelection, type SelectedLineRange } from "@/context/file"
import { useComments } from "@/context/comments"
import { useLanguage } from "@/context/language"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import { getSessionHandoff } from "@/pages/session/handoff"
import { useSessionLayout } from "@/pages/session/session-layout"
import { createSessionTabs } from "@/pages/session/helpers"
import { MonacoEditor, getLanguageFromPath } from "@/components/monaco-editor"

function FileCommentMenu(props: {
  moreLabel: string
  editLabel: string
  deleteLabel: string
  onEdit: VoidFunction
  onDelete: VoidFunction
}) {
  return (
    <div onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <DropdownMenu gutter={4} placement="bottom-end">
        <DropdownMenu.Trigger
          as={IconButton}
          icon="dot-grid"
          variant="ghost"
          size="small"
          class="size-6 rounded-md"
          aria-label={props.moreLabel}
        />
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={props.onEdit}>
              <DropdownMenu.ItemLabel>{props.editLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={props.onDelete}>
              <DropdownMenu.ItemLabel>{props.deleteLabel}</DropdownMenu.ItemLabel>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu>
    </div>
  )
}

function FileCommentMenuV2(props: {
  moreLabel: string
  editLabel: string
  deleteLabel: string
  onEdit: VoidFunction
  onDelete: VoidFunction
}) {
  return (
    <div onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <MenuV2 gutter={4}>
        <MenuV2.Trigger as="button" type="button" data-slot="line-comment-v2-overflow" aria-label={props.moreLabel}>
          <LineCommentV2OverflowIcon />
        </MenuV2.Trigger>
        <MenuV2.Portal>
          <MenuV2.Content>
            <MenuV2.Item onSelect={props.onEdit}>{props.editLabel}</MenuV2.Item>
            <MenuV2.Item onSelect={props.onDelete}>{props.deleteLabel}</MenuV2.Item>
          </MenuV2.Content>
        </MenuV2.Portal>
      </MenuV2>
    </div>
  )
}

type ScrollPos = { x: number; y: number }

function createScrollSync(input: { tab: () => string; view: ReturnType<typeof useSessionLayout>["view"] }) {
  let scroll: HTMLDivElement | undefined
  let scrollFrame: number | undefined
  let restoreFrame: number | undefined
  let pending: ScrollPos | undefined
  const [code, setCode] = createSignal<HTMLElement[]>([])

  const getCode = () => {
    const el = scroll
    if (!el) return []

    const host = el.querySelector("diffs-container")
    if (!(host instanceof HTMLElement)) return []

    const root = host.shadowRoot
    if (!root) return []

    return Array.from(root.querySelectorAll("[data-code]")).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node.clientWidth > 0,
    )
  }

  const save = (next: ScrollPos) => {
    pending = next
    if (scrollFrame !== undefined) return

    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = undefined

      const out = pending
      pending = undefined
      if (!out) return

      input.view().setScroll(input.tab(), out)
    })
  }

  const onCodeScroll = (event: Event) => {
    const el = scroll
    if (!el) return

    const target = event.currentTarget
    if (!(target instanceof HTMLElement)) return

    save({
      x: target.scrollLeft,
      y: el.scrollTop,
    })
  }

  const sync = () => {
    const next = getCode()
    const current = code()
    if (next.length === current.length && next.every((el, i) => el === current[i])) return
    setCode(next)
  }

  const restore = () => {
    const el = scroll
    if (!el) return

    const pos = input.view().scroll(input.tab())
    if (!pos) return

    sync()

    if (code().length > 0) {
      for (const item of code()) {
        if (item.scrollLeft !== pos.x) item.scrollLeft = pos.x
      }
    }

    if (el.scrollTop !== pos.y) el.scrollTop = pos.y
    if (code().length > 0) return
    if (el.scrollLeft !== pos.x) el.scrollLeft = pos.x
  }

  const queueRestore = () => {
    if (restoreFrame !== undefined) return

    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = undefined
      restore()
    })
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (code().length === 0) sync()

    save({
      x: code()[0]?.scrollLeft ?? event.currentTarget.scrollLeft,
      y: event.currentTarget.scrollTop,
    })
  }

  createEffect(() => {
    for (const item of code()) makeEventListener(item, "scroll", onCodeScroll)
  })

  const setViewport = (el: HTMLDivElement) => {
    scroll = el
    restore()
  }

  onCleanup(() => {
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame)
  })

  return {
    handleScroll,
    queueRestore,
    setViewport,
  }
}

export function FileTabContent(props: { tab: string }) {
  return (
    <Tabs.Content value={props.tab}>
      <SessionFileView tab={props.tab} />
    </Tabs.Content>
  )
}

export function SessionFileView(props: { tab: string }) {
  const settings = useSettings()
  return (
    <Show when={settings.general.newLayoutDesigns()} fallback={<SessionFileViewV1 tab={props.tab} />}>
      <SessionFileViewV2 tab={props.tab} />
    </Show>
  )
}

function SessionFileViewV1(props: { tab: string }) {
  const file = useFile()
  const comments = useComments()
  const language = useLanguage()
  const prompt = usePrompt()
  const fileComponent = useFileComponent()
  const sdk = useSDK()
  const { sessionKey, tabs, view } = useSessionLayout()
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
  }).activeFileTab

  let find: FileSearchHandle | null = null

  const search = {
    register: (handle: FileSearchHandle | null) => {
      find = handle
    },
  }

  const path = createMemo(() => file.pathFromTab(props.tab))
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => sampledChecksum(contents()))
  const selectedLines = createMemo<SelectedLineRange | null>(() => {
    const p = path()
    if (!p) return null
    if (file.ready()) return (file.selectedLines(p) as SelectedLineRange | undefined) ?? null
    return (getSessionHandoff(sessionKey())?.files[p] as SelectedLineRange | undefined) ?? null
  })
  const scrollSync = createScrollSync({
    tab: () => props.tab,
    view,
  })

  const selectionPreview = (source: string, selection: FileSelection) => {
    return previewSelectedLines(source, {
      start: selection.startLine,
      end: selection.endLine,
    })
  }

  const buildPreview = (filePath: string, selection: FileSelection) => {
    const source = filePath === path() ? contents() : file.get(filePath)?.content?.content
    if (!source) return undefined
    return selectionPreview(source, selection)
  }

  const addCommentToContext = (input: {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }) => {
    const selection = selectionFromLines(input.selection)
    const preview = input.preview ?? buildPreview(input.file, selection)

    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment,
    })
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview,
    })
  }

  const updateCommentInContext = (input: {
    id: string
    file: string
    selection: SelectedLineRange
    comment: string
  }) => {
    comments.update(input.file, input.id, input.comment)
    const preview = input.file === path() ? buildPreview(input.file, selectionFromLines(input.selection)) : undefined
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(preview ? { preview } : {}),
    })
  }

  const removeCommentFromContext = (input: { id: string; file: string }) => {
    comments.remove(input.file, input.id)
    prompt.context.removeComment(input.file, input.id)
  }

  const fileComments = createMemo(() => {
    const p = path()
    if (!p) return []
    return comments.list(p)
  })

  const commentedLines = createMemo(() => fileComments().map((comment) => comment.selection))

  const [note, setNote] = createStore({
    openedComment: null as string | null,
    commenting: null as SelectedLineRange | null,
    selected: null as SelectedLineRange | null,
  })

  const syncSelected = (range: SelectedLineRange | null) => {
    const p = path()
    if (!p) return
    file.setSelectedLines(p, range ? cloneSelectedLineRange(range) : null)
  }

  const activeSelection = () => note.selected ?? selectedLines()

  const commentsUi = createLineCommentController({
    comments: fileComments,
    label: language.t("ui.lineComment.submit"),
    draftKey: () => path() ?? props.tab,
    mention: {
      items: file.searchFilesAndDirectories,
    },
    state: {
      opened: () => note.openedComment,
      setOpened: (id) => setNote("openedComment", id),
      selected: () => note.selected,
      setSelected: (range) => setNote("selected", range),
      commenting: () => note.commenting,
      setCommenting: (range) => setNote("commenting", range),
      syncSelected,
      hoverSelected: syncSelected,
    },
    getHoverSelectedRange: activeSelection,
    cancelDraftOnCommentToggle: true,
    clearSelectionOnSelectionEndNull: true,
    onSubmit: ({ comment, selection }) => {
      const p = path()
      if (!p) return
      addCommentToContext({ file: p, selection, comment, origin: "file" })
    },
    onUpdate: ({ id, comment, selection }) => {
      const p = path()
      if (!p) return
      updateCommentInContext({ id, file: p, selection, comment })
    },
    onDelete: (comment) => {
      const p = path()
      if (!p) return
      removeCommentFromContext({ id: comment.id, file: p })
    },
    editSubmitLabel: language.t("common.save"),
    renderCommentActions: (_, controls) => (
      <FileCommentMenu
        moreLabel={language.t("common.moreOptions")}
        editLabel={language.t("common.edit")}
        deleteLabel={language.t("common.delete")}
        onEdit={controls.edit}
        onDelete={controls.remove}
      />
    ),
  })

  createEffect(() => {
    if (typeof window === "undefined") return

    const onKeyDown = (event: KeyboardEvent) => {
      if (activeFileTab() !== props.tab) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== "f") return

      event.preventDefault()
      event.stopPropagation()
      find?.focus()
    }

    makeEventListener(window, "keydown", onKeyDown, { capture: true })
  })

  createEffect(
    on(
      path,
      () => {
        commentsUi.note.reset()
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const focus = comments.focus()
    const p = path()
    if (!focus || !p) return
    if (focus.file !== p) return
    if (activeFileTab() !== props.tab) return

    const target = fileComments().find((comment) => comment.id === focus.id)
    if (!target) return

    commentsUi.note.openComment(target.id, target.selection, { cancelDraft: true })
    requestAnimationFrame(() => comments.clearFocus())
  })

  let prev = {
    loaded: false,
    ready: false,
    active: false,
  }

  createEffect(() => {
    const loaded = !!state()?.loaded
    const ready = file.ready()
    const active = activeFileTab() === props.tab
    const restore = (loaded && !prev.loaded) || (ready && !prev.ready) || (active && loaded && !prev.active)
    prev = { loaded, ready, active }
    if (!restore) return
    scrollSync.queueRestore()
  })

  const renderFile = (source: string) => (
    <div class="relative overflow-hidden pb-40">
      <Dynamic
        component={fileComponent}
        mode="text"
        file={{
          name: path() ?? "",
          contents: source,
          cacheKey: cacheKey(),
        }}
        enableLineSelection
        selectedLines={activeSelection()}
        commentedLines={commentedLines()}
        onRendered={() => {
          scrollSync.queueRestore()
        }}
        onLineSelected={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelected(range)
        }}
        onLineSelectionEnd={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelectionEnd(range)
        }}
        search={search}
        class="select-text"
        media={{
          mode: "auto",
          path: path(),
          current: state()?.content,
          onLoad: scrollSync.queueRestore,
          onError: (args: { kind: "image" | "audio" | "svg" }) => {
            if (args.kind !== "svg") return
            showToast({
              variant: "error",
              title: language.t("toast.file.loadFailed.title"),
            })
          },
        }}
      />
    </div>
  )

  const [debounceTimer, setDebounceTimer] = createSignal<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = createSignal<"idle" | "dirty" | "saving" | "saved">("idle")
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let lastSavedValue = contents()

  const flushSave = () => {
    const timer = debounceTimer()
    if (timer) {
      clearTimeout(timer)
      setDebounceTimer(null)
      const val = lastSavedValue
      if (val && path()) {
        const api = (window as any).api
        if (api?.writeFile) {
          const absPath = sdk().directory + "/" + path()!
          api.writeFile(absPath, val).then((r: boolean) => {
            if (r) setSaveStatus("saved")
          }).catch(() => {})
        }
      }
    }
  }

  onCleanup(() => {
    flushSave()
    if (saveTimer) clearTimeout(saveTimer)
  })

  const autoSave = (filePath: string, value: string) => {
    const prev = debounceTimer()
    if (prev) clearTimeout(prev)
    if (saveTimer) clearTimeout(saveTimer)
    if (value !== lastSavedValue) setSaveStatus("dirty")
    setDebounceTimer(setTimeout(async () => {
      setDebounceTimer(null)
      setSaveStatus("saving")
      try {
        if (value === lastSavedValue) {
          setSaveStatus("idle")
          return
        }
        const api = (window as any).api
        if (api?.writeFile) {
          const absPath = sdk().directory + "/" + filePath
          const writePromise = api.writeFile(absPath, value)
          const timeoutPromise = new Promise<false>((_, reject) => setTimeout(() => reject(new Error("write timeout")), 5000))
          const result = await Promise.race([writePromise, timeoutPromise])
          if (result === false) {
            setSaveStatus("idle")
          } else {
            lastSavedValue = value
            setSaveStatus("saved")
            file.load(filePath, { force: true }).catch(() => {})
          }
        } else {
          setSaveStatus("idle")
        }
      } catch {
        setSaveStatus("idle")
      }
      saveTimer = setTimeout(() => setSaveStatus("idle"), 2000)
    }, 800))
  }

  const mediaInfoV1 = createMemo(() => {
    const p = path()
    if (!p) return null
    const ext = p.split(".").pop()?.toLowerCase() || ""
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff", "heic"]
    const audioExts = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "wma"]
    const videoExts = ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "m4v", "3gp"]
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", avif: "image/avif",
      bmp: "image/bmp", ico: "image/x-icon", tif: "image/tif",
      tiff: "image/tiff", heic: "image/heic", svg: "image/svg+xml",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
      opus: "audio/opus", wma: "audio/x-ms-wma",
      mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska",
      avi: "video/x-msvideo", mov: "video/quicktime", wmv: "video/x-ms-wmv",
      flv: "video/x-flv", m4v: "video/x-m4v", "3gp": "video/3gpp",
    }
    if (imageExts.includes(ext)) return { type: "image" as const, mime: mimeMap[ext] || "image/png", ext }
    if (audioExts.includes(ext)) return { type: "audio" as const, mime: mimeMap[ext] || "audio/mpeg", ext }
    if (videoExts.includes(ext)) return { type: "video" as const, mime: mimeMap[ext] || "video/mp4", ext }
    if (ext === "svg") return { type: "image" as const, mime: "image/svg+xml", ext }
    return null
  })

  const mediaDataUrlV1 = createMemo(() => {
    const media = mediaInfoV1()
    if (!media) return null
    const fileState = state()
    if (!fileState?.content?.content) return null
    const content = fileState.content.content
    if (content.startsWith("data:")) return content
    return `data:${media.mime};base64,${content}`
  })

  const [mediaZoomV1, setMediaZoomV1] = createSignal(100)

  const isMediaFile = createMemo(() => {
    const p = path()
    if (!p) return false
    const ext = p.split(".").pop()?.toLowerCase() || ""
    const mediaExts = ["png","jpg","jpeg","gif","webp","avif","bmp","ico","tif","tiff","heic","svg","mp3","wav","ogg","m4a","aac","flac","opus","wma","mp4","webm","mkv","avi","mov","wmv","flv","m4v","3gp"]
    return mediaExts.includes(ext)
  })

  return (
    <div class="mt-3 relative h-full min-h-0">
      <ScrollView class="h-full" viewportRef={scrollSync.setViewport} onScroll={scrollSync.handleScroll as any}>
        <Switch>
          <Match when={state()?.loading}>
            <div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>
          </Match>
          <Match when={state()?.error}>{(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}</Match>
          <Match when={isMediaFile() && mediaInfoV1() && mediaDataUrlV1()}>
            {(() => {
              const m = mediaInfoV1()!
              const url = mediaDataUrlV1()!
              return (
                <div class="flex flex-col h-full">
                  <div class="flex items-center gap-2 px-3 py-1.5 border-b border-border-base bg-surface-raised-base shrink-0">
                    <button class="text-xs px-2 py-0.5 rounded bg-surface-base hover:bg-surface-raised-base text-text-weak hover:text-text transition-colors" onClick={() => setMediaZoomV1((z) => Math.max(25, z - 25))}>−</button>
                    <span class="text-11-medium text-text-weak min-w-[3rem] text-center">{mediaZoomV1()}%</span>
                    <button class="text-xs px-2 py-0.5 rounded bg-surface-base hover:bg-surface-raised-base text-text-weak hover:text-text transition-colors" onClick={() => setMediaZoomV1((z) => Math.min(400, z + 25))}>+</button>
                    <button class="text-xs px-2 py-0.5 rounded bg-surface-base hover:bg-surface-raised-base text-text-weak hover:text-text transition-colors ml-1" onClick={() => setMediaZoomV1(100)}>Reset</button>
                    <div class="flex-1" />
                    <span class="text-11-regular text-text-faint">{m.ext.toUpperCase()} — {m.type}</span>
                  </div>
                  <div class="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-surface-base">
                    <Show when={m.type === "image"}>
                      <img src={url} alt={path() || "image"} class="max-w-full max-h-full object-contain rounded transition-transform duration-150" style={{ transform: `scale(${mediaZoomV1() / 100})`, "transform-origin": "center center" }} />
                    </Show>
                    <Show when={m.type === "audio"}>
                      <div class="flex flex-col items-center gap-4">
                        <div class="w-24 h-24 rounded-full bg-surface-raised-base flex items-center justify-center">
                          <svg class="w-12 h-12 text-text-weak" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        </div>
                        <audio controls class="w-full max-w-md" style={{ transform: `scale(${mediaZoomV1() / 100})`, "transform-origin": "center center" }}><source src={url} type={m.mime} /></audio>
                        <span class="text-12-regular text-text-weak">{path()?.split("/").pop()}</span>
                      </div>
                    </Show>
                    <Show when={m.type === "video"}>
                      <div class="flex flex-col items-center gap-4 w-full max-w-4xl">
                        <video controls class="max-w-full max-h-full rounded" style={{ transform: `scale(${mediaZoomV1() / 100})`, "transform-origin": "center center" }}><source src={url} type={m.mime} /></video>
                        <span class="text-12-regular text-text-weak">{path()?.split("/").pop()}</span>
                      </div>
                    </Show>
                  </div>
                </div>
              )
            })()}
          </Match>
          <Match when={state()?.loaded}>
            <MonacoEditor path={path() ?? ""} value={contents()} language={getLanguageFromPath(path() ?? "")} class="h-full w-full" onChange={(val) => { if (path()) autoSave(path()!, val) }} onSave={(val) => { if (path() && sdk().directory) { setSaveStatus("saving"); const absPath = sdk().directory + "/" + path()!; window.api.writeFile(absPath, val).then((r: boolean) => { if (r) { setSaveStatus("saved"); file.load(path()!, { force: true }).catch(() => {}) } else { setSaveStatus("idle") } }).catch(() => setSaveStatus("idle")) } }} />
          </Match>
        </Switch>
      </ScrollView>
      <Show when={saveStatus() !== "idle"}>
        <div class="absolute bottom-2 right-2 z-10 pointer-events-none">
          <span class={`text-11-medium px-2 py-0.5 rounded-md backdrop-blur-sm ${
            saveStatus() === "saving" ? "bg-surface-raised-base/80 text-text-weak" :
            saveStatus() === "dirty" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-green-500/20 text-green-400"
          }`}>
            {saveStatus() === "saving" ? "Saving..." : saveStatus() === "dirty" ? "Save" : "Saved"}
          </span>
        </div>
      </Show>
    </div>
  )
}

function SessionFileViewV2(props: { tab: string }) {
  const file = useFile()
  const comments = useComments()
  const language = useLanguage()
  const prompt = usePrompt()
  const fileComponent = useFileComponent()
  const sdk = useSDK()
  const { sessionKey, tabs, view } = useSessionLayout()
  const activeFileTab = createSessionTabs({
    tabs,
    pathFromTab: file.pathFromTab,
    normalizeTab: (tab) => (tab.startsWith("file://") ? file.tab(tab) : tab),
  }).activeFileTab

  let find: FileSearchHandle | null = null

  const search = {
    register: (handle: FileSearchHandle | null) => {
      find = handle
    },
  }

  const path = createMemo(() => file.pathFromTab(props.tab))
  const state = createMemo(() => {
    const p = path()
    if (!p) return
    return file.get(p)
  })
  const contents = createMemo(() => state()?.content?.content ?? "")
  const cacheKey = createMemo(() => sampledChecksum(contents()))
  const selectedLines = createMemo<SelectedLineRange | null>(() => {
    const p = path()
    if (!p) return null
    if (file.ready()) return (file.selectedLines(p) as SelectedLineRange | undefined) ?? null
    return (getSessionHandoff(sessionKey())?.files[p] as SelectedLineRange | undefined) ?? null
  })
  const scrollSync = createScrollSync({
    tab: () => props.tab,
    view,
  })

  const selectionPreview = (source: string, selection: FileSelection) => {
    return previewSelectedLines(source, {
      start: selection.startLine,
      end: selection.endLine,
    })
  }

  const buildPreview = (filePath: string, selection: FileSelection) => {
    const source = filePath === path() ? contents() : file.get(filePath)?.content?.content
    if (!source) return undefined
    return selectionPreview(source, selection)
  }

  const addCommentToContext = (input: {
    file: string
    selection: SelectedLineRange
    comment: string
    preview?: string
    origin?: "review" | "file"
  }) => {
    const selection = selectionFromLines(input.selection)
    const preview = input.preview ?? buildPreview(input.file, selection)

    const saved = comments.add({
      file: input.file,
      selection: input.selection,
      comment: input.comment,
    })
    prompt.context.add({
      type: "file",
      path: input.file,
      selection,
      comment: input.comment,
      commentID: saved.id,
      commentOrigin: input.origin,
      preview,
    })
  }

  const updateCommentInContext = (input: {
    id: string
    file: string
    selection: SelectedLineRange
    comment: string
  }) => {
    comments.update(input.file, input.id, input.comment)
    const preview = input.file === path() ? buildPreview(input.file, selectionFromLines(input.selection)) : undefined
    prompt.context.updateComment(input.file, input.id, {
      comment: input.comment,
      ...(preview ? { preview } : {}),
    })
  }

  const removeCommentFromContext = (input: { id: string; file: string }) => {
    comments.remove(input.file, input.id)
    prompt.context.removeComment(input.file, input.id)
  }

  const fileComments = createMemo(() => {
    const p = path()
    if (!p) return []
    return comments.list(p)
  })

  const commentedLines = createMemo(() => fileComments().map((comment) => comment.selection))

  const [note, setNote] = createStore({
    openedComment: null as string | null,
    commenting: null as SelectedLineRange | null,
    selected: null as SelectedLineRange | null,
  })

  const syncSelected = (range: SelectedLineRange | null) => {
    const p = path()
    if (!p) return
    file.setSelectedLines(p, range ? cloneSelectedLineRange(range) : null)
  }

  const activeSelection = () => note.selected ?? selectedLines()

  const commentsUi = createLineCommentControllerV2({
    comments: fileComments,
    label: language.t("ui.lineComment.submit"),
    draftKey: () => path() ?? props.tab,
    mention: {
      items: file.searchFilesAndDirectories,
    },
    getSide: (range) => range.endSide ?? range.side ?? "additions",
    state: {
      opened: () => note.openedComment,
      setOpened: (id) => setNote("openedComment", id),
      selected: () => note.selected,
      setSelected: (range) => setNote("selected", range),
      commenting: () => note.commenting,
      setCommenting: (range) => setNote("commenting", range),
      syncSelected,
      hoverSelected: syncSelected,
    },
    onSubmit: ({ comment, selection }) => {
      const p = path()
      if (!p) return
      addCommentToContext({ file: p, selection, comment, origin: "file" })
    },
    onUpdate: ({ id, comment, selection }) => {
      const p = path()
      if (!p) return
      updateCommentInContext({ id, file: p, selection, comment })
    },
    onDelete: (comment) => {
      const p = path()
      if (!p) return
      removeCommentFromContext({ id: comment.id, file: p })
    },
    editSubmitLabel: language.t("common.save"),
    renderCommentActions: (_, controls) => (
      <FileCommentMenuV2
        moreLabel={language.t("common.moreOptions")}
        editLabel={language.t("common.edit")}
        deleteLabel={language.t("common.delete")}
        onEdit={controls.edit}
        onDelete={controls.remove}
      />
    ),
  })

  createEffect(() => {
    if (typeof window === "undefined") return

    const onKeyDown = (event: KeyboardEvent) => {
      if (activeFileTab() !== props.tab) return
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== "f") return

      event.preventDefault()
      event.stopPropagation()
      find?.focus()
    }

    makeEventListener(window, "keydown", onKeyDown, { capture: true })
  })

  createEffect(
    on(
      path,
      () => {
        commentsUi.note.reset()
      },
      { defer: true },
    ),
  )

  createEffect(() => {
    const focus = comments.focus()
    const p = path()
    if (!focus || !p) return
    if (focus.file !== p) return
    if (activeFileTab() !== props.tab) return

    const target = fileComments().find((comment) => comment.id === focus.id)
    if (!target) return

    commentsUi.note.openComment(target.id, target.selection, { cancelDraft: true })
    requestAnimationFrame(() => comments.clearFocus())
  })

  let prev = {
    loaded: false,
    ready: false,
    active: false,
  }

  createEffect(() => {
    const loaded = !!state()?.loaded
    const ready = file.ready()
    const active = activeFileTab() === props.tab
    const restore = (loaded && !prev.loaded) || (ready && !prev.ready) || (active && loaded && !prev.active)
    prev = { loaded, ready, active }
    if (!restore) return
    scrollSync.queueRestore()
  })

  const renderFile = (source: string) => (
    <div class="relative overflow-hidden pb-40">
      <Dynamic
        component={fileComponent}
        mode="text"
        file={{
          name: path() ?? "",
          contents: source,
          cacheKey: cacheKey(),
        }}
        enableLineSelection
        selectedLines={activeSelection()}
        commentedLines={commentedLines()}
        onRendered={() => {
          scrollSync.queueRestore()
        }}
        onLineSelected={(range: SelectedLineRange | null) => {
          commentsUi.onLineSelected(range)
        }}
        onLineSelectionEnd={(range: SelectedLineRange | null) => {
          if (!range) {
            commentsUi.note.select(null)
            commentsUi.note.cancelDraft()
            return
          }
          commentsUi.onLineSelectionEnd(range)
        }}
        onLineNumberSelectionEnd={(range: SelectedLineRange | null) => {
          commentsUi.onLineNumberSelectionEnd(range)
        }}
        search={search}
        class="select-text [--zyraxon-diffs-bg:var(--v2-background-bg-base)]"
        media={{
          mode: "auto",
          path: path(),
          current: state()?.content,
          onLoad: scrollSync.queueRestore,
          onError: (args: { kind: "image" | "audio" | "svg" }) => {
            if (args.kind !== "svg") return
            showToast({
              variant: "error",
              title: language.t("toast.file.loadFailed.title"),
            })
          },
        }}
      />
    </div>
  )

  const [debounceTimerV2, setDebounceTimerV2] = createSignal<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatusV2, setSaveStatusV2] = createSignal<"idle" | "dirty" | "saving" | "saved">("idle")
  let saveTimerV2: ReturnType<typeof setTimeout> | null = null
  let lastSavedValueV2 = contents()

  const flushSaveV2 = () => {
    const timer = debounceTimerV2()
    if (timer) {
      clearTimeout(timer)
      setDebounceTimerV2(null)
      const val = lastSavedValueV2
      if (val && path()) {
        const api = (window as any).api
        if (api?.writeFile) {
          const absPath = sdk().directory + "/" + path()!
          api.writeFile(absPath, val).then((r: boolean) => {
            if (r) setSaveStatusV2("saved")
          }).catch(() => {})
        }
      }
    }
  }

  onCleanup(() => {
    flushSaveV2()
    if (saveTimerV2) clearTimeout(saveTimerV2)
  })

  const autoSaveV2 = (filePath: string, value: string) => {
    const prev = debounceTimerV2()
    if (prev) clearTimeout(prev)
    if (saveTimerV2) clearTimeout(saveTimerV2)
    if (value !== lastSavedValueV2) setSaveStatusV2("dirty")
    setDebounceTimerV2(setTimeout(async () => {
      setDebounceTimerV2(null)
      setSaveStatusV2("saving")
      try {
        if (value === lastSavedValueV2) {
          setSaveStatusV2("idle")
          return
        }
        const api = (window as any).api
        if (api?.writeFile) {
          const absPath = sdk().directory + "/" + filePath
          const writePromise = api.writeFile(absPath, value)
          const timeoutPromise = new Promise<false>((_, reject) => setTimeout(() => reject(new Error("write timeout")), 5000))
          const result = await Promise.race([writePromise, timeoutPromise])
          if (result === false) {
            setSaveStatusV2("idle")
          } else {
            lastSavedValueV2 = value
            setSaveStatusV2("saved")
            file.load(filePath, { force: true }).catch(() => {})
          }
        } else {
          setSaveStatusV2("idle")
        }
      } catch {
        setSaveStatusV2("idle")
      }
      saveTimerV2 = setTimeout(() => setSaveStatusV2("idle"), 2000)
    }, 800))
  }

  const mediaInfo = createMemo(() => {
    const p = path()
    if (!p) return null
    const ext = p.split(".").pop()?.toLowerCase() || ""
    const imageExts = ["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "ico", "tif", "tiff", "heic"]
    const audioExts = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "wma"]
    const videoExts = ["mp4", "webm", "mkv", "avi", "mov", "wmv", "flv", "m4v", "3gp"]
    const mimeMap: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", avif: "image/avif",
      bmp: "image/bmp", ico: "image/x-icon", tif: "image/tif",
      tiff: "image/tiff", heic: "image/heic", svg: "image/svg+xml",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg",
      m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac",
      opus: "audio/opus", wma: "audio/x-ms-wma",
      mp4: "video/mp4", webm: "video/webm", mkv: "video/x-matroska",
      avi: "video/x-msvideo", mov: "video/quicktime", wmv: "video/x-ms-wmv",
      flv: "video/x-flv", m4v: "video/x-m4v", "3gp": "video/3gpp",
    }
    if (imageExts.includes(ext)) return { type: "image" as const, mime: mimeMap[ext] || "image/png", ext }
    if (audioExts.includes(ext)) return { type: "audio" as const, mime: mimeMap[ext] || "audio/mpeg", ext }
    if (videoExts.includes(ext)) return { type: "video" as const, mime: mimeMap[ext] || "video/mp4", ext }
    if (ext === "svg") return { type: "image" as const, mime: "image/svg+xml", ext }
    return null
  })

  const mediaDataUrl = createMemo(() => {
    const media = mediaInfo()
    if (!media) return null
    const fileState = state()
    if (!fileState?.content?.content) return null
    const content = fileState.content.content
    if (content.startsWith("data:")) return content
    return `data:${media.mime};base64,${content}`
  })

  const [mediaZoom, setMediaZoom] = createSignal(100)

  const isMediaFile = createMemo(() => {
    const p = path()
    if (!p) return false
    const ext = p.split(".").pop()?.toLowerCase() || ""
    const mediaExts = ["png","jpg","jpeg","gif","webp","avif","bmp","ico","tif","tiff","heic","svg","mp3","wav","ogg","m4a","aac","flac","opus","wma","mp4","webm","mkv","avi","mov","wmv","flv","m4v","3gp"]
    return mediaExts.includes(ext)
  })

  return (
    <div class="mt-3 relative h-full min-h-0">
      <ScrollView class="h-full" viewportRef={scrollSync.setViewport} onScroll={scrollSync.handleScroll as any}>
        <Switch>
          <Match when={state()?.loading}>
            <div class="px-6 py-4 text-text-weak">{language.t("common.loading")}...</div>
          </Match>
          <Match when={state()?.error}>{(err) => <div class="px-6 py-4 text-text-weak">{err()}</div>}</Match>
          <Match when={isMediaFile() && mediaInfo() && mediaDataUrl()}>
            {(() => {
              const m = mediaInfo()!
              const url = mediaDataUrl()!
              return (
                <div class="flex flex-col h-full">
                  <div class="flex items-center gap-2 px-3 py-1.5 border-b border-border-base bg-surface-raised-base shrink-0">
                    <button class="text-xs px-2 py-0.5 rounded bg-surface-base hover:bg-surface-raised-base text-text-weak hover:text-text transition-colors" onClick={() => setMediaZoom((z) => Math.max(25, z - 25))}>−</button>
                    <span class="text-11-medium text-text-weak min-w-[3rem] text-center">{mediaZoom()}%</span>
                    <button class="text-xs px-2 py-0.5 rounded bg-surface-base hover:bg-surface-raised-base text-text-weak hover:text-text transition-colors" onClick={() => setMediaZoom((z) => Math.min(400, z + 25))}>+</button>
                    <button class="text-xs px-2 py-0.5 rounded bg-surface-base hover:bg-surface-raised-base text-text-weak hover:text-text transition-colors ml-1" onClick={() => setMediaZoom(100)}>Reset</button>
                    <div class="flex-1" />
                    <span class="text-11-regular text-text-faint">{m.ext.toUpperCase()} — {m.type}</span>
                  </div>
                  <div class="flex-1 min-h-0 overflow-auto flex items-center justify-center p-4 bg-surface-base">
                    <Show when={m.type === "image"}>
                      <img src={url} alt={path() || "image"} class="max-w-full max-h-full object-contain rounded transition-transform duration-150" style={{ transform: `scale(${mediaZoom() / 100})`, "transform-origin": "center center" }} />
                    </Show>
                    <Show when={m.type === "audio"}>
                      <div class="flex flex-col items-center gap-4">
                        <div class="w-24 h-24 rounded-full bg-surface-raised-base flex items-center justify-center">
                          <svg class="w-12 h-12 text-text-weak" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                        </div>
                        <audio controls class="w-full max-w-md" style={{ transform: `scale(${mediaZoom() / 100})`, "transform-origin": "center center" }}><source src={url} type={m.mime} /></audio>
                        <span class="text-12-regular text-text-weak">{path()?.split("/").pop()}</span>
                      </div>
                    </Show>
                    <Show when={m.type === "video"}>
                      <div class="flex flex-col items-center gap-4 w-full max-w-4xl">
                        <video controls class="max-w-full max-h-full rounded" style={{ transform: `scale(${mediaZoom() / 100})`, "transform-origin": "center center" }}><source src={url} type={m.mime} /></video>
                        <span class="text-12-regular text-text-weak">{path()?.split("/").pop()}</span>
                      </div>
                    </Show>
                  </div>
                </div>
              )
            })()}
          </Match>
          <Match when={state()?.loaded}>
            <MonacoEditor path={path() ?? ""} value={contents()} language={getLanguageFromPath(path() ?? "")} class="h-full w-full" onChange={(val) => { if (path()) autoSaveV2(path()!, val) }} onSave={(val) => { if (path() && sdk().directory) { setSaveStatusV2("saving"); const absPath = sdk().directory + "/" + path()!; window.api.writeFile(absPath, val).then((r: boolean) => { if (r) { setSaveStatusV2("saved"); file.load(path()!, { force: true }).catch(() => {}) } else { setSaveStatusV2("idle") } }).catch(() => setSaveStatusV2("idle")) } }} />
          </Match>
        </Switch>
      </ScrollView>
      <Show when={saveStatusV2() !== "idle"}>
        <div class="absolute bottom-2 right-2 z-10 pointer-events-none">
          <span class={`text-11-medium px-2 py-0.5 rounded-md backdrop-blur-sm ${
            saveStatusV2() === "saving" ? "bg-surface-raised-base/80 text-text-weak" :
            saveStatusV2() === "dirty" ? "bg-yellow-500/20 text-yellow-400" :
            "bg-green-500/20 text-green-400"
          }`}>
            {saveStatusV2() === "saving" ? "Saving..." : saveStatusV2() === "dirty" ? "Save" : "Saved"}
          </span>
        </div>
      </Show>
    </div>
  )
}
