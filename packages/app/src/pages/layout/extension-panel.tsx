import { createSignal, createEffect, For, Show, onCleanup, type JSX } from "solid-js"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Icon } from "@opencode-ai/ui/icon"

interface Extension {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  publisher: string
  isActive: boolean
  icon?: string
}

export const ExtensionPanel = (): JSX.Element => {
  const [extensions, setExtensions] = createSignal<Extension[]>([])
  const [search, setSearch] = createSignal("")
  const [tab, setTab] = createSignal<"installed" | "marketplace">("installed")
  const [loading, setLoading] = createSignal(false)
  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  const api = () => (window as any).api

  const loadExtensions = async () => {
    try {
      const list = await api()?.extensionHost?.getExtensions()
      if (list) setExtensions(list)
    } catch {}
  }

  createEffect(() => {
    loadExtensions()
  })

  const filteredExtensions = () => {
    const q = search().toLowerCase()
    return extensions().filter(
      (ext) =>
        ext.displayName.toLowerCase().includes(q) ||
        ext.name.toLowerCase().includes(q) ||
        ext.publisher.toLowerCase().includes(q),
    )
  }

  const toggleExtension = async (ext: Extension) => {
    try {
      if (ext.isActive) {
        await api()?.extensionHost?.deactivateExtension(ext.id)
      } else {
        await api()?.extensionHost?.activateExtension(ext.id)
      }
      await loadExtensions()
    } catch {}
  }

  const uninstallExtension = async (ext: Extension) => {
    try {
      await api()?.uninstallExtension(ext.id)
      await loadExtensions()
    } catch {}
  }

  const browseMarketplace = () => {
    try {
      ;(window as any).open?.("/ecosystem", "_blank")
    } catch {}
  }

  return (
    <div class="h-full flex flex-col bg-background-base text-text-strong overflow-hidden">
      {/* Header */}
      <div class="px-3 py-2 border-b border-border-base">
        <div class="flex items-center gap-2 mb-2">
          <Icon name="puzzle" size="small" class="text-icon-base" />
          <span class="text-14-semibold">Extensions</span>
        </div>
        <input
          type="text"
          placeholder="Search extensions..."
          class="w-full px-2 py-1 text-13-regular bg-surface-raised-base border border-border-base rounded-md focus:outline-none focus:border-text-interactive-base"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      {/* Tabs */}
      <div class="flex border-b border-border-base">
        <button
          classList={{
            "flex-1 px-3 py-1.5 text-13-medium cursor-pointer transition-colors": true,
            "text-text-interactive-base border-b-2 border-text-interactive-base": tab() === "installed",
            "text-text-weak hover:text-text-strong": tab() !== "installed",
          }}
          onClick={() => setTab("installed")}
        >
          Installed ({extensions().length})
        </button>
        <button
          classList={{
            "flex-1 px-3 py-1.5 text-13-medium cursor-pointer transition-colors": true,
            "text-text-interactive-base border-b-2 border-text-interactive-base": tab() === "marketplace",
            "text-text-weak hover:text-text-strong": tab() !== "marketplace",
          }}
          onClick={() => setTab("marketplace")}
        >
          Marketplace
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto">
        <Show when={tab() === "installed"}>
          <Show
            when={filteredExtensions().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center h-full p-6 text-center">
                <Icon name="puzzle" size="large" class="text-icon-weak mb-3" />
                <p class="text-14-regular text-text-weak mb-1">No extensions installed</p>
                <p class="text-12-regular text-text-muted mb-4">
                  Browse the marketplace to install extensions
                </p>
                <button
                  class="px-4 py-1.5 text-13-medium bg-text-interactive-base text-background-base rounded-md hover:opacity-90 transition-opacity"
                  onClick={browseMarketplace}
                >
                  Browse Marketplace
                </button>
              </div>
            }
          >
            <For each={filteredExtensions()}>
              {(ext) => (
                <ExtensionItem
                  extension={ext}
                  expanded={expandedId() === ext.id}
                  onToggle={() => toggleExtension(ext)}
                  onExpand={() => setExpandedId(expandedId() === ext.id ? null : ext.id)}
                  onUninstall={() => uninstallExtension(ext)}
                />
              )}
            </For>
          </Show>
        </Show>

        <Show when={tab() === "marketplace"}>
          <div class="flex flex-col items-center justify-center h-full p-6 text-center">
            <Icon name="cloud-upload" size="large" class="text-icon-weak mb-3" />
            <p class="text-14-regular text-text-weak mb-1">Extension Marketplace</p>
            <p class="text-12-regular text-text-muted mb-4">
              Search and install extensions from the marketplace
            </p>
            <button
              class="px-4 py-1.5 text-13-medium bg-text-interactive-base text-background-base rounded-md hover:opacity-90 transition-opacity"
              onClick={browseMarketplace}
            >
              Open Marketplace
            </button>
          </div>
        </Show>
      </div>
    </div>
  )
}

