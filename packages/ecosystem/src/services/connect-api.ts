/**
 * Share/Connect API — External Apps Connect to ZYRAXON Marketplace
 *
 * Any app, bot, or service can use this API to:
 * - Search marketplace items
 * - Get item details + download URLs
 * - Verify tokens
 * - Install items programmatically
 * - Get category listings
 */

import { getAllItems, getItemById, getHeaders } from "./github"
import { retrieveUserToken, hasStoredToken } from "./token-storage"
import type { EcosystemItem } from "../types"
import { GITHUB_API, MAIN_REPO, getGithubToken } from "../config"

interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
  timestamp: string
  rateLimit?: { remaining: number; reset: number }
}

interface SearchParams {
  query?: string
  category?: string
  type?: string
  tags?: string[]
  limit?: number
  offset?: number
  sort?: "newest" | "popular" | "rating" | "downloads"
}

interface InstallRequest {
  itemId: string
  userId: string
  action: "download" | "import" | "clone" | "link"
}

interface ConnectSession {
  appId: string
  appName: string
  userId: string
  token: string
  permissions: string[]
  createdAt: string
  expiresAt: string
}

// ============================================================
// PUBLIC API — No auth required
// ============================================================

/**
 * Search marketplace items
 * GET /api/marketplace/search?q=...&category=...&type=...&limit=...
 */
