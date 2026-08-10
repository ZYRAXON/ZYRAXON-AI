/**
 * Installed Extensions
 * 
 * Shows all extensions installed in ZYRAXON with uninstall and toggle functionality.
 * No VS Code dependency — managed directly by ZYRAXON Extension Manager.
 */

import { type Component, createSignal, createEffect, For, Show, onMount } from "solid-js"

interface InstalledExt {
  id: string
  displayName: string
  version: string
  publisher: string
  description: string
  installedAt: string
  vsixPath: string
  extensionPath: string
  icon?: string
  size: number
  status: "active" | "inactive" | "error"
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export const InstalledExtensions: Component = () => {
  const [extensions, setExtensions] = createSignal<InstalledExt[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [uninstalling, setUninstalling] = createSignal<string | null>(null)
  const [toggling, setToggling] = createSignal<string | null>(null)
  const [message, setMessage] = createSignal<{ type: "success" | "error"; text: string } | null>(null)

  const loadExtensions = async () => {
    setLoading(true)
    setError(null)
    try {
      const api = (window as any).api
      if (api?.getInstalledExtensions) {
        const result = await api.getInstalledExtensions()
        setExtensions(result || [])
      } else {
        setExtensions([])
      }
    } catch (err: any) {
      setError(err.message || "Failed to load installed extensions")
    } finally {
      setLoading(false)
    }
  }

  onMount(loadExtensions)

  const handleUninstall = async (ext: InstalledExt) => {
    if (uninstalling()) return
    setUninstalling(ext.id)
    setMessage(null)
    try {
      const api = (window as any).api
      if (api?.uninstallExtension) {
        const result = await api.uninstallExtension(ext.id)
        if (result.success) {
          setExtensions((prev) => prev.filter((e) => e.id !== ext.id))
          setMessage({ type: "success", text: `${ext.displayName} uninstalled successfully` })
          // Send AI system message
          sendAISystemMessage(`Extension "${ext.displayName}" (${ext.id}) has been uninstalled from ZYRAXON.`)
        } else {
          setMessage({ type: "error", text: result.error || "Failed to uninstall" })
        }
      } else {
        // Fallback: remove from localStorage
        const raw = localStorage.getItem("zyraxon_installed_extensions")
        const ids: string[] = raw ? JSON.parse(raw) : []
        const updated = ids.filter((id) => id !== ext.id)
        localStorage.setItem("zyraxon_installed_extensions", JSON.stringify(updated))
        setExtensions((prev) => prev.filter((e) => e.id !== ext.id))
        setMessage({ type: "success", text: `${ext.displayName} uninstalled successfully` })
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to uninstall" })
    } finally {
      setUninstalling(null)
    }
  }

  const handleToggle = async (ext: InstalledExt) => {
    if (toggling()) return
    setToggling(ext.id)
    setMessage(null)
    try {
      const api = (window as any).api
      if (api?.toggleExtensionStatus) {
        const result = await api.toggleExtensionStatus(ext.id)
        if (result.success) {
          setExtensions((prev) =>
            prev.map((e) =>
              e.id === ext.id
                ? { ...e, status: (result.status || "active") as "active" | "inactive" }
                : e
            )
          )
          const newStatus = result.status === "active" ? "activated" : "deactivated"
          setMessage({ type: "success", text: `${ext.displayName} ${newStatus}` })
        } else {
          setMessage({ type: "error", text: result.error || "Failed to toggle" })
        }
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Failed to toggle" })
    } finally {
      setToggling(null)
    }
  }

  const sendAISystemMessage = (text: string) => {
    // Dispatch event for AI system message
    window.dispatchEvent(
      new CustomEvent("zyraxon:ai-system-message", { detail: { message: text } })
    )
  }

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      {/* Header */}
      <div>
        <h2 style={{ "font-size": "20px", "font-weight": "700", color: "#e6edf3", margin: "0" }}>
          My Extensions
        </h2>
        <p style={{ margin: "4px 0 0", "font-size": "13px", color: "#8b949e" }}>
          Manage extensions installed in ZYRAXON AI — {extensions().length} installed.
        </p>
      </div>

      {/* Message */}
      <Show when={message()}>
        <div
          style={{
            padding: "12px 16px",
            border: `1px solid ${message()!.type === "success" ? "#238636" : "#f85149"}`,
            background: message()!.type === "success" ? "rgba(35,134,54,0.15)" : "rgba(248,81,73,0.15)",
            "border-radius": "8px",
            color: message()!.type === "success" ? "#3fb950" : "#f85149",
            "font-size": "13px",
          }}
        >
          {message()!.text}
        </div>
      </Show>

      {/* Loading */}
      <Show when={loading()}>
        <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
          <For each={Array.from({ length: 3 })}>
            {() => (
              <div style={{
                height: "120px",
                "border-radius": "10px",
                background: "#161b22",
                border: "1px solid #21262d",
                opacity: "0.6",
              }} />
            )}
          </For>
        </div>
      </Show>

      {/* Error */}
      <Show when={error()}>
        <div style={{
          padding: "14px",
          border: "1px solid #f8514955",
          background: "#f8514915",
          "border-radius": "8px",
          color: "#f85149",
          "font-size": "13px",
        }}>
          {error()}
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && !error() && extensions().length === 0}>
        <div style={{
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          padding: "60px 20px",
          background: "#161b22",
          border: "1px solid #21262d",
          "border-radius": "12px",
        }}>
          <div style={{
            width: "64px",
            height: "64px",
            "border-radius": "16px",
            background: "#0d1117",
            border: "1px solid #21262d",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "margin-bottom": "16px",
          }}>
            <span style={{ "font-size": "28px" }}>📦</span>
          </div>
          <p style={{ "font-size": "16px", color: "#c9d1d9", margin: "0 0 8px" }}>
            No Extensions Installed
          </p>
          <p style={{ "font-size": "13px", color: "#8b949e", margin: "0", "text-align": "center", "max-width": "300px" }}>
            Browse the Extensions marketplace and install your first extension. It will appear here for easy management.
          </p>
        </div>
      </Show>

      {/* Extensions list */}
      <Show when={!loading() && extensions().length > 0}>
        <div style={{ display: "flex", "flex-direction": "column", gap: "8px" }}>
          <For each={extensions()}>
            {(ext) => (
              <div style={{
                display: "flex",
                "align-items": "center",
                gap: "14px",
                padding: "14px 16px",
                background: "#161b22",
                border: "1px solid #21262d",
                "border-radius": "10px",
                transition: "border-color 0.15s ease",
              }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#30363d")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#21262d")}
              >
                {/* Icon */}
                <div style={{
                  width: "48px",
                  height: "48px",
                  "border-radius": "8px",
                  background: "#0d1117",
                  border: "1px solid #21262d",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  "flex-shrink": "0",
                  overflow: "hidden",
                }}>
                  <Show
                    when={ext.icon}
                    fallback={<span style={{ "font-size": "20px" }}>📦</span>}
                  >
                    <img src={ext.icon} alt="" style={{ width: "100%", height: "100%", "object-fit": "contain" }} />
                  </Show>
                </div>

                {/* Info */}
                <div style={{ flex: "1", "min-width": "0" }}>
                  <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
                    <span style={{ "font-size": "14px", "font-weight": "600", color: "#e6edf3" }}>
                      {ext.displayName}
                    </span>
                    <span style={{
                      "font-size": "10px",
                      padding: "2px 6px",
                      "border-radius": "4px",
                      background: ext.status === "active" ? "rgba(63,185,80,0.15)" : "rgba(139,148,158,0.15)",
                      color: ext.status === "active" ? "#3fb950" : "#8b949e",
                      "text-transform": "uppercase",
                      "letter-spacing": "0.5px",
                    }}>
                      {ext.status}
                    </span>
                  </div>
                  <p style={{
                    margin: "2px 0 0",
                    "font-size": "12px",
                    color: "#8b949e",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                    "white-space": "nowrap",
                  }}>
                    {ext.publisher} • v{ext.version} • {formatSize(ext.size)}
                  </p>
                  <Show when={ext.description}>
                    <p style={{
                      margin: "4px 0 0",
                      "font-size": "11.5px",
                      color: "#6e7681",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}>
                      {ext.description}
                    </p>
                  </Show>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: "8px", "flex-shrink": "0" }}>
                  <button
                    onClick={() => handleToggle(ext)}
                    disabled={toggling() === ext.id}
                    style={{
                      padding: "6px 12px",
                      "border-radius": "6px",
                      border: "1px solid #30363d",
                      background: ext.status === "active" ? "rgba(63,185,80,0.1)" : "#21262d",
                      color: ext.status === "active" ? "#3fb950" : "#8b949e",
                      "font-size": "12px",
                      cursor: toggling() === ext.id ? "not-allowed" : "pointer",
                      "font-family": "inherit",
                      opacity: toggling() === ext.id ? "0.5" : "1",
                    }}
                  >
                    {toggling() === ext.id ? "..." : ext.status === "active" ? "Disable" : "Enable"}
                  </button>
                  <button
                    onClick={() => handleUninstall(ext)}
                    disabled={uninstalling() === ext.id}
                    style={{
                      padding: "6px 12px",
                      "border-radius": "6px",
                      border: "1px solid #f8514944",
                      background: "rgba(248,81,73,0.1)",
                      color: "#f85149",
                      "font-size": "12px",
                      cursor: uninstalling() === ext.id ? "not-allowed" : "pointer",
                      "font-family": "inherit",
                      opacity: uninstalling() === ext.id ? "0.5" : "1",
                    }}
                  >
                    {uninstalling() === ext.id ? "Removing..." : "Uninstall"}
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export default InstalledExtensions
