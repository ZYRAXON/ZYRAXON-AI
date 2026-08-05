import { type Component, createSignal, For, Show, createResource } from "solid-js"
import type { EcosystemItem } from "../types"
import { getAllItems } from "../services/github"
import { ShareButton } from "./ShareButton"
import { AssetGrid } from "./AssetGrid"
import { AssetDetailModal } from "./AssetDetailModal"
import { IconStar, IconDownload, IconHeart, IconHeartOutline, IconSearch, IconArrowRight, IconMessageSquare, IconExternalLink, IconCopy, IconCheck } from "./Icons"
import { getAuthState } from "../services/auth"
import { installItemInApp } from "../services/download"
import { getGitHubStorage } from "../services/github-data"

type AssetItem = any

interface MarketplaceProps {
  onSelectItem?: (item: EcosystemItem) => void
  onUserClick?: (username: string) => void
}

const categoryFilters = [
  { id: "all", label: "All" },
  { id: "ai-bots", label: "AI Bots" },
  { id: "ai-models", label: "AI Models" },
  { id: "live-ai", label: "Live AI Apps" },
  { id: "web-games", label: "Web Games" },
  { id: "plugins", label: "Plugins" },
  { id: "website-templates", label: "Templates" },
  { id: "themes", label: "Themes" },
  { id: "components", label: "Components" },
  { id: "startkits", label: "Starter Kits" },
  { id: "workflows", label: "Workflows" },
  { id: "tools", label: "Dev Tools" },
  { id: "sdks", label: "SDKs" },
  { id: "pdfs", label: "PDFs" },
  { id: "books", label: "Books" },
  { id: "apis", label: "APIs" },
  { id: "mobile-apps", label: "Mobile" },
  { id: "desktop-apps", label: "Desktop" },
  { id: "iso-images", label: "ISO Images" },
  { id: "browser-extensions", label: "Extensions" },
  { id: "cli-tools", label: "CLI Tools" },
  { id: "prompts", label: "Prompts" },
  { id: "datasets", label: "Datasets" },
  { id: "fonts", label: "Fonts" },
  { id: "icons", label: "Icons" },
  { id: "ui-kits", label: "UI Kits" },
  { id: "landing-pages", label: "Landing Pages" },
  { id: "devops", label: "DevOps" },
  { id: "code-snippets", label: "Snippets" },
  { id: "website-games", label: "Website Games" },
  { id: "containers", label: "Containers" },
  { id: "ci-cd", label: "CI/CD" },
  { id: "editor-extensions", label: "Editor Extensions" },
]

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
  "website-game": "bg-[#f0883e]/20 text-[#f0883e]",
}

function getActionInfo(item: EcosystemItem) {
  const cat = item.category
  const type = item.type
  if (cat === "website-templates" || cat === "landing-pages" || type === "template" || type === "landing-page")
    return { label: "View Live", icon: "external" as const, color: "bg-[#238636] hover:bg-[#2ea043]" }
  if (cat === "desktop-apps" || type === "desktop-app")
    return { label: "Download", icon: "download" as const, color: "bg-[#1f6feb] hover:bg-[#388bfd]" }
  if (cat === "mobile-apps" || type === "app")
    return { label: "Download APK", icon: "download" as const, color: "bg-[#238636] hover:bg-[#2ea043]" }
  if (cat === "cli-tools" || type === "cli")
    return { label: "Copy Command", icon: "copy" as const, color: "bg-[#21262d] hover:bg-[#30363d]" }
  if (cat === "pdfs" || cat === "books" || type === "pdf" || type === "book")
    return { label: "Download", icon: "download" as const, color: "bg-[#f0883e] hover:bg-[#d29922]" }
  return { label: "View", icon: "external" as const, color: "bg-[#238636] hover:bg-[#2ea043]" }
}

