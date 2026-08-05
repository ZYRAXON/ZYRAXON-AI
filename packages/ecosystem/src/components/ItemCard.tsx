import { type Component, createSignal, For, Show } from "solid-js"
import type { EcosystemItem } from "../types"
import { IconStar, IconHeart, IconHeartOutline, IconDownload, IconCheck, IconShare, IconMessageSquare, IconExternalLink, IconCopy, IconCode } from "./Icons"
import { getAuthState } from "../services/auth"
import { installItemInApp } from "../services/download"
import { getLikeCount, getUserLikes, toggleLike } from "../services/shared-data"

interface ItemCardProps {
  item: EcosystemItem
  onInstall?: (item: EcosystemItem) => void
  onClick?: (item: EcosystemItem) => void
  onUserClick?: (username: string) => void
}

const typeColors: Record<string, string> = {
  plugin: "bg-[#238636]/20 text-[#3fb950]",
  bot: "bg-[#8957e5]/20 text-[#bc8cff]",
  template: "bg-[#1f6feb]/20 text-[#58a6ff]",
  model: "bg-[#f0883e]/20 text-[#f0883e]",
  tool: "bg-[#3fb950]/20 text-[#3fb950]",
  sdk: "bg-[#58a6ff]/20 text-[#58a6ff]",
  api: "bg-[#e3b341]/20 text-[#e3b341]",
  app: "bg-[#f778ba]/20 text-[#f778ba]",
  extension: "bg-[#79c0ff]/20 text-[#79c0ff]",
  cli: "bg-[#8b949e]/20 text-[#c9d1d9]",
  workflow: "bg-[#d2a8ff]/20 text-[#d2a8ff]",
  "desktop-app": "bg-[#1f6feb]/20 text-[#58a6ff]",
  iso: "bg-[#e3b341]/20 text-[#e3b341]",
  font: "bg-[#f778ba]/20 text-[#f778ba]",
  snippet: "bg-[#79c0ff]/20 text-[#79c0ff]",
  devops: "bg-[#58a6ff]/20 text-[#58a6ff]",
  "landing-page": "bg-[#3fb950]/20 text-[#3fb950]",
  component: "bg-[#79c0ff]/20 text-[#79c0ff]",
  theme: "bg-[#d2a8ff]/20 text-[#d2a8ff]",
  startkit: "bg-[#f0883e]/20 text-[#f0883e]",
  pdf: "bg-[#f0883e]/20 text-[#f0883e]",
  book: "bg-[#f0883e]/20 text-[#f0883e]",
  dataset: "bg-[#8b949e]/20 text-[#c9d1d9]",
  icon: "bg-[#f778ba]/20 text-[#f778ba]",
  "ui-kit": "bg-[#d2a8ff]/20 text-[#d2a8ff]",
  prompt: "bg-[#8957e5]/20 text-[#bc8cff]",
}

function getActionInfo(item: EcosystemItem) {
  const cat = item.category
  const type = item.type

  if (cat === "website-templates" || cat === "landing-pages" || type === "template" || type === "landing-page") {
    return { label: "View Live", icon: "external" as const, color: "bg-[#238636] hover:bg-[#2ea043]" }
  }
  if (cat === "desktop-apps" || type === "desktop-app") {
    return { label: "Download", icon: "download" as const, color: "bg-[#1f6feb] hover:bg-[#388bfd]" }
  }
  if (cat === "mobile-apps" || type === "app") {
    return { label: "Download APK", icon: "download" as const, color: "bg-[#238636] hover:bg-[#2ea043]" }
  }
  if (cat === "iso-images" || type === "iso") {
    return { label: "Download ISO", icon: "download" as const, color: "bg-[#e3b341] hover:bg-[#d29922]" }
  }
  if (cat === "plugins" || type === "plugin") {
    return { label: "Install", icon: "install" as const, color: "bg-[#238636] hover:bg-[#2ea043]" }
  }
  if (cat === "ai-bots" || type === "bot") {
    return { label: "Import", icon: "install" as const, color: "bg-[#8957e5] hover:bg-[#a371f7]" }
  }
  if (cat === "pdfs" || cat === "books" || type === "pdf" || type === "book") {
    return { label: "Download", icon: "download" as const, color: "bg-[#f0883e] hover:bg-[#d29922]" }
  }
  if (cat === "cli-tools" || type === "cli") {
    return { label: "Copy Command", icon: "copy" as const, color: "bg-[#21262d] hover:bg-[#30363d]" }
  }
  if (cat === "fonts" || type === "font") {
    return { label: "Download", icon: "download" as const, color: "bg-[#f778ba] hover:bg-[#db61a2]" }
  }
  if (cat === "datasets" || type === "dataset") {
    return { label: "Download", icon: "download" as const, color: "bg-[#8b949e] hover:bg-[#adbac7]" }
  }
  if (cat === "devops" || type === "devops") {
    return { label: "Copy Command", icon: "copy" as const, color: "bg-[#58a6ff] hover:bg-[#79c0ff]" }
  }
  return { label: "View", icon: "external" as const, color: "bg-[#238636] hover:bg-[#2ea043]" }
}

