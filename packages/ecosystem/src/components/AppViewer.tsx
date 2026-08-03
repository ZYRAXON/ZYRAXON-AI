/**
 * In-App Viewer Component
 * Renders HTML games, websites, and interactive content inside the ZYRAXON app
 * Supports iframes, sandboxed execution, and fullscreen mode
 */

import { createSignal, Show, onCleanup, type Component } from "solid-js"

interface AppViewerProps {
  url?: string
  html?: string
  title?: string
  type?: "website" | "game" | "embed"
  onClose?: () => void
  onError?: (error: string) => void
}

const VIEWER_STORAGE_KEY = "zyraxon_app_viewer_history"

interface ViewerHistoryItem {
  url: string
  title: string
  type: string
  viewedAt: string
}

function getHistory(): ViewerHistoryItem[] {
  try {
    const raw = localStorage.getItem(VIEWER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function addToHistory(item: ViewerHistoryItem): void {
  const history = getHistory()
  const filtered = history.filter((h) => h.url !== item.url)
  filtered.unshift(item)
  localStorage.setItem(VIEWER_STORAGE_KEY, JSON.stringify(filtered.slice(0, 50)))
}

export const AppViewer: Component<AppViewerProps> = (props) => {
  const [isLoading, setIsLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [isFullscreen, setIsFullscreen] = createSignal(false)
  const [history, setHistory] = createSignal(getHistory())

  let iframeRef: HTMLIFrameElement | undefined
  let containerRef: HTMLDivElement | undefined

  const getViewerUrl = (): string => {
    if (props.url) return props.url
    if (props.html) {
      const blob = new Blob([props.html], { type: "text/html" })
      return URL.createObjectURL(blob)
    }
    return ""
  }

  const handleLoad = () => {
    setIsLoading(false)
    const url = getViewerUrl()
    if (url) {
      addToHistory({
        url,
        title: props.title || "Untitled",
        type: props.type || "website",
        viewedAt: new Date().toISOString(),
      })
      setHistory(getHistory())
    }
  }

  const handleError = () => {
    setIsLoading(false)
    const msg = "Failed to load content"
    setError(msg)
    props.onError?.(msg)
  }

  const toggleFullscreen = () => {
    if (!containerRef) return
    if (!document.fullscreenElement) {
      containerRef.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const handleReload = () => {
    setIsLoading(true)
    setError(null)
    if (iframeRef) {
      iframeRef.src = iframeRef.src
    }
  }

  const handleOpenExternal = () => {
    const url = getViewerUrl()
    if (url) window.open(url, "_blank")
  }

  onCleanup(() => {
    const url = getViewerUrl()
    if (url && url.startsWith("blob:")) {
      URL.revokeObjectURL(url)
    }
  })

  const viewerUrl = getViewerUrl()

  return (
    <div class="fixed inset-0 z-50 flex flex-col bg-[#0d1117]">
      {/* Header */}
      <div class="flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#21262d]">
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div
              class={`w-3 h-3 rounded-full ${
                props.type === "game" ? "bg-[#f0883e]" : props.type === "embed" ? "bg-[#8957e5]" : "bg-[#238636]"
              }`}
            />
            <span class="text-sm font-medium text-[#c9d1d9]">{props.title || "App Viewer"}</span>
          </div>
          <Show when={isLoading()}>
            <span class="text-xs text-[#8b949e] animate-pulse">Loading...</span>
          </Show>
          <Show when={error()}>
            <span class="text-xs text-[#f85149]">{error()}</span>
          </Show>
        </div>
        <div class="flex items-center gap-1">
          <button
            onClick={handleReload}
            class="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
            title="Reload"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.001 7.001 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834zM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.001 7.001 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5z" />
            </svg>
          </button>
          <button
            onClick={toggleFullscreen}
            class="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
            title="Fullscreen"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.75 10a.75.75 0 0 1 .75.75v2.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 1 13.25v-2.5a.75.75 0 0 1 .75-.75zm12.5 0a.75.75 0 0 1 .75.75v2.5A1.75 1.75 0 0 1 13.25 15h-2.5a.75.75 0 0 1 0-1.5h2.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 .75-.75zM2.75 2a.75.75 0 0 0-.75.75v2.5c0 .138.112.25.25.25h2.5a.75.75 0 0 0 0-1.5h-2.5A.25.25 0 0 0 3 3.25V2.75A.75.75 0 0 0 2.75 2zm10.5 0A.75.75 0 0 0 12.5 2.75v.5c0 .138.112.25.25.25h2.5a.75.75 0 0 0 0-1.5h-2.5a.25.25 0 0 0-.25.25v-.5z" />
            </svg>
          </button>
          <Show when={props.url}>
            <button
              onClick={handleOpenExternal}
              class="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
              title="Open in Browser"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.75 2h3.5a.75.75 0 0 1 0 1.5h-3.5a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-3.5a.75.75 0 0 1 1.5 0v3.5A1.75 1.75 0 0 1 12.25 14h-8.5A1.75 1.75 0 0 1 2 12.25v-8.5C2 2.784 2.784 2 3.75 2zm6.854-1h4.146a.25.25 0 0 1 .25.25v4.146a.25.25 0 0 1-.427.177L13.03 4.03 9.28 7.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.75-3.75-1.543-1.543A.25.25 0 0 1 10.604 2z" />
              </svg>
            </button>
          </Show>
          <Show when={props.onClose}>
            <button
              onClick={props.onClose}
              class="p-2 hover:bg-[#21262d] rounded-lg text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
              </svg>
            </button>
          </Show>
        </div>
      </div>

      {/* Content */}
      <div ref={containerRef} class="flex-1 relative">
        <Show when={isLoading() && !error()}>
          <div class="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
            <div class="flex flex-col items-center gap-3">
              <div class="w-8 h-8 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
              <span class="text-sm text-[#8b949e]">Loading {props.type === "game" ? "game" : "content"}...</span>
            </div>
          </div>
        </Show>
        <Show when={error()}>
          <div class="absolute inset-0 flex items-center justify-center bg-[#0d1117]">
            <div class="flex flex-col items-center gap-3 text-center">
              <svg width="48" height="48" viewBox="0 0 16 16" fill="#f85149">
                <path d="M2.343 13.657A8 8 0 1 1 13.658 2.343 8 8 0 0 1 2.343 13.657zM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94 6.03 4.97z" />
              </svg>
              <span class="text-sm text-[#f85149]">{error()}</span>
              <button
                onClick={handleReload}
                class="px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-lg text-sm transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </Show>
        <Show when={viewerUrl}>
          <iframe
            ref={iframeRef}
            src={viewerUrl}
            class="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads"
            allow="accelerometer; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi"
            onLoad={handleLoad}
            onError={handleError}
            title={props.title || "App Viewer"}
          />
        </Show>
      </div>
    </div>
  )
}

/**
 * Compact viewer for inline preview (not fullscreen)
 */
export const InlineViewer: Component<AppViewerProps> = (props) => {
  const [isLoading, setIsLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  let iframeRef: HTMLIFrameElement | undefined

  const viewerUrl = (() => {
    if (props.url) return props.url
    if (props.html) {
      const blob = new Blob([props.html], { type: "text/html" })
      return URL.createObjectURL(blob)
    }
    return ""
  })()

  return (
    <div class="relative rounded-xl overflow-hidden border border-[#21262d] bg-[#0d1117]">
      <Show when={isLoading()}>
        <div class="absolute inset-0 flex items-center justify-center bg-[#0d1117] z-10">
          <div class="w-6 h-6 border-2 border-[#58a6ff] border-t-transparent rounded-full animate-spin" />
        </div>
      </Show>
      <Show when={error()}>
        <div class="absolute inset-0 flex items-center justify-center bg-[#0d1117] z-10">
          <span class="text-xs text-[#f85149]">{error()}</span>
        </div>
      </Show>
      <Show when={viewerUrl}>
        <iframe
          ref={iframeRef}
          src={viewerUrl}
          class="w-full h-64 border-0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads allow-top-navigation"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false)
            setError("Failed to load")
          }}
          title={props.title || "Preview"}
        />
      </Show>
    </div>
  )
}

/**
 * Get viewer history
 */
export function getViewerHistory(): ViewerHistoryItem[] {
  return getHistory()
}

/**
 * Clear viewer history
 */
export function clearViewerHistory(): void {
  localStorage.removeItem(VIEWER_STORAGE_KEY)
}
