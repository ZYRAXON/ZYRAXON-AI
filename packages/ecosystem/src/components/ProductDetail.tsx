import { type Component, createSignal, Show, For } from "solid-js"
import type { EcosystemItem } from "../types"
import { LikeButton } from "./LikeButton"
import { ShareButton } from "./ShareButton"
import { CommentSection } from "./CommentSection"
import { getAuthState } from "../services/auth"
import { incrementDownload } from "../services/shared-data"
import { installItemInApp } from "../services/download"
import {
  IconX, IconExternalLink, IconDownload, IconStar, IconCalendar,
  IconCode, IconChevronLeft, IconChevronRight, IconMaximize,
  IconArrowLeft, IconUser, IconCheck, IconLoader, IconCopy
} from "./Icons"

interface ProductDetailProps {
  item: EcosystemItem | null
  onClose: () => void
  onInstall?: (item: EcosystemItem) => void
}

function getActionConfig(item: EcosystemItem) {
  const cat = item.category
  const type = item.type

  if (cat === "website-templates" || cat === "landing-pages" || type === "template" || type === "landing-page") {
    return {
      label: "View Live Site",
      icon: "external" as const,
      color: "bg-[#238636] hover:bg-[#2ea043]",
    }
  }
  if (cat === "desktop-apps" || type === "desktop-app") {
    return {
      label: "Download",
      icon: "download" as const,
      color: "bg-[#1f6feb] hover:bg-[#388bfd]",
      platforms: item.platforms || ["windows", "macos", "linux"],
    }
  }
  if (cat === "mobile-apps" || type === "app") {
    return {
      label: "Download APK",
      icon: "download" as const,
      color: "bg-[#238636] hover:bg-[#2ea043]",
      platforms: item.platforms || ["android", "ios"],
    }
  }
  if (cat === "iso-images" || type === "iso") {
    return {
      label: "Download ISO",
      icon: "download" as const,
      color: "bg-[#e3b341] hover:bg-[#d29922]",
      platforms: item.platforms || ["linux"],
    }
  }
  if (cat === "website-games" || type === "website-game") {
    return {
      label: "Play Game",
      icon: "external" as const,
      color: "bg-[#f0883e] hover:bg-[#d29922]",
    }
  }
  if (cat === "plugins" || type === "plugin") {
    return {
      label: "Install Plugin",
      icon: "install" as const,
      color: "bg-[#238636] hover:bg-[#2ea043]",
    }
  }
  if (cat === "ai-bots" || type === "bot") {
    return {
      label: "Import to ZYRAXON",
      icon: "install" as const,
      color: "bg-[#8957e5] hover:bg-[#a371f7]",
    }
  }
  if (cat === "pdfs" || cat === "books" || type === "pdf" || type === "book") {
    return {
      label: "Download PDF",
      icon: "download" as const,
      color: "bg-[#f0883e] hover:bg-[#d29922]",
    }
  }
  if (cat === "cli-tools" || type === "cli") {
    return {
      label: "Copy Install Command",
      icon: "copy" as const,
      color: "bg-[#21262d] hover:bg-[#30363d]",
    }
  }
  if (cat === "fonts" || type === "font") {
    return {
      label: "Download Font",
      icon: "download" as const,
      color: "bg-[#f778ba] hover:bg-[#db61a2]",
    }
  }
  if (cat === "datasets" || type === "dataset") {
    return {
      label: "Download Dataset",
      icon: "download" as const,
      color: "bg-[#8b949e] hover:bg-[#adbac7]",
    }
  }
  if (cat === "devops" || type === "devops") {
    return {
      label: "Copy Command",
      icon: "copy" as const,
      color: "bg-[#58a6ff] hover:bg-[#79c0ff]",
    }
  }
  return {
    label: "View on GitHub",
    icon: "external" as const,
    color: "bg-[#238636] hover:bg-[#2ea043]",
  }
}

