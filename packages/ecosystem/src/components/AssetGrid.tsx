import { type Component, createSignal, createEffect, For, Show, onCleanup, onMount, untrack } from "solid-js"
import { getAllItems, searchItems } from "../services/github"
import { AssetCard } from "./AssetCard"
import { IconSearch, IconLoader } from "./Icons"

interface AssetGridProps {
  onSelectItem?: (item: any) => void
}

const PAGE_SIZE = 20

export const AssetGrid: Component<AssetGridProps> = (props) => {
  const [items, setItems] = createSignal<any[]>([])
  const [loading, setLoading] = createSignal(false)
  const [hasMore, setHasMore] = createSignal(true)
  const [searchQuery, setSearchQuery] = createSignal("")
  const [initialLoaded, setInitialLoaded] = createSignal(false)
  const [errorMsg, setErrorMsg] = createSignal("")
  let sentinelRef: HTMLDivElement | undefined
  let observer: IntersectionObserver | undefined
  let fetchAbort = 0

  const fetchItems = async (query: string) => {
    if (loading()) return
    setLoading(true)
    setErrorMsg("")
    const currentFetch = ++fetchAbort

    try {
      const results = query
        ? await searchItems(query)
        : await getAllItems()

      if (currentFetch !== fetchAbort) return

      setItems(results as any[])
      setHasMore(false)
    } catch {
      if (currentFetch === fetchAbort) {
        setHasMore(false)
        setErrorMsg("Could not load assets.")
      }
    } finally {
      if (currentFetch === fetchAbort) {
        setLoading(false)
        setInitialLoaded(true)
      }
    }
  }

  const loadInitial = () => {
    setItems([])
    fetchItems(searchQuery())
  }

  onMount(() => {
    loadInitial()

    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore() && !loading()) {
          fetchItems(searchQuery())
        }
      },
      { rootMargin: "200px" },
    )
    if (sentinelRef) observer.observe(sentinelRef)
  })

  createEffect(() => {
    const _query = searchQuery()
    if (untrack(initialLoaded)) {
      loadInitial()
    }
  })

  onCleanup(() => observer?.disconnect())

  let searchTimeout: ReturnType<typeof setTimeout> | undefined
  const handleSearch = (value: string) => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => setSearchQuery(value), 500)
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="relative flex-1 min-w-[200px] max-w-md">
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <IconSearch class="text-[#8b949e]" size={14} />
          </div>
          <input
            type="text"
            onInput={(e) => handleSearch(e.currentTarget.value)}
            placeholder="Search ZYRAXON projects..."
            class="w-full pl-9 pr-4 py-2.5 bg-[#0d1117] border border-[#21262d] rounded-xl text-sm text-[#c9d1d9] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
          />
        </div>
      </div>

      <Show when={initialLoaded()}>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          <For each={items()}>
            {(item) => (
              <AssetCard item={item} onClick={(i) => props.onSelectItem?.(i)} />
            )}
          </For>
        </div>
      </Show>

      <Show when={loading()}>
        <div class="flex items-center justify-center py-8 gap-2">
          <IconLoader class="animate-spin text-[#58a6ff]" size={18} />
          <span class="text-sm text-[#8b949e]">Loading...</span>
        </div>
      </Show>

      <div ref={sentinelRef} class="h-4" />

      <Show when={!hasMore() && items().length > 0}>
        <div class="text-center py-6">
          <p class="text-sm text-[#8b949e]">{items().length.toLocaleString()} assets loaded</p>
        </div>
      </Show>

      <Show when={errorMsg()}>
        <div class="text-center py-4">
          <p class="text-sm text-[#f0883e]">{errorMsg()}</p>
        </div>
      </Show>

      <Show when={initialLoaded() && items().length === 0 && !loading()}>
        <div class="text-center py-16">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center">
            <IconSearch class="text-[#484f58]" size={28} />
          </div>
          <p class="text-lg text-[#c9d1d9] mb-2">No assets found</p>
          <p class="text-sm text-[#8b949e]">Try a different search</p>
        </div>
      </Show>
    </div>
  )
}
