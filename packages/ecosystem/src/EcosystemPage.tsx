import { type Component, createSignal, createResource, For, Show, onMount } from "solid-js"
import { Sidebar } from "./components/Sidebar"
import { SearchBar } from "./components/SearchBar"
import { CategoryCard } from "./components/CategoryCard"
import { ItemCard } from "./components/ItemCard"
import { StatsCard } from "./components/StatsCard"
import { RecentActivity } from "./components/RecentActivity"
import { ProductDetail } from "./components/ProductDetail"
import { LoginButton } from "./components/LoginButton"
import { UserProfile } from "./components/UserProfile"
import { Marketplace } from "./components/Marketplace"
import { VSCodeMarketplace } from "./components/VSCodeMarketplace"
import { InstalledExtensions } from "./components/InstalledExtensions"
import { GitHubReleases } from "./components/GitHubReleases"
import type { ViewMode, EcosystemItem, CategoryInfo, EcosystemStats, User, Category } from "./types"
import {
  getAllItems,
  getCategories,
  getStats,
  getRecentActivity,
  getFeaturedItems,
  getTopRatedItems,
  getTrendingItems,
  getNewArrivals,
  getItemsByCategory,
  searchItems,
} from "./services/github"
import { getAuthState } from "./services/auth"
import { IconStar, IconArrowRight, IconArrowLeft } from "./components/Icons"