export const ItemCard: Component<ItemCardProps> = (props) => {
  const [isInstalling, setIsInstalling] = createSignal(false)
  const [isInstalled, setIsInstalled] = createSignal(false)
  const [isLiked, setIsLiked] = createSignal(false)
  const [likeCount, setLikeCount] = createSignal(props.item.likeCount)
  const [showShareDropdown, setShowShareDropdown] = createSignal(false)
  const [copiedLink, setCopiedLink] = createSignal(false)
  const [copiedCmd, setCopiedCmd] = createSignal(false)
  const auth = getAuthState()

  const itemUrl = () => `https://zyraxonai.lovable.app/ecosystem/item/${props.item.id}`
  const actionInfo = () => getActionInfo(props.item)

  const handleLike = async (e: MouseEvent) => {
    e.stopPropagation()
    if (!auth.isAuthenticated || !auth.user) return
    try {
      const result = await toggleLike(props.item.id, auth.user.id)
      setIsLiked(result.liked)
      setLikeCount(result.count)
    } catch {}
  }

  const handleCopyLink = async (e: MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(itemUrl())
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleShare = (platform: string, e: MouseEvent) => {
    e.stopPropagation()
    const url = encodeURIComponent(itemUrl())
    const text = encodeURIComponent(`Check out ${props.item.name} on ZYRAXON Ecosystem!`)
    const urls: Record<string, string> = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      twitter: `https://twitter.com/intent/tweet?text=${text}&url=${url}`,
      telegram: `https://t.me/share/url?url=${url}&text=${text}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
      reddit: `https://reddit.com/submit?url=${url}&title=${text}`,
    }
    if (urls[platform]) window.open(urls[platform], "_blank")
    setShowShareDropdown(false)
  }

  const handleAction = (e: MouseEvent) => {
    e.stopPropagation()
    if (isInstalled() || isInstalling()) return
    const action = actionInfo()
    const item = props.item

    if (action.icon === "copy") {
      const cmd = item.installCommand || `npx ${item.npmPackage || item.name.toLowerCase().replace(/\s+/g, "-")}`
      navigator.clipboard.writeText(cmd)
      setCopiedCmd(true)
      setTimeout(() => setCopiedCmd(false), 2000)
      return
    }

    if (action.icon === "external" && (item.liveDemo || item.githubRepo)) {
      window.open(item.liveDemo || item.githubRepo, "_blank")
      setIsInstalled(true)
      setActionDone()
      return
    }

    if (action.icon === "download") {
      // Download directly inside the app — never an external window
      installItemInApp(item)
      setIsInstalled(true)
      setActionDone()
      return
    }

    if (action.icon === "install") {
      // Inside the app: install/download the item directly
      const didInstall = installItemInApp(item)
      if (didInstall) {
        setIsInstalled(true)
        setActionDone()
        return
      }
    }

    setIsInstalling(true)
    setTimeout(() => {
      setIsInstalling(false)
      setIsInstalled(true)
      props.onInstall?.(item)
    }, 1500)
  }

  const setActionDone = () => {
    setIsInstalled(true)
    props.onInstall?.(props.item)
  }

  return (
    <div
      onClick={() => props.onClick?.(props.item)}
      class="flex flex-col p-4 bg-[#161b22] border border-[#21262d] rounded-xl hover:border-[#30363d] transition-all duration-200 cursor-pointer group"
    >
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-lg bg-[#21262d] flex items-center justify-center text-lg font-bold text-[#58a6ff]">
            {props.item.name.charAt(0)}
          </div>
          <div>
            <h3 class="text-sm font-medium text-[#c9d1d9] group-hover:text-[#58a6ff] transition-colors">
              {props.item.name}
            </h3>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                props.onUserClick?.(props.item.author)
              }}
              class="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
            >
              <Show when={props.item.authorAvatar}>
                <img src={props.item.authorAvatar} alt="" class="w-4 h-4 rounded-full bg-[#21262d]" />
              </Show>
              <p class="text-xs text-[#58a6ff] hover:underline">by {typeof props.item.author === "string" ? props.item.author : (props.item.author as any)?.name || "Unknown"}</p>
            </button>
          </div>
        </div>
        <span class={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColors[props.item.type] || "bg-[#30363d] text-[#8b949e]"}`}>
          {props.item.type}
        </span>
      </div>

      <p class="text-xs text-[#8b949e] mb-3 line-clamp-2">{props.item.description}</p>

      <div class="flex items-center gap-4 text-xs text-[#8b949e] mb-3">
        <span class="flex items-center gap-1">
          <IconStar size={12} class="text-[#e3b341]" />
          {props.item.rating.toFixed(1)}
        </span>
        <span class="flex items-center gap-1">
          <IconDownload size={12} />
          {props.item.downloads.toLocaleString()}
        </span>
        <span class="flex items-center gap-1">
          <IconMessageSquare size={12} />
          {props.item.commentCount || 0}
        </span>
      </div>

      <div class="flex items-center justify-between mt-auto">
        <div class="flex gap-1">
          <For each={props.item.tags.slice(0, 3)}>
            {(tag) => (
              <span class="px-2 py-0.5 bg-[#21262d] rounded text-xs text-[#8b949e]">{tag}</span>
            )}
          </For>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            onClick={handleLike}
            class={`p-1.5 rounded-lg text-xs transition-colors ${
              isLiked()
                ? "bg-[#f85149]/10 text-[#f85149]"
                : "bg-[#21262d] text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9]"
            }`}
          >
            {isLiked() ? <IconHeart size={12} /> : <IconHeartOutline size={12} />}
          </button>
          <div class="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setShowShareDropdown(!showShareDropdown())
              }}
              class="p-1.5 bg-[#21262d] text-[#8b949e] hover:bg-[#30363d] hover:text-[#c9d1d9] rounded-lg text-xs transition-colors"
            >
              <IconShare size={12} />
            </button>
            <Show when={showShareDropdown()}>
              <div class="absolute right-0 bottom-full mb-2 w-40 bg-[#161b22] border border-[#21262d] rounded-lg shadow-xl overflow-hidden z-50" onClick={(e) => e.stopPropagation()}>
                <button onClick={handleCopyLink} class="flex items-center gap-2 px-3 py-2 text-xs text-[#c9d1d9] hover:bg-[#21262d] w-full text-left">
                  {copiedLink() ? "✓ Copied!" : "Copy Link"}
                </button>
                <button onClick={(e) => handleShare("facebook", e)} class="flex items-center gap-2 px-3 py-2 text-xs text-[#c9d1d9] hover:bg-[#21262d] w-full text-left">Facebook</button>
                <button onClick={(e) => handleShare("twitter", e)} class="flex items-center gap-2 px-3 py-2 text-xs text-[#c9d1d9] hover:bg-[#21262d] w-full text-left">Twitter / X</button>
                <button onClick={(e) => handleShare("telegram", e)} class="flex items-center gap-2 px-3 py-2 text-xs text-[#c9d1d9] hover:bg-[#21262d] w-full text-left">Telegram</button>
                <button onClick={(e) => handleShare("linkedin", e)} class="flex items-center gap-2 px-3 py-2 text-xs text-[#c9d1d9] hover:bg-[#21262d] w-full text-left">LinkedIn</button>
              </div>
            </Show>
          </div>
          <Show
            when={!isInstalled()}
            fallback={
              <span class="flex items-center gap-1 px-3 py-1.5 bg-[#238636]/20 text-[#3fb950] rounded-lg text-xs font-medium">
                <IconCheck size={12} /> Done
              </span>
            }
          >
            <button
              type="button"
              onClick={handleAction}
              disabled={isInstalling()}
              class={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-white ${
                isInstalling() ? "bg-[#21262d] text-[#8b949e] cursor-wait" : actionInfo().color
              }`}
            >
              {isInstalling() ? "Working..." : copiedCmd() ? "Copied!" : actionInfo().label}
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}