function ExtensionItem(props: {
  extension: Extension
  expanded: boolean
  onToggle: () => void
  onExpand: () => void
  onUninstall: () => void
}): JSX.Element {
  const initials = () => {
    const name = props.extension.displayName || props.extension.name
    return name.slice(0, 2).toUpperCase()
  }

  return (
    <div class="border-b border-border-base">
      <div
        class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-surface-raised-base-hover transition-colors"
        onClick={props.onExpand}
      >
        {/* Icon */}
        <div class="w-8 h-8 rounded bg-surface-raised-base flex items-center justify-center shrink-0">
          <Show
            when={props.extension.icon}
            fallback={
              <span class="text-12-semibold text-icon-base">{initials()}</span>
            }
          >
            <img src={props.extension.icon} class="w-8 h-8 rounded" alt="" />
          </Show>
        </div>

        {/* Info */}
        <div class="flex-1 min-w-0">
          <div class="text-13-medium text-text-strong truncate">
            {props.extension.displayName || props.extension.name}
          </div>
          <div class="text-12-regular text-text-weak truncate">
            {props.extension.publisher} v{props.extension.version}
          </div>
        </div>

        {/* Toggle */}
        <button
          classList={{
            "relative w-8 h-4.5 rounded-full transition-colors cursor-pointer": true,
            "bg-text-interactive-base": props.extension.isActive,
            "bg-surface-raised-base border border-border-base": !props.extension.isActive,
          }}
          onClick={(e) => {
            e.stopPropagation()
            props.onToggle()
          }}
          aria-label={props.extension.isActive ? "Disable" : "Enable"}
        >
          <div
            classList={{
              "absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all": true,
              "left-4 bg-background-base": props.extension.isActive,
              "left-0.5 bg-icon-weak": !props.extension.isActive,
            }}
          />
        </button>
      </div>

      {/* Expanded details */}
      <Show when={props.expanded}>
        <div class="px-3 pb-3">
          <p class="text-12-regular text-text-weak mb-2">
            {props.extension.description || "No description"}
          </p>
          <div class="flex gap-2">
            <Show when={props.extension.isActive}>
              <button
                class="px-2 py-0.5 text-12-medium text-text-warning border border-text-warning rounded hover:bg-surface-warning-base transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onToggle()
                }}
              >
                Disable
              </button>
            </Show>
            <Show when={!props.extension.isActive}>
              <button
                class="px-2 py-0.5 text-12-medium text-text-interactive-base border border-text-interactive-base rounded hover:bg-surface-raised-base-hover transition-colors"
                onClick={(e) => {
                  e.stopPropagation()
                  props.onToggle()
                }}
              >
                Enable
              </button>
            </Show>
            <button
              class="px-2 py-0.5 text-12-medium text-text-danger border border-text-danger rounded hover:bg-surface-danger-base transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                props.onUninstall()
              }}
            >
              Uninstall
            </button>
          </div>
        </div>
      </Show>
    </div>
  )
}