export async function searchMarketplace(params: SearchParams): Promise<APIResponse<EcosystemItem[]>> {
  try {
    const allItems = await getAllItems()
    let results = [...allItems]

    if (params.query) {
      const q = params.query.toLowerCase()
      results = results.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    if (params.category) {
      results = results.filter((item) => item.category === params.category)
    }

    if (params.type) {
      results = results.filter((item) => item.type === params.type)
    }

    if (params.tags && params.tags.length > 0) {
      results = results.filter((item) => params.tags!.some((t) => item.tags.includes(t)))
    }

    switch (params.sort) {
      case "popular":
        results.sort((a, b) => b.downloads - a.downloads)
        break
      case "rating":
        results.sort((a, b) => b.rating - a.rating)
        break
      case "downloads":
        results.sort((a, b) => b.downloads - a.downloads)
        break
      case "newest":
      default:
        results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }

    const limit = params.limit || 20
    const offset = params.offset || 0
    results = results.slice(offset, offset + limit)

    return {
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Search failed",
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * Get item details by ID
 * GET /api/marketplace/item/:id
 */
export async function getItemDetails(itemId: string): Promise<APIResponse<EcosystemItem>> {
  try {
    const allItems = await getAllItems()
    const item = allItems.find((i) => i.id === itemId)
    if (!item) {
      return { success: false, error: "Item not found", timestamp: new Date().toISOString() }
    }
    return { success: true, data: item, timestamp: new Date().toISOString() }
  } catch (error) {
    return { success: false, error: "Failed to fetch item", timestamp: new Date().toISOString() }
  }
}

/**
 * Get all categories with item counts
 * GET /api/marketplace/categories
 */
export async function getCategoriesAPI(): Promise<APIResponse<{ id: string; name: string; count: number }[]>> {
  try {
    const allItems = await getAllItems()
    const categoryMap: Record<string, number> = {}
    allItems.forEach((item) => {
      categoryMap[item.category] = (categoryMap[item.category] || 0) + 1
    })

    const categories = Object.entries(categoryMap).map(([id, count]) => ({
      id,
      name: id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    }))

    return { success: true, data: categories, timestamp: new Date().toISOString() }
  } catch (error) {
    return { success: false, error: "Failed to fetch categories", timestamp: new Date().toISOString() }
  }
}

/**
 * Get featured/popular items
 * GET /api/marketplace/featured
 */
export async function getFeatured(): Promise<APIResponse<EcosystemItem[]>> {
  try {
    const allItems = await getAllItems()
    const featured = allItems
      .filter((item) => item.featured || item.downloads > 100 || item.rating >= 4.5)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 20)

    return { success: true, data: featured, timestamp: new Date().toISOString() }
  } catch (error) {
    return { success: false, error: "Failed to fetch featured items", timestamp: new Date().toISOString() }
  }
}

/**
 * Get marketplace stats
 * GET /api/marketplace/stats
 */
export async function getMarketplaceStats(): Promise<APIResponse<{
  totalItems: number
  totalDownloads: number
  totalUsers: number
  categories: number
}>> {
  try {
    const allItems = await getAllItems()
    const uniqueAuthors = new Set(allItems.map((i) => i.authorId))

    return {
      success: true,
      data: {
        totalItems: allItems.length,
        totalDownloads: allItems.reduce((sum, i) => sum + i.downloads, 0),
        totalUsers: uniqueAuthors.size,
        categories: new Set(allItems.map((i) => i.category)).size,
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return { success: false, error: "Failed to fetch stats", timestamp: new Date().toISOString(), }
  }
}

// ============================================================
// AUTHENTICATED API — Token required
// ============================================================

/**
 * Verify a user token
 * POST /api/auth/verify
 */
export async function verifyToken(token: string): Promise<APIResponse<{ valid: boolean; username?: string; userId?: string }>> {
  try {
    const response = await fetch(`${GITHUB_API}/user`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.v3+json" },
    })
    if (!response.ok) {
      return { success: true, data: { valid: false }, timestamp: new Date().toISOString() }
    }
    const user = await response.json()
    return {
      success: true,
      data: { valid: true, username: user.login, userId: `user-${user.id}` },
      timestamp: new Date().toISOString(),
    }
  } catch {
    return { success: false, error: "Token verification failed", timestamp: new Date().toISOString() }
  }
}

/**
 * Get download URL for an item (direct download, no redirect)
 * GET /api/marketplace/download/:id
 */
export async function getDownloadUrl(itemId: string): Promise<APIResponse<{ downloadUrl: string; fileName: string; fileSize?: string }>> {
  try {
    const allItems = await getAllItems()
    const item = allItems.find((i) => i.id === itemId)
    if (!item) {
      return { success: false, error: "Item not found", timestamp: new Date().toISOString() }
    }

    let downloadUrl = item.downloadUrl || ""

    // If download URL points to GitHub release, resolve to direct URL
    if (downloadUrl.includes("github.com") && downloadUrl.includes("/releases/")) {
      const releaseMatch = downloadUrl.match(/\/releases\/download\/(.+)/)
      if (releaseMatch) {
        const parts = downloadUrl.split("/")
        const owner = parts[3]
        const repo = parts[4]
        const assetPath = releaseMatch[1]
        downloadUrl = `https://github.com/${owner}/${repo}/releases/download/${assetPath}`
      }
    }

    // Extract filename from URL
    const urlParts = downloadUrl.split("/")
    const fileName = urlParts[urlParts.length - 1].split("?")[0]

    return {
      success: true,
      data: {
        downloadUrl,
        fileName,
        fileSize: item.fileSize,
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return { success: false, error: "Failed to get download URL", timestamp: new Date().toISOString() }
  }
}

/**
 * Install an item — returns install instructions
 * POST /api/marketplace/install
 */
export async function installItem(request: InstallRequest): Promise<APIResponse<{
  action: string
  command?: string
  url?: string
  message: string
}>> {
  try {
    const allItems = await getAllItems()
    const item = allItems.find((i) => i.id === request.itemId)
    if (!item) {
      return { success: false, error: "Item not found", timestamp: new Date().toISOString() }
    }

    switch (request.action) {
      case "download":
        if (item.downloadUrl) {
          return {
            success: true,
            data: {
              action: "download",
              url: item.downloadUrl,
              message: `Download ${item.name} from ${item.downloadUrl}`,
            },
            timestamp: new Date().toISOString(),
          }
        }
        break
      case "import":
        if (item.installCommand) {
          return {
            success: true,
            data: {
              action: "import",
              command: item.installCommand,
              message: `Run: ${item.installCommand}`,
            },
            timestamp: new Date().toISOString(),
          }
        }
        break
      case "clone":
        if (item.githubRepo || item.repository) {
          const repoUrl = item.githubRepo || item.repository
          return {
            success: true,
            data: {
              action: "clone",
              command: `git clone ${repoUrl}`,
              url: repoUrl,
              message: `Clone ${item.name} from ${repoUrl}`,
            },
            timestamp: new Date().toISOString(),
          }
        }
        break
      case "link":
        if (item.liveDemo) {
          return {
            success: true,
            data: {
              action: "link",
              url: item.liveDemo,
              message: `Visit ${item.name} at ${item.liveDemo}`,
            },
            timestamp: new Date().toISOString(),
          }
        }
        break
    }

    return {
      success: true,
      data: {
        action: "info",
        message: `${item.name}: ${item.description}`,
        url: item.githubRepo || item.repository || item.liveDemo,
      },
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return { success: false, error: "Install failed", timestamp: new Date().toISOString() }
  }
}

/**
 * Get remix chain for an item
 * GET /api/marketplace/remix/:id
 */
export async function getRemixInfo(itemId: string): Promise<APIResponse<{
  item: EcosystemItem
  original?: EcosystemItem
  remixes: EcosystemItem[]
  chain: string[]
}>> {
  try {
    const { getOriginal, getRemixes, getRemixChain } = await import("./remix")
    const allItems = await getAllItems()
    const item = allItems.find((i) => i.id === itemId)
    if (!item) {
      return { success: false, error: "Item not found", timestamp: new Date().toISOString() }
    }

    const original = item.remixedFrom ? allItems.find((i) => i.id === item.remixedFrom) : undefined
    const remixes = allItems.filter((i) => i.remixedFrom === itemId)
    const chain = item.remixedFrom ? (await getRemixChain(itemId)).map((i) => i.id) : [itemId]

    return {
      success: true,
      data: { item, original, remixes, chain },
      timestamp: new Date().toISOString(),
    }
  } catch (error) {
    return { success: false, error: "Failed to get remix info", timestamp: new Date().toISOString() }
  }
}