export const Marketplace: Component<MarketplaceProps> = (props) => {
  const [items] = createResource(getAllItems)
  const [selectedCategory, setSelectedCategory] = createSignal<string>("all")
  const [sortBy, setSortBy] = createSignal<"newest" | "popular" | "top-rated">("newest")
  const [searchQuery, setSearchQuery] = createSignal("")
  const [viewMode, setViewMode] = createSignal<"zyraxon" | "assets" | "all">("all")
  const [selectedAsset, setSelectedAsset] = createSignal<AssetItem | null>(null)
  const auth = getAuthState()

  const filteredItems = () => {
    let result = items() || []
    if (searchQuery()) {
      const q = searchQuery().toLowerCase()
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    if (selectedCategory() !== "all") {
      result = result.filter(
        (item) =>
          item.category === selectedCategory() ||
          item.type === selectedCategory(),
      )
    }
    switch (sortBy()) {
      case "popular":
        return [...result].sort((a, b) => b.downloads - a.downloads)
      case "top-rated":
        return [...result].sort((a, b) => b.rating - a.rating)
      default:
        return [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
  }

  const showZyraxonItems = () => viewMode() === "zyraxon" || viewMode() === "all"
  const showAssets = () => viewMode() === "assets" || viewMode() === "all"

  const handleAction = (item: EcosystemItem, e: MouseEvent) => {
    e.stopPropagation()
    const action = getActionInfo(item)
    if (action.icon === "copy" && item.installCommand) {
      navigator.clipboard.writeText(item.installCommand)
      return
    }
    // Download / install directly inside the app
    installItemInApp(item)
  }

  return (
    <div class="max-w-6xl mx-auto">
      <div class="relative bg-gradient-to-r from-[#1f6feb] to-[#8957e5] rounded-2xl p-8 mb-8 overflow-hidden">
        <div class="absolute inset-0 opacity-10" style="background-image: radial-gradient(circle at 20% 50%, white 1px, transparent 1px); background-size: 20px 20px;" />
        <h1 class="text-3xl font-bold text-white mb-2 relative">ZYRAXON Marketplace</h1>
        <p class="text-white/80 text-lg mb-4 relative">Discover, publish, and share amazing creations</p>
        <div class="flex items-center gap-4 relative">
          <div class="bg-white/20 backdrop-blur rounded-lg px-4 py-2">
            <p class="text-2xl font-bold text-white">{items()?.length || 0}</p>
            <p class="text-xs text-white/70">Total Items</p>
          </div>
          <div class="bg-white/20 backdrop-blur rounded-lg px-4 py-2">
            <p class="text-2xl font-bold text-white">{items()?.filter((i) => i.type === "plugin").length || 0}</p>
            <p class="text-xs text-white/70">Plugins</p>
          </div>
          <div class="bg-white/20 backdrop-blur rounded-lg px-4 py-2">
            <p class="text-2xl font-bold text-white">{items()?.filter((i) => i.type === "template" || i.type === "landing-page").length || 0}</p>
            <p class="text-xs text-white/70">Templates</p>
          </div>
          <div class="bg-white/20 backdrop-blur rounded-lg px-4 py-2">
            <p class="text-2xl font-bold text-white">{items()?.filter((i) => i.type === "bot").length || 0}</p>
            <p class="text-xs text-white/70">Bots</p>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3 mb-6">
        <div class="flex bg-[#161b22] border border-[#21262d] rounded-lg p-1">
          <button
            onClick={() => setViewMode("all")}
            class={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode() === "all"
                ? "bg-[#1f6feb] text-white shadow-lg shadow-[#1f6feb]/25"
                : "text-[#8b949e] hover:text-[#c9d1d9]"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setViewMode("zyraxon")}
            class={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode() === "zyraxon"
                ? "bg-[#8957e5] text-white shadow-lg shadow-[#8957e5]/25"
                : "text-[#8b949e] hover:text-[#c9d1d9]"
            }`}
          >
            ZYRAXON
          </button>
          <button
            onClick={() => setViewMode("assets")}
            class={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode() === "assets"
                ? "bg-[#238636] text-white shadow-lg shadow-[#238636]/25"
                : "text-[#8b949e] hover:text-[#c9d1d9]"
            }`}
          >
            Assets
          </button>
        </div>
      </div>

      <Show when={viewMode() !== "assets"}>
        <div class="flex items-center gap-4 mb-6">
          <div class="relative flex-1 max-w-md">
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <IconSearch class="text-[#8b949e]" size={16} />
            </div>
            <input
              type="text"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
              placeholder="Search items..."
              class="w-full pl-10 pr-4 py-2.5 bg-[#0d1117] border border-[#21262d] rounded-lg text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
            />
          </div>
          <select
            value={sortBy()}
            onChange={(e) => setSortBy(e.currentTarget.value as any)}
            class="bg-[#161b22] border border-[#21262d] rounded-lg px-3 py-2.5 text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]"
          >
            <option value="newest">Newest</option>
            <option value="popular">Most Popular</option>
            <option value="top-rated">Top Rated</option>
          </select>
        </div>

        <div class="flex flex-wrap gap-2 mb-6">
          <For each={categoryFilters}>
          {(cat) => (
            <button
              onClick={() => setSelectedCategory(cat.id)}
              class={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                selectedCategory() === cat.id
                  ? "bg-[#1f6feb] text-white shadow-lg shadow-[#1f6feb]/25"
                  : "bg-[#161b22] text-[#8b949e] hover:text-[#c9d1d9] border border-[#21262d] hover:border-[#30363d]"
              }`}
            >
              {cat.label}
            </button>
          )}
        </For>
        </div>
      </Show>

      {showAssets() && (
        <div class="mb-8">
          <AssetGrid onSelectItem={(item) => setSelectedAsset(item)} />
        </div>
      )}

      <Show when={selectedAsset()}>
        <AssetDetailModal item={selectedAsset()!} onClose={() => setSelectedAsset(null)} />
      </Show>

      {showZyraxonItems() && (
        <Show
          when={filteredItems().length > 0}
          fallback={
            <div class="text-center py-16">
              <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center">
                <IconSearch class="text-[#484f58]" size={28} />
              </div>
              <p class="text-lg text-[#c9d1d9] mb-2">No items yet</p>
              <p class="text-sm text-[#8b949e]">Items will appear here once AI publishes them</p>
            </div>
          }
        >
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={filteredItems()}>
              {(item) => {
                const [itemLiked, setItemLiked] = createSignal(false)
                const [itemLikeCount, setItemLikeCount] = createSignal(item.likeCount)
                const action = getActionInfo(item)

                return (
                  <div
                    onClick={() => props.onSelectItem?.(item)}
                    class="group relative bg-[#161b22] border border-[#21262d] rounded-xl overflow-hidden hover:border-[#30363d] transition-all duration-300 cursor-pointer hover:shadow-xl hover:shadow-[#1f6feb]/5"
                  >
                    <div class="h-40 relative overflow-hidden bg-gradient-to-br from-[#21262d] to-[#0d1117]">
                      <Show when={item.coverImage}>
                        <img src={item.coverImage} alt="" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                      </Show>
                      <Show when={!item.coverImage}>
                        <div class="w-full h-full flex items-center justify-center text-4xl font-bold text-[#30363d]">
                          {item.name.charAt(0)}
                        </div>
                      </Show>
                      <div class="absolute inset-0 bg-gradient-to-t from-[#161b22] via-transparent to-transparent" />
                      <Show when={item.logo}>
                        <div class="absolute bottom-3 left-3">
                          <img src={item.logo} alt="" class="w-10 h-10 rounded-lg border border-white/10 bg-white/5" />
                        </div>
                      </Show>
                      <Show when={!item.logo}>
                        <div class="absolute bottom-3 left-3 w-10 h-10 rounded-lg bg-[#1f6feb]/30 border border-[#1f6feb]/20 flex items-center justify-center text-[#58a6ff] text-sm font-bold">
                          {item.name.charAt(0)}
                        </div>
                      </Show>
                      <div class="absolute top-3 right-3 flex gap-2">
                        <Show when={item.verified}>
                          <span class="px-2 py-0.5 bg-[#238636]/90 text-white rounded text-[10px] font-medium backdrop-blur">
                            Verified
                          </span>
                        </Show>
                        <Show when={item.featured}>
                          <span class="px-2 py-0.5 bg-[#e3b341]/90 text-black rounded text-[10px] font-medium backdrop-blur">
                            Featured
                          </span>
                        </Show>
                      </div>
                    </div>

                    <div class="p-4">
                      <div class="flex items-center gap-2 mb-2">
                        <span class={`px-2 py-0.5 rounded text-[10px] font-medium ${typeColors[item.type] || "bg-[#30363d] text-[#8b949e]"}`}>
                          {item.type}
                        </span>
                        <span class="text-[10px] text-[#484f58]">v{item.version}</span>
                      </div>

                      <h3 class="text-sm font-semibold text-[#c9d1d9] mb-1 group-hover:text-[#58a6ff] transition-colors line-clamp-1">
                        {item.name}
                      </h3>
                      <p class="text-xs text-[#8b949e] line-clamp-2 mb-3">{item.description}</p>

                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          props.onUserClick?.(item.author)
                        }}
                        class="flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
                      >
                        <Show when={item.authorAvatar}>
                          <img src={item.authorAvatar} alt="" class="w-5 h-5 rounded-full bg-[#21262d]" />
                        </Show>
                        <Show when={!item.authorAvatar}>
                          <div class="w-5 h-5 rounded-full bg-[#21262d] flex items-center justify-center text-[8px] text-[#8b949e]">
                            {typeof item.author === "string" ? item.author.charAt(0) : ((item.author as any)?.name || "?").charAt(0)}
                          </div>
                        </Show>
                        <span class="text-xs text-[#58a6ff]">{typeof item.author === "string" ? item.author : (item.author as any)?.name || "Unknown"}</span>
                      </button>

                      <div class="flex items-center justify-between pt-3 border-t border-[#21262d]">
                        <div class="flex items-center gap-3 text-xs text-[#8b949e]">
                          <span class="flex items-center gap-1">
                            <IconStar size={12} class="text-[#e3b341]" />
                            {item.rating.toFixed(1)}
                          </span>
                          <span class="flex items-center gap-1">
                            <IconDownload size={12} />
                            {item.downloads.toLocaleString()}
                          </span>
                          <span class="flex items-center gap-1">
                            <IconMessageSquare size={12} />
                            {item.commentCount || 0}
                          </span>
                        </div>
                        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ShareButton itemId={item.id} itemName={item.name} />
                          <button
                            onClick={(e) => handleAction(item, e)}
                            class={`p-1.5 text-white rounded-lg text-xs transition-colors ${action.color}`}
                          >
                            {action.icon === "copy" ? <IconCopy size={12} /> : action.icon === "download" ? <IconDownload size={12} /> : <IconExternalLink size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      )}
    </div>
  )
}
