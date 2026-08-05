import { type Component, For, Show, createSignal } from "solid-js"
import type { ViewMode } from "../types"
import {
  IconHome, IconMarketplace, IconCommunity, IconSearch,
  IconCategories, IconStar, IconTrending, IconNew,
  IconPackage, IconDownload, IconHeart, IconChevronLeft, IconChevronRight, IconSettings
} from "./Icons"

interface SidebarProps {
  currentView: ViewMode
  onViewChange: (view: ViewMode) => void
}

const IconExtensions: typeof IconHome = (props) => (
  <svg class={props.class} width={props.size || 16} height={props.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M17.5 14v7" /><path d="M14 17.5h7" />
  </svg>
)

const mainNavItems: { id: ViewMode; label: string; icon: typeof IconHome }[] = [
  { id: "home", label: "Home", icon: IconHome },
  { id: "marketplace", label: "Marketplace", icon: IconMarketplace },
  { id: "extensions", label: "Extensions", icon: IconExtensions },
  { id: "github", label: "GitHub Releases", icon: IconDownload },
  { id: "explore", label: "Explore", icon: IconSearch },
  { id: "categories", label: "Categories", icon: IconCategories },
  { id: "top-rated", label: "Top Rated", icon: IconStar },
  { id: "trending", label: "Trending", icon: IconTrending },
  { id: "new", label: "New Arrivals", icon: IconNew },
]

const myStuffItems: { id: ViewMode; label: string; icon: typeof IconPackage }[] = [
  { id: "my-plugins", label: "My Plugins", icon: IconPackage },
  { id: "my-extensions", label: "My Extensions", icon: IconExtensions },
  { id: "my-downloads", label: "My Downloads", icon: IconDownload },
  { id: "my-favorites", label: "My Favorites", icon: IconHeart },
]

export const Sidebar: Component<SidebarProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false)

  return (
    <aside class={`${collapsed() ? "w-14" : "w-56"} h-full bg-[#0d1117] border-r border-[#21262d] flex flex-col overflow-y-auto transition-all duration-300`}>
      <div class="flex items-center justify-between px-3 py-3 border-b border-[#21262d]">
        <Show when={!collapsed()}>
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1f6feb] to-[#8957e5] flex items-center justify-center text-white font-bold text-sm">
              Z
            </div>
            <span class="text-sm font-bold text-[#c9d1d9]">Ecosystem</span>
          </div>
        </Show>
        <button
          onClick={() => setCollapsed(!collapsed())}
          class="p-1.5 rounded-lg text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9] transition-colors"
        >
          {collapsed() ? <IconChevronRight size={16} /> : <IconChevronLeft size={16} />}
        </button>
      </div>

      <nav class="flex-1 py-3">
        <ul class="space-y-0.5 px-2">
          <For each={mainNavItems}>
            {(item) => (
              <li>
                <button
                  type="button"
                  onClick={() => props.onViewChange(item.id)}
                  class={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                    props.currentView === item.id
                      ? "bg-[#1f6feb]/20 text-[#58a6ff]"
                      : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]"
                  }`}
                >
                  <item.icon size={16} class="shrink-0" />
                  <Show when={!collapsed()}>
                    <span>{item.label}</span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>

        <div class="mt-6 px-4">
          <Show when={!collapsed()}>
            <h3 class="text-xs font-semibold text-[#8b949e] uppercase tracking-wider mb-2">My Stuff</h3>
          </Show>
          <ul class="space-y-0.5">
            <For each={myStuffItems}>
              {(item) => (
                <li>
                  <button
                    type="button"
                    onClick={() => props.onViewChange(item.id)}
                    class={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      props.currentView === item.id
                        ? "bg-[#1f6feb]/20 text-[#58a6ff]"
                        : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]"
                    }`}
                  >
                    <item.icon size={16} class="shrink-0" />
                    <Show when={!collapsed()}>
                      <span>{item.label}</span>
                    </Show>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </nav>

      <div class="px-2 py-3 border-t border-[#21262d]">
        <button
          type="button"
          onClick={() => props.onViewChange("settings")}
          class={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
            props.currentView === "settings"
              ? "bg-[#1f6feb]/20 text-[#58a6ff]"
              : "text-[#8b949e] hover:bg-[#161b22] hover:text-[#c9d1d9]"
          }`}
        >
          <IconSettings size={16} class="shrink-0" />
          <Show when={!collapsed()}>
            <span>Settings</span>
          </Show>
        </button>
      </div>
    </aside>
  )
}
