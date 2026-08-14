import { createSignal, For, Show, onMount, onCleanup } from "solid-js"
import { Icon } from "@zyraxon-ai/ui/icon"
import { IconButtonV2 } from "@zyraxon-ai/ui/v2/icon-button-v2"
import { TooltipV2 } from "@zyraxon-ai/ui/v2/tooltip-v2"

type ItemCategory = "website" | "sdk" | "pdf" | "ai_bot" | "plugin" | "template" | "mobile_app" | "api"

type ItemStatus = "draft" | "published"

interface CreatedItem {
  id: string
  name: string
  category: ItemCategory
  status: ItemStatus
  createdAt: string
  description?: string
  url?: string
  agentMode?: string
}

const CATEGORY_CONFIG: Record<ItemCategory, { icon: string; label: string; color: string; description: string }> = {
  website: { icon: "globe", label: "Website", color: "#238636", description: "Full website built with ZYRAXON" },
  sdk: { icon: "package", label: "SDK", color: "#8957e5", description: "Software Development Kit" },
  pdf: { icon: "file-text", label: "PDF", color: "#f85149", description: "Generated document or report" },
  ai_bot: { icon: "bot", label: "AI Bot", color: "#1f6feb", description: "Custom AI assistant" },
  plugin: { icon: "puzzle", label: "Plugin", color: "#e3b341", description: "Extension or add-on" },
  template: { icon: "layout", label: "Template", color: "#3fb950", description: "Reusable project template" },
  mobile_app: { icon: "smartphone", label: "Mobile App", color: "#f778ba", description: "Cross-platform mobile application" },
  api: { icon: "terminal", label: "API", color: "#79c0ff", description: "REST/GraphQL API endpoint" },
}

const AGENT_MODES = [
  { id: "build", label: "Build", icon: "code", color: "#58a6ff" },
  { id: "plan", label: "Plan", icon: "list-unordered", color: "#d2a8ff" },
  { id: "beast", label: "Beast", icon: "zap", color: "#f85149" },
  { id: "pro", label: "PRO", icon: "shield", color: "#3fb950" },
  { id: "apex", label: "APEX", icon: "alert", color: "#e3b341" },
  { id: "dark", label: "DARK", icon: "moon", color: "#8b949e" },
  { id: "vision", label: "VISION", icon: "eye", color: "#f778ba" },
  { id: "probuilder", label: "PRO BUILDER", icon: "rocket", color: "#79c0ff" },
  { id: "general", label: "General", icon: "comment", color: "#c9d1d9" },
]

const STORAGE_KEY = "zyraxon_ecosystem_items"

