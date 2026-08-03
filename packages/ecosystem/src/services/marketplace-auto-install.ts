/**
 * Marketplace Auto-Install Service
 * AI reads marketplace items and auto-installs/sets them up in the system
 * Bots, plugins, tools — everything gets wired in automatically
 */

import { getAllItems, getItemById, getHeaders } from "./github"
import type { EcosystemItem } from "../types"
import { GITHUB_API, MAIN_REPO, getGithubToken } from "../config"

const MAIN_TOKEN = getGithubToken()

interface InstalledItem {
  id: string
  name: string
  type: string
  category: string
  installedAt: string
  installMethod: "plugin" | "download" | "clone" | "config" | "link"
  status: "active" | "inactive" | "error"
  config?: Record<string, any>
  path?: string
}

interface InstallResult {
  success: boolean
  item: EcosystemItem
  method: string
  message: string
  config?: Record<string, any>
}

const INSTALL_STORAGE_KEY = "zyraxon_auto_installs"

function getInstalledItems(): InstalledItem[] {
  try {
    const raw = localStorage.getItem(INSTALL_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveInstalledItems(items: InstalledItem[]): void {
  localStorage.setItem(INSTALL_STORAGE_KEY, JSON.stringify(items))
}

function isInstalled(itemId: string): boolean {
  return getInstalledItems().some((i) => i.id === itemId)
}

/**
 * Determine the best install method for an item
 */
function getInstallMethod(item: EcosystemItem): InstalledItem["installMethod"] {
  const cat = item.category
  const type = item.type

  if (type === "plugin" || cat === "plugins") return "plugin"
  if (type === "bot" || cat === "ai-bots") return "config"
  if (type === "template" || cat === "website-templates" || cat === "landing-pages") return "link"
  if (type === "cli" || cat === "cli-tools") return "download"
  if (type === "sdk" || cat === "sdks") return "plugin"
  if (type === "workflow" || cat === "workflows") return "config"
  if (type === "model" || cat === "ai-models") return "config"
  if (type === "desktop-app" || cat === "desktop-apps") return "download"
  if (type === "app" || cat === "mobile-apps") return "link"
  if (type === "extension" || cat === "browser-extensions") return "link"
  if (type === "tool" || cat === "tools") return "download"
  if (type === "snippet" || cat === "code-snippets") return "config"
  if (type === "font" || cat === "fonts") return "download"
  if (type === "dataset" || cat === "datasets") return "download"

  return "link"
}

/**
 * Auto-install an item from the marketplace
 */
export async function autoInstallItem(item: EcosystemItem): Promise<InstallResult> {
  if (isInstalled(item.id)) {
    return {
      success: true,
      item,
      method: "already_installed",
      message: `${item.name} is already installed`,
    }
  }

  const method = getInstallMethod(item)
  const installed: InstalledItem = {
    id: item.id,
    name: item.name,
    type: item.type,
    category: item.category,
    installedAt: new Date().toISOString(),
    installMethod: method,
    status: "active",
  }

  switch (method) {
    case "plugin": {
      installed.config = {
        installCommand: item.installCommand || `npm install ${item.name}`,
        repository: item.githubRepo || item.repository,
        version: item.version,
      }
      break
    }
    case "config": {
      installed.config = {
        botType: item.type,
        category: item.category,
        liveDemo: item.liveDemo,
        githubRepo: item.githubRepo || item.repository,
        downloadUrl: item.downloadUrl,
        tags: item.tags,
      }
      break
    }
    case "download": {
      installed.path = item.downloadUrl || item.githubRepo || item.repository
      break
    }
    case "clone": {
      installed.path = item.githubRepo || item.repository
      break
    }
    case "link": {
      installed.path = item.liveDemo || item.downloadUrl || item.githubRepo || item.repository
      break
    }
  }

  const items = getInstalledItems()
  items.push(installed)
  saveInstalledItems(items)

  return {
    success: true,
    item,
    method,
    message: `${item.name} installed successfully via ${method}`,
    config: installed.config,
  }
}

/**
 * Auto-install multiple items at once
 */
export async function autoInstallBatch(items: EcosystemItem[]): Promise<InstallResult[]> {
  const results: InstallResult[] = []
  for (const item of items) {
    const result = await autoInstallItem(item)
    results.push(result)
  }
  return results
}

/**
 * Get all installed items
 */
export function getInstalled(): InstalledItem[] {
  return getInstalledItems()
}

/**
 * Get installed items by category
 */
export function getInstalledByCategory(category: string): InstalledItem[] {
  return getInstalledItems().filter((i) => i.category === category)
}

/**
 * Get installed items by type
 */
export function getInstalledByType(type: string): InstalledItem[] {
  return getInstalledItems().filter((i) => i.type === type)
}

/**
 * Uninstall an item
 */
export function uninstallItem(itemId: string): boolean {
  const items = getInstalledItems()
  const filtered = items.filter((i) => i.id !== itemId)
  if (filtered.length === items.length) return false
  saveInstalledItems(filtered)
  return true
}

/**
 * Toggle item active/inactive status
 */
export function toggleItemStatus(itemId: string): boolean {
  const items = getInstalledItems()
  const item = items.find((i) => i.id === itemId)
  if (!item) return false
  item.status = item.status === "active" ? "inactive" : "active"
  saveInstalledItems(items)
  return true
}

/**
 * Search marketplace and auto-install all matching items
 */
export async function searchAndInstall(query: string): Promise<InstallResult[]> {
  const allItems = await getAllItems()
  const matching = allItems.filter(
    (item) =>
      item.name.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
  )
  return autoInstallBatch(matching)
}

/**
 * Auto-install all items from a specific author
 */
export async function installByAuthor(authorId: string): Promise<InstallResult[]> {
  const allItems = await getAllItems()
  const authorItems = allItems.filter((item) => item.authorId === authorId)
  return autoInstallBatch(authorItems)
}

/**
 * Get install stats
 */
export function getInstallStats(): {
  total: number
  active: number
  inactive: number
  byCategory: Record<string, number>
  byType: Record<string, number>
} {
  const items = getInstalledItems()
  const byCategory: Record<string, number> = {}
  const byType: Record<string, number> = {}

  items.forEach((item) => {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1
    byType[item.type] = (byType[item.type] || 0) + 1
  })

  return {
    total: items.length,
    active: items.filter((i) => i.status === "active").length,
    inactive: items.filter((i) => i.status === "inactive").length,
    byCategory,
    byType,
  }
}

/**
 * Export installed items config (for AI context injection)
 */
export function exportInstallConfig(): string {
  const items = getInstalledItems()
  return JSON.stringify(
    {
      installedCount: items.length,
      items: items.map((i) => ({
        name: i.name,
        type: i.type,
        category: i.category,
        status: i.status,
        config: i.config,
      })),
    },
    null,
    2
  )
}