function PlatformBadge({ platform }: { platform: string }) {
  const labels: Record<string, string> = {
    windows: "Windows", macos: "macOS", linux: "Linux",
    android: "Android", ios: "iOS", web: "Web",
  }
  const colors: Record<string, string> = {
    windows: "bg-[#1f6feb]/20 text-[#58a6ff]",
    macos: "bg-[#8b949e]/20 text-[#c9d1d9]",
    linux: "bg-[#e3b341]/20 text-[#e3b341]",
    android: "bg-[#3fb950]/20 text-[#3fb950]",
    ios: "bg-[#8b949e]/20 text-[#c9d1d9]",
    web: "bg-[#58a6ff]/20 text-[#58a6ff]",
  }
  return (
    <span class={`px-2 py-0.5 rounded text-[10px] font-medium ${colors[platform] || "bg-[#30363d] text-[#8b949e]"}`}>
      {labels[platform] || platform}
    </span>
  )
}

export const ProductDetail: Component<ProductDetailProps> = (props) => {
  const [isInstalling, setIsInstalling] = createSignal(false)
  const [isInstalled, setIsInstalled] = createSignal(false)
  const [copiedCmd, setCopiedCmd] = createSignal(false)
  const [comments, setComments] = createSignal<any[]>([])
  const [currentScreenshot, setCurrentScreenshot] = createSignal(0)
  const [showPreview, setShowPreview] = createSignal(false)
  const auth = getAuthState()

  const handleBackdropClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains("modal-backdrop")) {
      props.onClose()
    }
  }

  const handleCommentAdded = (comment: any) => {
    setComments([comment, ...comments()])
  }

  const screenshots = () => props.item?.screenshots || []
  const nextScreenshot = () => {
    const s = screenshots()
    if (s.length > 0) setCurrentScreenshot((currentScreenshot() + 1) % s.length)
  }
  const prevScreenshot = () => {
    const s = screenshots()
    if (s.length > 0) setCurrentScreenshot((currentScreenshot() - 1 + s.length) % s.length)
  }

  const handlePrimaryAction = () => {
    if (!props.item || isInstalled() || isInstalling()) return
    const config = getActionConfig(props.item)
    const item = props.item

    if (config.icon === "copy") {
      const cmd = item.installCommand || `npx ${item.npmPackage || item.name.toLowerCase().replace(/\s+/g, "-")}`
      navigator.clipboard.writeText(cmd).catch(() => {
        const ta = document.createElement("textarea")
        ta.value = cmd
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      })
      setCopiedCmd(true)
      setTimeout(() => setCopiedCmd(false), 2000)
      return
    }

    if (config.icon === "external") {
      const item = props.item!
      if (item.category === "website-games" || item.type === "website-game") {
        setShowPreview(true)
        return
      }
      const url = item.liveDemo || item.githubRepo
      if (url) window.open(url, "_blank")
      setIsInstalled(true)
      return
    }

    if (config.icon === "download") {
      // Download directly inside the app — never an external window
      installItemInApp(item)
      incrementDownload(item.id).catch(() => {})
      setIsInstalled(true)
      return
    }

    if (config.icon === "install") {
      // Inside the app: install/download the item directly
      const didInstall = installItemInApp(item)
      if (didInstall) {
        incrementDownload(item.id).catch(() => {})
        setIsInstalled(true)
        return
      }
      setIsInstalling(true)
      setTimeout(() => {
        setIsInstalling(false)
        setIsInstalled(true)
        props.onInstall?.(item)
      }, 1500)
      return
    }

    const url = item.liveDemo || item.downloadUrl || item.githubRepo
    if (url) window.open(url, "_blank")
    setIsInstalled(true)
  }

  const actionConfig = () => props.item ? getActionConfig(props.item) : null

  return (
    <Show when={props.item}>
      <div class="modal-backdrop fixed inset-0 z-50 bg-[#0d1117] overflow-y-auto" onClick={handleBackdropClick}>
        <div class="min-h-screen">
          <div class="sticky top-0 z-10 bg-[#0d1117]/95 backdrop-blur border-b border-[#21262d] px-6 py-3">
            <div class="max-w-5xl mx-auto flex items-center justify-between">
              <button onClick={props.onClose} class="flex items-center gap-2 px-3 py-1.5 text-sm text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors">
                <IconArrowLeft size={16} />
                Back
              </button>
              <div class="flex items-center gap-3">
                <ShareButton itemId={props.item!.id} itemName={props.item!.name} />
                <Show when={props.item!.githubRepo}>
                  <a href={props.item!.githubRepo} target="_blank" rel="noopener noreferrer" class="flex items-center gap-2 px-4 py-2 bg-[#21262d] hover:bg-[#30363d] text-[#c9d1d9] rounded-lg text-sm transition-colors">
                    <IconCode size={14} />
                    Source Code
                  </a>
                </Show>
                <Show when={actionConfig()}>
                  <Show
                    when={!isInstalled()}
                    fallback={
                      <span class="flex items-center gap-2 px-4 py-2 bg-[#238636]/20 text-[#3fb950] rounded-lg text-sm font-medium">
                        <IconCheck size={14} />
                        {actionConfig()!.icon === "copy" ? "Copied!" : actionConfig()!.icon === "download" ? "Opened" : "Done"}
                      </span>
                    }
                  >
                    <button
                      onClick={handlePrimaryAction}
                      disabled={isInstalling()}
                      class={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors text-white ${
                        isInstalling() ? "bg-[#21262d] text-[#8b949e] cursor-wait" : actionConfig()!.color
                      }`}
                    >
                      {isInstalling() ? (
                        <IconLoader size={14} />
                      ) : actionConfig()!.icon === "download" ? (
                        <IconDownload size={14} />
                      ) : actionConfig()!.icon === "copy" ? (
                        copiedCmd() ? <IconCheck size={14} /> : <IconCopy size={14} />
                      ) : actionConfig()!.icon === "external" ? (
                        <IconExternalLink size={14} />
                      ) : (
                        <IconCheck size={14} />
                      )}
                      {isInstalling()
                        ? "Installing..."
                        : actionConfig()!.icon === "copy"
                        ? (copiedCmd() ? "Copied!" : "Copy Command")
                        : actionConfig()!.label}
                    </button>
                  </Show>
                </Show>
              </div>
            </div>
          </div>

          <div class="max-w-5xl mx-auto px-6 py-8">
            <div class="h-80 rounded-2xl overflow-hidden mb-8 relative bg-gradient-to-br from-[#1f6feb] to-[#8957e5]">
              <Show when={props.item!.coverImage}>
                <img src={props.item!.coverImage} alt={props.item!.name} class="w-full h-full object-cover" />
              </Show>
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div class="absolute bottom-0 left-0 right-0 p-8">
                <div class="flex items-end gap-4">
                  <Show when={props.item!.logo}>
                    <img src={props.item!.logo} alt="" class="w-16 h-16 rounded-xl border-2 border-white/20 bg-white/10" />
                  </Show>
                  <Show when={!props.item!.logo}>
                    <div class="w-16 h-16 rounded-xl border-2 border-white/20 bg-white/10 flex items-center justify-center text-white text-2xl font-bold">
                      {props.item!.name.charAt(0)}
                    </div>
                  </Show>
                  <div class="flex-1">
                    <h1 class="text-3xl font-bold text-white mb-1">{props.item!.name}</h1>
                    <div class="flex items-center gap-2">
                      <Show when={props.item!.authorAvatar}>
                        <img src={props.item!.authorAvatar} alt="" class="w-5 h-5 rounded-full" />
                      </Show>
                      <p class="text-white/70 text-sm">by {props.item!.author}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-6 mb-8">
              <div class="col-span-2">
                <div class="flex items-center gap-3 mb-4">
                  <span class="px-3 py-1 bg-[#1f6feb]/20 text-[#58a6ff] rounded-full text-xs font-medium">{props.item!.category}</span>
                  <span class="px-3 py-1 bg-[#21262d] text-[#8b949e] rounded-full text-xs font-medium">v{props.item!.version}</span>
                  <Show when={props.item!.verified}>
                    <span class="flex items-center gap-1 px-3 py-1 bg-[#238636]/20 text-[#3fb950] rounded-full text-xs font-medium">
                      <IconCheck size={12} /> Verified
                    </span>
                  </Show>
                  <Show when={props.item!.license}>
                    <span class="px-3 py-1 bg-[#21262d] text-[#8b949e] rounded-full text-xs font-medium">{props.item!.license}</span>
                  </Show>
                </div>

                <Show when={props.item!.platforms && props.item!.platforms!.length > 0}>
                  <div class="flex items-center gap-2 mb-4">
                    <span class="text-xs text-[#8b949e]">Platforms:</span>
                    <For each={props.item!.platforms!}>
                      {(p) => <PlatformBadge platform={p} />}
                    </For>
                  </div>
                </Show>

                <p class="text-[#c9d1d9] leading-relaxed mb-6">{props.item!.description}</p>

                <div class="flex flex-wrap gap-2 mb-6">
                  <For each={props.item!.tags}>
                    {(tag) => (
                      <span class="px-3 py-1 bg-[#21262d] rounded-full text-xs text-[#8b949e] hover:text-[#c9d1d9] cursor-pointer transition-colors">{tag}</span>
                    )}
                  </For>
                </div>

                <Show when={props.item!.installCommand}>
                  <div class="mb-6">
                    <h3 class="text-sm font-semibold text-[#c9d1d9] mb-2">Quick Install</h3>
                    <div class="flex items-center gap-2 bg-[#0d1117] border border-[#21262d] rounded-lg px-4 py-3">
                      <code class="flex-1 text-sm text-[#58a6ff] font-mono">{props.item!.installCommand}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(props.item!.installCommand!)
                          setCopiedCmd(true)
                          setTimeout(() => setCopiedCmd(false), 2000)
                        }}
                        class="p-1.5 hover:bg-[#21262d] rounded-lg transition-colors"
                      >
                        {copiedCmd() ? <IconCheck size={14} class="text-[#3fb950]" /> : <IconCopy size={14} class="text-[#8b949e]" />}
                      </button>
                    </div>
                  </div>
                </Show>

                <Show when={screenshots().length > 0}>
                  <div class="mb-8">
                    <h3 class="text-sm font-semibold text-[#c9d1d9] mb-3">Screenshots</h3>
                    <div class="relative rounded-xl overflow-hidden bg-[#161b22] border border-[#21262d]">
                      <img src={screenshots()[currentScreenshot()]} alt="Screenshot" class="w-full h-64 object-contain" />
                      <Show when={screenshots().length > 1}>
                        <button onClick={prevScreenshot} class="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors">
                          <IconChevronLeft size={16} />
                        </button>
                        <button onClick={nextScreenshot} class="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors">
                          <IconChevronRight size={16} />
                        </button>
                        <div class="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                          <For each={screenshots()}>
                            {(_, i) => (
                              <button onClick={() => setCurrentScreenshot(i())} class={`w-2 h-2 rounded-full transition-colors ${currentScreenshot() === i() ? "bg-white" : "bg-white/40"}`} />
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  </div>
                </Show>

                <Show when={props.item!.liveDemo || (props.item!.category === "website-games" && props.item!.githubRepo)}>
                  <div class="mb-6">
                    <div class="flex items-center justify-between mb-2">
                      <h3 class="text-sm font-semibold text-[#c9d1d9]">{props.item!.category === "website-games" ? "Game Preview" : "Live Preview"}</h3>
                      <div class="flex items-center gap-2">
                        <button onClick={() => setShowPreview(!showPreview())} class="text-xs text-[#58a6ff] hover:underline">
                          {showPreview() ? "Hide" : "Show"} Preview
                        </button>
                        <Show when={showPreview()}>
                          <button
                            onClick={() => {
                              const iframe = document.querySelector('#game-preview-iframe') as HTMLIFrameElement
                              if (iframe?.requestFullscreen) iframe.requestFullscreen()
                            }}
                            class="flex items-center gap-1 text-xs text-[#58a6ff] hover:underline"
                          >
                            <IconMaximize size={12} /> Fullscreen
                          </button>
                        </Show>
                      </div>
                    </div>
                    <Show when={showPreview()}>
                      <div class="rounded-xl overflow-hidden border border-[#21262d] bg-[#0d1117]">
                        <iframe
                          id="game-preview-iframe"
                          src={props.item!.liveDemo || props.item!.githubRepo}
                          class="w-full border-0"
                          style={{ height: "min(70vh, 600px)" }}
                          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals allow-downloads allow-top-navigation"
                          title="Live Preview"
                        />
                      </div>
                    </Show>
                  </div>
                </Show>

                <div class="border-t border-[#21262d] pt-6">
                  <h3 class="text-sm font-semibold text-[#c9d1d9] mb-4">Comments ({comments().length})</h3>
                  <CommentSection itemId={props.item!.id} comments={comments()} onCommentAdded={handleCommentAdded} />
                </div>
              </div>

              <div class="col-span-1 space-y-4">
                <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                  <div class="flex items-center gap-3 mb-4">
                    <Show when={props.item!.authorAvatar}>
                      <img src={props.item!.authorAvatar} alt="" class="w-10 h-10 rounded-full bg-[#21262d]" />
                    </Show>
                    <Show when={!props.item!.authorAvatar}>
                      <div class="w-10 h-10 rounded-full bg-[#21262d] flex items-center justify-center">
                        <IconUser class="text-[#8b949e]" size={16} />
                      </div>
                    </Show>
                    <div>
                      <p class="text-sm font-medium text-[#c9d1d9]">{props.item!.author}</p>
                      <p class="text-xs text-[#8b949e]">Publisher</p>
                    </div>
                  </div>
                </div>

                <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-4 space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-[#8b949e]">Rating</span>
                    <span class="flex items-center gap-1 text-sm text-[#e3b341]">
                      <IconStar size={14} /> {props.item!.rating.toFixed(1)}
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-[#8b949e]">Downloads</span>
                    <span class="text-sm text-[#c9d1d9]">{props.item!.downloads.toLocaleString()}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-[#8b949e]">Likes</span>
                    <span class="text-sm text-[#c9d1d9]">{props.item!.likeCount}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-[#8b949e]">Version</span>
                    <span class="text-sm text-[#c9d1d9]">{props.item!.version}</span>
                  </div>
                  <Show when={props.item!.fileSize}>
                    <div class="flex items-center justify-between">
                      <span class="text-xs text-[#8b949e]">File Size</span>
                      <span class="text-sm text-[#c9d1d9]">{props.item!.fileSize}</span>
                    </div>
                  </Show>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-[#8b949e]">Updated</span>
                    <span class="text-sm text-[#c9d1d9]">{new Date(props.item!.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                  <div class="flex items-center gap-3">
                    <LikeButton itemId={props.item!.id} initialLikeCount={props.item!.likeCount} />
                  </div>
                </div>

                <Show when={props.item!.socialLinks}>
                  <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-4">
                    <p class="text-xs text-[#8b949e] mb-3">Social Links</p>
                    <div class="flex flex-wrap gap-2">
                      <For each={Object.entries(props.item!.socialLinks || {})}>
                        {([platform, url]) => (
                          <a href={url as string} target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-[#21262d] hover:bg-[#30363d] rounded-lg text-xs text-[#8b949e] hover:text-[#c9d1d9] transition-colors capitalize">
                            {platform}
                          </a>
                        )}
                      </For>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Show>
  )
}