export function EcosystemPanel() {
  const [items, setItems] = createSignal<CreatedItem[]>([])
  const [selectedCategory, setSelectedCategory] = createSignal<ItemCategory | "all">("all")
  const [selectedAgent, setSelectedAgent] = createSignal<string | "all">("all")
  const [publishingId, setPublishingId] = createSignal<string | null>(null)
  const [showCreateMenu, setShowCreateMenu] = createSignal(false)

  onMount(() => {
    loadItems()

    const handler = (event: CustomEvent<CreatedItem>) => {
      setItems((prev) => [event.detail, ...prev])
      saveItems()
    }
    window.addEventListener("zyraxon:item-created", handler as EventListener)
    onCleanup(() => window.removeEventListener("zyraxon:item-created", handler as EventListener))
  })

  const loadItems = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        setItems(JSON.parse(stored))
      }
    } catch {}
  }

  const saveItems = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items()))
  }

  const filteredItems = () => {
    let result = items()
    if (selectedCategory() !== "all") {
      result = result.filter((item) => item.category === selectedCategory())
    }
    if (selectedAgent() !== "all") {
      result = result.filter((item) => item.agentMode === selectedAgent())
    }
    return result
  }

  const draftItems = () => filteredItems().filter((item) => item.status === "draft")
  const publishedItems = () => filteredItems().filter((item) => item.status === "published")

  const createItem = (category: ItemCategory) => {
    const newItem: CreatedItem = {
      id: `item-${Date.now()}`,
      name: `New ${CATEGORY_CONFIG[category].label}`,
      category,
      status: "draft",
      createdAt: new Date().toISOString(),
      agentMode: "general",
    }
    setItems((prev) => [newItem, ...prev])
    saveItems()
    setShowCreateMenu(false)

    window.dispatchEvent(
      new CustomEvent("zyraxon:item-created", { detail: newItem })
    )
  }

  const publishItem = async (itemId: string) => {
    setPublishingId(itemId)

    await new Promise((resolve) => setTimeout(resolve, 1500))

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, status: "published" as ItemStatus } : item
      )
    )
    saveItems()
    setPublishingId(null)

    window.dispatchEvent(
      new CustomEvent("zyraxon:item-published", {
        detail: items().find((i) => i.id === itemId),
      })
    )
  }

  const deleteItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId))
    saveItems()
  }

  const formatTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const getAgentInfo = (agentMode?: string) => {
    return AGENT_MODES.find((a) => a.id === agentMode) ?? AGENT_MODES[8]
  }

  return (
    <div class="h-full flex flex-col overflow-hidden p-3 gap-3">
      {/* Header */}
      <div class="shrink-0 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Icon name="globe" size="small" class="text-text" />
          <span class="text-14-medium text-text">Ecosystem</span>
          <Show when={draftItems().length > 0}>
            <span class="px-1.5 py-0.5 rounded-full bg-surface-raised text-10-regular text-text-weak">
              {draftItems().length} draft
            </span>
          </Show>
        </div>
        <div class="relative">
          <TooltipV2 value="Create new item" placement="bottom">
            <IconButtonV2
              icon={<Icon name="plus-small" />}
              variant="ghost-muted"
              size="normal"
              onClick={() => setShowCreateMenu(!showCreateMenu())}
            />
          </TooltipV2>
          <Show when={showCreateMenu()}>
            <div class="absolute right-0 top-full mt-1 z-50 w-56 py-1 rounded-xl border border-border-weaker-base bg-surface-raised shadow-lg">
              <div class="px-2 py-1 text-10-regular text-text-faint">Create from Agent</div>
              <For each={Object.entries(CATEGORY_CONFIG)}>
                {([key, config]) => (
                  <button
                    onClick={() => createItem(key as ItemCategory)}
                    class="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-surface-raised-base-active transition-colors"
                  >
                    <div
                      class="w-6 h-6 rounded-md flex items-center justify-center"
                      style={{ "background-color": `${config.color}20` }}
                    >
                      <Icon name={config.icon as any} size="small" style={{ color: config.color }} />
                    </div>
                    <div class="text-left">
                      <div class="text-12-medium text-text">{config.label}</div>
                      <div class="text-10-regular text-text-weak">{config.description}</div>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>

      {/* Agent Mode Filter */}
      <div class="shrink-0 flex items-center gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedAgent("all")}
          class={`px-2 py-1 rounded-lg text-10-regular whitespace-nowrap transition-colors ${
            selectedAgent() === "all"
              ? "bg-surface-raised text-text"
              : "text-text-weak hover:text-text"
          }`}
        >
          All Modes
        </button>
        <For each={AGENT_MODES}>
          {(agent) => (
            <button
              onClick={() => setSelectedAgent(agent.id)}
              class={`px-2 py-1 rounded-lg text-10-regular whitespace-nowrap transition-colors flex items-center gap-1 ${
                selectedAgent() === agent.id
                  ? "bg-surface-raised text-text"
                  : "text-text-weak hover:text-text"
              }`}
            >
              <Icon name={agent.icon as any} size="small" style={{ color: agent.color }} />
              {agent.label}
            </button>
          )}
        </For>
      </div>

      {/* Category Filter */}
      <div class="shrink-0 flex items-center gap-1 overflow-x-auto pb-1">
        <button
          onClick={() => setSelectedCategory("all")}
          class={`px-2 py-1 rounded-lg text-11-regular whitespace-nowrap transition-colors ${
            selectedCategory() === "all"
              ? "bg-surface-raised text-text"
              : "text-text-weak hover:text-text"
          }`}
        >
          All
        </button>
        <For each={Object.entries(CATEGORY_CONFIG)}>
          {([key, config]) => (
            <button
              onClick={() => setSelectedCategory(key as ItemCategory)}
              class={`px-2 py-1 rounded-lg text-11-regular whitespace-nowrap transition-colors ${
                selectedCategory() === key
                  ? "bg-surface-raised text-text"
                  : "text-text-weak hover:text-text"
              }`}
            >
              {config.label}
            </button>
          )}
        </For>
      </div>

      {/* Items List */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show
          when={filteredItems().length > 0}
          fallback={
            <div class="h-full flex flex-col items-center justify-center gap-3 text-center">
              <div class="w-14 h-14 rounded-2xl bg-surface-raised flex items-center justify-center">
                <Icon name="globe" size="large" class="text-text-weak" />
              </div>
              <div class="flex flex-col gap-1">
                <div class="text-13-medium text-text">No items yet</div>
                <div class="text-12-regular text-text-weak max-w-[200px]">
                  Create something with any agent mode and it will appear here
                </div>
              </div>
            </div>
          }
        >
          {/* Draft Items */}
          <Show when={draftItems().length > 0}>
            <div class="mb-3">
              <div class="text-11-regular text-text-weak mb-2 px-1">Drafts</div>
              <div class="flex flex-col gap-2">
                <For each={draftItems()}>
                  {(item) => {
                    const agent = getAgentInfo(item.agentMode)
                    return (
                      <div class="flex items-center gap-2 p-2 rounded-xl border border-border-weaker-base bg-surface-raised hover:border-border-default-base transition-colors">
                        <div
                          class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ "background-color": `${CATEGORY_CONFIG[item.category].color}20` }}
                        >
                          <Icon
                            name={CATEGORY_CONFIG[item.category].icon as any}
                            size="small"
                            style={{ color: CATEGORY_CONFIG[item.category].color }}
                          />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-12-medium text-text truncate">{item.name}</div>
                          <div class="flex items-center gap-1.5">
                            <span class="text-10-regular text-text-weak">
                              {CATEGORY_CONFIG[item.category].label}
                            </span>
                            <span class="text-10-regular text-text-faint">·</span>
                            <span class="flex items-center gap-0.5 text-10-regular" style={{ color: agent.color }}>
                              <Icon name={agent.icon as any} size="small" />
                              {agent.label}
                            </span>
                            <span class="text-10-regular text-text-faint">·</span>
                            <span class="text-10-regular text-text-weak">{formatTime(item.createdAt)}</span>
                          </div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <TooltipV2 value="Publish to marketplace" placement="bottom">
                            <IconButtonV2
                              icon={<Icon name="upload" size="small" />}
                              variant="ghost-muted"
                              size="normal"
                              loading={publishingId() === item.id}
                              onClick={() => publishItem(item.id)}
                            />
                          </TooltipV2>
                          <TooltipV2 value="Delete" placement="bottom">
                            <IconButtonV2
                              icon={<Icon name="trash" size="small" />}
                              variant="ghost-muted"
                              size="normal"
                              onClick={() => deleteItem(item.id)}
                            />
                          </TooltipV2>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>

          {/* Published Items */}
          <Show when={publishedItems().length > 0}>
            <div>
              <div class="text-11-regular text-text-weak mb-2 px-1">Published</div>
              <div class="flex flex-col gap-2">
                <For each={publishedItems()}>
                  {(item) => {
                    const agent = getAgentInfo(item.agentMode)
                    return (
                      <div class="flex items-center gap-2 p-2 rounded-xl border border-green-900/30 bg-green-900/10">
                        <div
                          class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ "background-color": `${CATEGORY_CONFIG[item.category].color}20` }}
                        >
                          <Icon
                            name={CATEGORY_CONFIG[item.category].icon as any}
                            size="small"
                            style={{ color: CATEGORY_CONFIG[item.category].color }}
                          />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="text-12-medium text-text truncate">{item.name}</div>
                          <div class="flex items-center gap-1.5">
                            <span class="text-10-regular text-green-400">Published</span>
                            <span class="text-10-regular text-text-faint">·</span>
                            <span class="flex items-center gap-0.5 text-10-regular" style={{ color: agent.color }}>
                              <Icon name={agent.icon as any} size="small" />
                              {agent.label}
                            </span>
                            <span class="text-10-regular text-text-faint">·</span>
                            <span class="text-10-regular text-text-weak">{formatTime(item.createdAt)}</span>
                          </div>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          <Show when={item.url}>
                            <TooltipV2 value="View in marketplace" placement="bottom">
                              <IconButtonV2
                                icon={<Icon name="external-link" size="small" />}
                                variant="ghost-muted"
                                size="normal"
                                onClick={() => item.url && window.open(item.url, "_blank")}
                              />
                            </TooltipV2>
                          </Show>
                        </div>
                      </div>
                    )
                  }}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </div>

      {/* Status Bar */}
      <div class="shrink-0 flex items-center justify-between px-2 py-1.5 rounded-lg border border-border-weaker-base bg-surface-base">
        <div class="text-10-regular text-text-faint">
          {items().length} items · {publishedItems().length} published
        </div>
        <div class="text-10-regular text-text-faint">
          zyraxonai.lovable.app
        </div>
      </div>
    </div>
  )
}