export const EcosystemPage: Component<{ initialItemId?: string }> = (props) => {
  const [view, setView] = createSignal<ViewMode>("home")
  const [previousView, setPreviousView] = createSignal<ViewMode>("home")
  const [selectedItem, setSelectedItem] = createSignal<EcosystemItem | null>(null)
  const [selectedCategory, setSelectedCategory] = createSignal<string | null>(null)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [selectedUser, setSelectedUser] = createSignal<User | null>(null)
  const [viewHistory, setViewHistory] = createSignal<ViewMode[]>(["home"])
  const [vsCodeDeepLinkId, setVsCodeDeepLinkId] = 
createSignal<string | undefined>(undefined)

  const [items] = createResource(getAllItems)
  const [categories] = createResource(getCategories)
  const [stats] = createResource(getStats)
  const [recentActivity] = createResource(getRecentActivity)
  const [featured] = createResource(getFeaturedItems)
  const [topRated] = createResource(() => getTopRatedItems(5))
  const [trending] = createResource(getTrendingItems)
  const [newArrivals] = createResource(getNewArrivals)

  const [searchResults] = createResource(searchQuery, searchItems)
  const [categoryItems] = createResource(selectedCategory, getItemsByCategory)

  const [authRefresh, setAuthRefresh] = createSignal(0)
  const auth = () => { authRefresh(); return getAuthState() }

  onMount(async () => {
    if (props.initialItemId) {
      // Check if this is a VS Code extension ID (contains a dot like "ms-python.python")
      if (props.initialItemId.includes(".")) {
        setVsCodeDeepLinkId(props.initialItemId)
        setView("extensions")
      } else {
        const allItems = await getAllItems()
        const item = allItems.find((i) => i.id === props.initialItemId)
        if (item) {
          setSelectedItem(item)
          setView("product-detail")
        }
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && view() === "product-detail") {
        goBack()
      }
      if (e.key === "b" || e.key === "B") {
        if (view() !== "product-detail") {
          goBack()
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  const navigateTo = (newView: ViewMode) => {
    setPreviousView(view())
    setViewHistory([...viewHistory(), newView])
    setView(newView)
    setSearchQuery("")
    // Clear VS Code deep link when navigating away from extensions
    if (newView !== "extensions") {
      setVsCodeDeepLinkId(undefined)
    }
  }

  const goBack = () => {
    const history = viewHistory()
    if (history.length > 1) {
      const newHistory = history.slice(0, -1)
      setViewHistory(newHistory)
      setView(newHistory[newHistory.length - 1])
    } else {
      setView("home")
      setViewHistory(["home"])
    }
    setSelectedItem(null)
    setSelectedUser(null)
    setSelectedCategory(null)
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (query) navigateTo("explore")
  }

  const handleViewChange = (newView: ViewMode) => {
    navigateTo(newView)
  }

  const handleCategoryClick = (catId: string) => {
    setSelectedCategory(catId)
    navigateTo("categories")
  }

  const handleUserClickByUsername = async (username: string) => {
    const allItems = items() || []
    const userItem = allItems.find((i) => i.author === username)
    const user: User = {
      id: userItem?.authorId || `user-${username}`,
      githubUserId: 0,
      username,
      displayName: userItem?.author || username,
      email: "",
      avatarUrl: userItem?.authorAvatar || "",
      bio: "",
      title: "",
      skills: [],
      location: "",
      company: "",
      blog: "",
      followerCount: 0,
      followingCount: 0,
      publishedCount: allItems.filter((i) => i.author === username).length,
      createdAt: "",
    }
    try {
      const { getUserProfile } = await import("./services/github")
      const profile = await getUserProfile(user.id)
      if (profile) Object.assign(user, profile)
    } catch {}
    setSelectedUser(user)
    navigateTo("profile")
  }

  const handleSelectItem = (item: EcosystemItem) => {
    setSelectedItem(item)
    navigateTo("product-detail")
  }

  const displayedItems = () => {
    if (searchQuery() && searchResults()) {
      return searchResults()!
    }
    if (selectedCategory() && categoryItems()) {
      return categoryItems()!
    }
    if (!items()) return []
    return items()!
  }

  const viewFilteredItems = () => {
    const all = items() || []
    switch (view()) {
      case "top-rated":
        return [...all].sort((a, b) => b.rating - a.rating)
      case "trending":
        return [...all].sort((a, b) => b.downloads - a.downloads)
      case "new":
        return [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      case "explore":
        return all
      default:
        return displayedItems()
    }
  }

  const pageTitle = () => {
    if (selectedCategory() && categories()) {
      const cat = categories()!.find((c) => c.id === selectedCategory())
      if (cat) return cat.name
    }
    switch (view()) {
      case "home":
        return "ZYRAXON ECOSYSTEM"
      case "marketplace":
        return "Marketplace"
      case "extensions":
        return "Extensions"
      case "github":
        return "GitHub Releases"
      case "community":
        return "Community"
      case "explore":
        return "Explore"
      case "categories":
        return "Categories"
      case "top-rated":
        return "Top Rated"
      case "trending":
        return "Trending"
      case "new":
        return "New Arrivals"
      case "my-plugins":
        return "My Plugins"
      case "my-downloads":
        return "My Downloads"
      case "my-favorites":
        return "My Favorites"
      case "settings":
        return "Settings"
      case "ai-settings":
        return "AI Settings"
      case "profile":
        return selectedUser()?.displayName || "Profile"
      default:
        return "Ecosystem"
    }
  }

  const pageSubtitle = () => {
    switch (view()) {
      case "home":
        return "One Marketplace. Endless Possibilities."
      case "marketplace":
        return "Discover and share amazing creations"
      case "extensions":
        return "Browse extensions from the Visual Studio Marketplace"
      case "github":
        return "Latest releases from apps, bots & tools across all of GitHub"
      case "community":
        return "Connect with creators worldwide"
      case "explore":
        return "Discover plugins, bots, and templates"
      case "categories":
        return selectedCategory() ? "Items in this category" : "Browse by category"
      case "top-rated":
        return "Most highly rated items"
      case "trending":
        return "Most popular right now"
      case "new":
        return "Recently added items"
      case "my-plugins":
        return "Plugins you've published"
      case "my-downloads":
        return "Items you've installed"
      case "my-favorites":
        return "Items you've saved"
      case "settings":
        return "Manage your account and preferences"
      case "ai-settings":
        return "Configure ZYRAXON AI connection"
      case "profile":
        return `@${selectedUser()?.username}`
      default:
        return ""
    }
  }

  return (
    <div class="flex h-screen bg-[#0d1117]">
      <Sidebar currentView={view()} onViewChange={handleViewChange} />

      <main class="flex-1 overflow-y-auto">
        <div class="sticky top-0 z-10 bg-[#0d1117]/95 backdrop-blur border-b border-[#21262d] px-6 py-4">
          <div class="flex items-center gap-4">
            <Show when={view() !== "home"}>
              <button
                onClick={goBack}
                class="flex items-center gap-1 px-3 py-1.5 text-sm text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] rounded-lg transition-colors shrink-0"
              >
                <IconArrowLeft size={16} />
                Back
              </button>
            </Show>
            <SearchBar onSearch={handleSearch} />
            <LoginButton
              onLogin={() => setAuthRefresh(n => n + 1)}
              onLogout={() => setAuthRefresh(n => n + 1)}
              onNavigate={(view) => {
                if (view === "profile") {
                  const a = auth()
                  if (a.user) {
                    setSelectedUser(a.user as User)
                    navigateTo("profile")
                  }
                } else {
                  navigateTo(view as ViewMode)
                }
              }}
            />
          </div>
        </div>

        <div class="p-6">
          <Show when={view() === "product-detail" && selectedItem()}>
            <ProductDetail
              item={selectedItem()!}
              onClose={goBack}
            />
          </Show>

          <Show when={view() !== "product-detail" && view() !== "community" && view() !== "marketplace" && view() !== "profile"}>
            <div class="mb-8">
              <h1 class="text-2xl font-bold text-[#c9d1d9] mb-2">{pageTitle()}</h1>
              <p class="text-sm text-[#8b949e]">{pageSubtitle()}</p>
            </div>
          </Show>

          <Show when={view() === "home"}>
            <div class="grid grid-cols-4 gap-4 mb-8">
              <Show when={stats()} fallback={<div class="col-span-4 h-24 bg-[#161b22] rounded-xl animate-pulse" />}>
                <div class="col-span-3">
                  <div class="grid grid-cols-5 gap-4">
                    <div class="p-4 bg-[#161b22] border border-[#21262d] rounded-xl">
                      <p class="text-2xl font-bold text-[#c9d1d9]">{stats()!.totalPlugins}</p>
                      <p class="text-xs text-[#8b949e]">Plugins</p>
                    </div>
                    <div class="p-4 bg-[#161b22] border border-[#21262d] rounded-xl">
                      <p class="text-2xl font-bold text-[#c9d1d9]">{stats()!.totalBots}</p>
                      <p class="text-xs text-[#8b949e]">Bots</p>
                    </div>
                    <div class="p-4 bg-[#161b22] border border-[#21262d] rounded-xl">
                      <p class="text-2xl font-bold text-[#c9d1d9]">{stats()!.totalTemplates}</p>
                      <p class="text-xs text-[#8b949e]">Templates</p>
                    </div>
                    <div class="p-4 bg-[#161b22] border border-[#21262d] rounded-xl">
                      <p class="text-2xl font-bold text-[#c9d1d9]">{stats()!.totalDownloads.toLocaleString()}</p>
                      <p class="text-xs text-[#8b949e]">Downloads</p>
                    </div>
                    <div class="p-4 bg-[#161b22] border border-[#21262d] rounded-xl">
                      <p class="text-2xl font-bold text-[#c9d1d9]">{stats()!.totalUsers}</p>
                      <p class="text-xs text-[#8b949e]">Users</p>
                    </div>
                  </div>
                </div>
                <div class="col-span-1">
                  <StatsCard stats={stats() ?? null} loading={!stats()} />
                </div>
              </Show>
            </div>

            <section class="mb-8">
              <h2 class="text-lg font-semibold text-[#c9d1d9] mb-4">Categories</h2>
              <Show
                when={categories()}
                fallback={<div class="grid grid-cols-4 gap-4 h-40 bg-[#161b22] rounded-xl animate-pulse" />}
              >
                <div class="grid grid-cols-4 gap-4">
                  <For each={categories()!}>
                    {(cat) => (
                      <CategoryCard
                        category={cat}
                        onClick={() => handleCategoryClick(cat.id)}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </section>

            <Show when={featured() && featured()!.length > 0}>
              <section class="mb-8">
                <div class="flex items-center justify-between mb-4">
                  <h2 class="text-lg font-semibold text-[#c9d1d9]">Featured This Week</h2>
                  <button
                    type="button"
                    onClick={() => navigateTo("explore")}
                    class="flex items-center gap-1 text-sm text-[#58a6ff] hover:underline"
                  >
                    View All <IconArrowRight size={14} />
                  </button>
                </div>
                <div class="grid grid-cols-4 gap-4">
                  <For each={featured()!.slice(0, 4)}>
                    {(item) => (
                      <ItemCard item={item} onClick={handleSelectItem} onUserClick={handleUserClickByUsername} />
                    )}
                  </For>
                </div>
              </section>
            </Show>

            <Show when={topRated() && topRated()!.length > 0}>
              <div class="grid grid-cols-3 gap-6">
                <section class="col-span-2">
                  <div class="flex items-center justify-between mb-4">
                    <h2 class="text-lg font-semibold text-[#c9d1d9]">Top Rated</h2>
                    <button
                      type="button"
                      onClick={() => navigateTo("top-rated")}
                      class="flex items-center gap-1 text-sm text-[#58a6ff] hover:underline"
                    >
                      View All <IconArrowRight size={14} />
                    </button>
                  </div>
                  <div class="space-y-3">
                    <For each={topRated()!.slice(0, 5)}>
                      {(item, i) => (
                        <div
                          class="flex items-center gap-4 p-3 bg-[#161b22] border border-[#21262d] rounded-lg hover:border-[#30363d] cursor-pointer transition-colors"
                          onClick={() => handleSelectItem(item)}
                        >
                          <span class="text-lg font-bold text-[#484f58] w-6">{i() + 1}</span>
                          <div class="flex-1">
                            <p class="text-sm font-medium text-[#c9d1d9]">{item.name}</p>
                            <p class="text-xs text-[#8b949e]">{item.description}</p>
                          </div>
                          <span class="flex items-center gap-1 text-sm text-[#e3b341]"><IconStar size={14} /> {item.rating.toFixed(1)}</span>
                          <span class="text-sm text-[#8b949e]">{item.downloads.toLocaleString()}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </section>

                <section>
                  <RecentActivity activities={recentActivity() || []} loading={!recentActivity()} />
                </section>
              </div>
            </Show>

            <Show when={(!items() || items()!.length === 0) && !searchQuery()}>
              <div class="flex flex-col items-center justify-center py-20">
                <div class="w-20 h-20 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-4">
                  <span class="text-3xl text-[#484f58]">≡ƒ¢Æ</span>
                </div>
                <p class="text-xl text-[#c9d1d9] mb-2">No Items Published Yet</p>
                <p class="text-sm text-[#8b949e] mb-6 text-center max-w-md">
                  The ecosystem marketplace is waiting for its first items. Publish your own plugins, bots, templates, or any creation to get started.
                </p>
                <Show when={auth().isAuthenticated}>
                  <button
                    onClick={() => navigateTo("explore")}
                    class="px-4 py-2 bg-[#238636] hover:bg-[#2ea043] text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Start Exploring
                  </button>
                </Show>
                <Show when={!auth().isAuthenticated}>
                  <p class="text-xs text-[#8b949e]">Sign in to publish your first item</p>
                </Show>
              </div>
            </Show>
          </Show>

          <Show when={view() === "marketplace"}>
            <Marketplace onSelectItem={handleSelectItem} onUserClick={handleUserClickByUsername} />
          </Show>

          <Show when={view() === "extensions"}>
            <VSCodeMarketplace deepLinkId={vsCodeDeepLinkId()} />
          </Show>

          <Show when={view() === "my-extensions"}>
            <InstalledExtensions />
          </Show>

          <Show when={view() === "github"}>
            <GitHubReleases />
          </Show>

          <Show when={view() === "profile" && selectedUser()}>
            <UserProfile
              user={selectedUser()!}
              isOwnProfile={auth().user?.id === selectedUser()!.id}
            />
          </Show>

          <Show when={view() === "settings"}>
            <div class="max-w-2xl mx-auto space-y-6">
              <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                <h3 class="text-lg font-semibold text-[#c9d1d9] mb-4">Account</h3>
                <Show when={auth().isAuthenticated}>
                  <div class="flex items-center gap-4 mb-6">
                    <img src={auth().user?.avatarUrl} alt="" class="w-16 h-16 rounded-full border-2 border-[#21262d]" />
                    <div>
                      <p class="text-lg font-medium text-[#c9d1d9]">{auth().user?.displayName}</p>
                      <p class="text-sm text-[#8b949e]">@{auth().user?.username}</p>
                      <p class="text-xs text-[#8b949e] mt-1">Logged in via GitHub</p>
                    </div>
                  </div>
                </Show>
                <div class="space-y-4">
                  <div class="flex items-center justify-between py-3 border-b border-[#21262d]">
                    <div>
                      <p class="text-sm text-[#c9d1d9]">Email Notifications</p>
                      <p class="text-xs text-[#8b949e]">Receive email updates about your ecosystem activity</p>
                    </div>
                    <div class="w-10 h-5 bg-[#238636] rounded-full relative cursor-pointer">
                      <div class="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform" />
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-3 border-b border-[#21262d]">
                    <div>
                      <p class="text-sm text-[#c9d1d9]">Dark Mode</p>
                      <p class="text-xs text-[#8b949e]">Always enabled for the best experience</p>
                    </div>
                    <div class="w-10 h-5 bg-[#238636] rounded-full relative">
                      <div class="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
                    </div>
                  </div>
                  <div class="flex items-center justify-between py-3">
                    <div>
                      <p class="text-sm text-[#c9d1d9]">Language</p>
                      <p class="text-xs text-[#8b949e]">Interface language</p>
                    </div>
                    <span class="text-sm text-[#8b949e]">English</span>
                  </div>
                </div>
              </div>
              <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                <h3 class="text-lg font-semibold text-[#c9d1d9] mb-4">Danger Zone</h3>
                <button class="px-4 py-2 bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] rounded-lg text-sm hover:bg-[#f85149]/20 transition-colors">
                  Delete Account
                </button>
              </div>
            </div>
          </Show>

          <Show when={view() === "ai-settings"}>
            <div class="max-w-2xl mx-auto space-y-6">
              <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                <h3 class="text-lg font-semibold text-[#c9d1d9] mb-4">ZYRAXON AI Connection</h3>
                <div class="mb-4 p-4 bg-[#0d1117] border border-[#21262d] rounded-xl">
                  <div class="flex items-center gap-3 mb-3">
                    <div class={`w-3 h-3 rounded-full ${
                      auth().isAuthenticated ? "bg-[#3fb950] animate-pulse" : "bg-[#8b949e]"
                    }`} />
                    <span class="text-sm font-medium text-[#c9d1d9]">
                      {auth().isAuthenticated ? "AI Connected" : "AI Disconnected"}
                    </span>
                  </div>
                  <p class="text-xs text-[#8b949e]">
                    ZYRAXON AI automatically publishes items to the marketplace based on your conversations.
                  </p>
                </div>
                <div class="space-y-4">
                  <div>
                    <label class="block text-xs text-[#8b949e] mb-2">Auto-publish</label>
                    <div class="flex items-center justify-between py-2">
                      <p class="text-sm text-[#c9d1d9]">Allow AI to auto-publish items</p>
                      <div class="w-10 h-5 bg-[#238636] rounded-full relative cursor-pointer">
                        <div class="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs text-[#8b949e] mb-2">Default Category</label>
                    <select class="w-full px-4 py-2.5 bg-[#0d1117] border border-[#21262d] rounded-xl text-sm text-[#c9d1d9] focus:outline-none focus:border-[#58a6ff]">
                      <option>Plugins</option>
                      <option>AI Bots</option>
                      <option>Website Templates</option>
                      <option>Components</option>
                      <option>Tools</option>
                    </select>
                  </div>
                  <div>
                    <label class="block text-xs text-[#8b949e] mb-2">Memory Context</label>
                    <p class="text-xs text-[#8b949e] mb-2">AI remembers the last 100 interactions for context</p>
                    <div class="flex items-center gap-2">
                      <div class="flex-1 h-2 bg-[#0d1117] rounded-full overflow-hidden">
                        <div class="h-full w-[15%] bg-[#1f6feb] rounded-full" />
                      </div>
                      <span class="text-xs text-[#8b949e]">15/100</span>
                    </div>
                  </div>
                </div>
              </div>
              <div class="bg-[#161b22] border border-[#21262d] rounded-xl p-6">
                <h3 class="text-lg font-semibold text-[#c9d1d9] mb-4">Token Management</h3>
                <Show when={auth().isAuthenticated}>
                  <div class="p-4 bg-[#0d1117] border border-[#21262d] rounded-xl">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-sm text-[#c9d1d9]">GitHub Token</p>
                        <p class="text-xs text-[#8b949e]">Connected as @{auth().user?.username}</p>
                      </div>
                      <span class="px-2 py-0.5 bg-[#238636]/20 text-[#3fb950] text-xs rounded-full">Active</span>
                    </div>
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={view() !== "home" && view() !== "profile" && view() !== "community" && view() !== "marketplace" && view() !== "product-detail" && view() !== "settings" && view() !== "ai-settings"}>
            <Show when={view() === "categories" && !selectedCategory()}>
              <Show
                when={categories()}
                fallback={<div class="grid grid-cols-4 gap-4 h-40 bg-[#161b22] rounded-xl animate-pulse" />}
              >
                <div class="grid grid-cols-4 gap-4">
                  <For each={categories()!}>
                    {(cat) => (
                      <CategoryCard
                        category={cat}
                        onClick={() => handleCategoryClick(cat.id)}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </Show>

            <Show when={view() === "categories" && selectedCategory()}>
              <div class="grid grid-cols-3 gap-4">
                <For each={categoryItems() || []}>
                  {(item) => <ItemCard item={item} onClick={handleSelectItem} onUserClick={handleUserClickByUsername} />}
                </For>
              </div>
              <Show when={!categoryItems() || categoryItems()!.length === 0}>
                <div class="flex flex-col items-center justify-center py-16">
                  <div class="w-16 h-16 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-4">
                    <span class="text-2xl text-[#484f58]">≡ƒô¡</span>
                  </div>
                  <p class="text-lg text-[#c9d1d9] mb-2">No items in this category yet</p>
                  <p class="text-sm text-[#8b949e]">Items will appear here once published</p>
                </div>
              </Show>
            </Show>

            <Show when={view() !== "categories"}>
              <Show
                when={viewFilteredItems().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center py-16">
                    <div class="w-16 h-16 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-4">
                      <span class="text-2xl text-[#484f58]">
                        {view() === "my-plugins" ? "≡ƒôª" :
                         view() === "my-downloads" ? "Γ¼ç∩╕Å" :
                         view() === "my-favorites" ? "Γ¥ñ∩╕Å" :
                         view() === "explore" ? "≡ƒöì" :
                         view() === "top-rated" ? "Γ¡É" :
                         view() === "trending" ? "≡ƒôê" :
                         view() === "new" ? "≡ƒåò" : "≡ƒô¡"}
                      </span>
                    </div>
                    <p class="text-lg text-[#c9d1d9] mb-2">
                      {view() === "my-plugins" ? "No plugins published yet" :
                       view() === "my-downloads" ? "No downloads yet" :
                       view() === "my-favorites" ? "No favorites yet" :
                       view() === "explore" ? "Nothing to explore yet" :
                       view() === "top-rated" ? "No top rated items yet" :
                       view() === "trending" ? "Nothing trending yet" :
                       view() === "new" ? "No new arrivals yet" :
                       "No items yet"}
                    </p>
                    <p class="text-sm text-[#8b949e] text-center max-w-sm">
                      {view() === "my-plugins" ? "Items you publish will appear here. Ask ZYRAXON AI to build something for you!" :
                       view() === "my-downloads" ? "Items you install from the marketplace will appear here." :
                       view() === "my-favorites" ? "Items you like will be saved here for quick access." :
                       view() === "explore" ? "Discover plugins, bots, templates, and more. Items will appear once published." :
                       view() === "top-rated" ? "The highest rated items will appear here based on community reviews." :
                       view() === "trending" ? "Most downloaded items will appear here as the community grows." :
                       view() === "new" ? "The latest published items will appear here." :
                       "Items will appear here once published."}
                    </p>
                  </div>
                }
              >
                <div class="grid grid-cols-3 gap-4">
                  <For each={viewFilteredItems()}>
                    {(item) => <ItemCard item={item} onClick={handleSelectItem} onUserClick={handleUserClickByUsername} />}
                  </For>
                </div>
              </Show>
            </Show>
          </Show>
        </div>
      </main>
    </div>
  )
}