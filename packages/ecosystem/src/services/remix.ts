/**
 * Remix Service — Download, Customize, Republish
 * Users can take any marketplace item, customize it, and republish as their own
 * Original creator always gets credit via remixedFrom field
 */

import { getAllItems, getItemById, publishItem, getHeaders } from "./github"
import { getGitHubStorage } from "./github-data"
import { getAuthState } from "./auth"
import type { EcosystemItem } from "../types"
import { GITHUB_API, MAIN_REPO, getGithubToken } from "../config"

const MAIN_TOKEN = getGithubToken()

interface RemixResult {
  success: boolean
  originalItem: EcosystemItem
  message: string
  workspacePath?: string
}

interface RemixPublishResult {
  success: boolean
  newItemId: string
  originalItemId: string
  message: string
}

/**
 * Download an item's source from the marketplace
 * Fetches source code, config, or files from GitHub
 */
export async function downloadForRemix(itemId: string): Promise<RemixResult> {
  const allItems = await getAllItems()
  const item = allItems.find((i) => i.id === itemId)
  if (!item) {
    return { success: false, originalItem: null as any, message: "Item not found in marketplace" }
  }

  const storage = getGitHubStorage()
  if (!storage) {
    return { success: false, originalItem: item, message: "GitHub not connected. Please login first." }
  }

  try {
    // Fetch source code from GitHub repo if available
    if (item.githubRepo || item.repository) {
      const repoUrl = item.githubRepo || item.repository
      const repoMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
      if (repoMatch) {
        const [, owner, repo] = repoMatch
        // Try to fetch the repo contents
        const response = await fetch(
          `${GITHUB_API}/repos/${owner}/${repo}/contents/`,
          { headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` } }
        )
        if (response.ok) {
          const contents = await response.json()
          // Store the source listing for the user
          await storage.updateFile(`remix/${itemId}/source-index.json`, {
            originalId: itemId,
            originalAuthor: item.author,
            repoUrl: repoUrl,
            files: Array.isArray(contents) ? contents.map((f: any) => ({ name: f.name, path: f.path, type: f.type, download_url: f.download_url })) : [],
            downloadedAt: new Date().toISOString(),
          }, `Download source for remix: ${item.name}`)
        }
      }
    }

    // Store remix metadata
    await storage.updateFile(`remix/${itemId}/remix-meta.json`, {
      originalId: itemId,
      originalName: item.name,
      originalAuthor: item.author,
      originalAuthorId: item.authorId,
      category: item.category,
      type: item.type,
      description: item.description,
      tags: item.tags,
      liveDemo: item.liveDemo,
      downloadUrl: item.downloadUrl,
      installCommand: item.installCommand,
      githubRepo: item.githubRepo || item.repository,
      downloadedAt: new Date().toISOString(),
    }, `Remix metadata for: ${item.name}`)

    return {
      success: true,
      originalItem: item,
      message: `Downloaded "${item.name}" for remix. You can now customize and republish!`,
      workspacePath: `remix/${itemId}`,
    }
  } catch (error) {
    return {
      success: true,
      originalItem: item,
      message: `Item info loaded. You can customize "${item.name}" and republish.`,
      workspacePath: `remix/${itemId}`,
    }
  }
}

/**
 * Create a remix — takes original item data + user customizations → publishes new item
 */
export async function createRemix(
  originalItemId: string,
  customizations: {
    name?: string
    description?: string
    tags?: string[]
    version?: string
    liveDemo?: string
    downloadUrl?: string
    installCommand?: string
    githubRepo?: string
    coverImage?: string
    screenshots?: string[]
    gameConfig?: any
  }
): Promise<RemixPublishResult> {
  const authState = getAuthState()
  if (!authState.user) {
    return { success: false, newItemId: "", originalItemId, message: "Please login to publish a remix" }
  }

  const allItems = await getAllItems()
  const original = allItems.find((i) => i.id === originalItemId)
  if (!original) {
    return { success: false, newItemId: "", originalItemId, message: "Original item not found" }
  }

  // Validate: must change name or description
  const newName = customizations.name || `${original.name} Remix`
  const newDesc = customizations.description || original.description
  if (newName === original.name && newDesc === original.description) {
    return { success: false, newItemId: "", originalItemId, message: "Please change the name or description to create a unique remix" }
  }

  const remixId = `remix-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`

  const remixItem: Partial<EcosystemItem> = {
    id: remixId,
    name: newName,
    description: newDesc,
    version: customizations.version || "1.0.0",
    author: authState.user.username,
    authorAvatar: authState.user.avatarUrl,
    authorId: authState.user.id || authState.user.username,
    category: original.category,
    type: original.type,
    tags: customizations.tags || [...original.tags, "remix"],
    coverImage: customizations.coverImage || original.coverImage,
    logo: original.logo,
    screenshots: customizations.screenshots || original.screenshots,
    downloads: 0,
    rating: 0,
    reviews: 0,
    likeCount: 0,
    commentCount: 0,
    verified: false,
    featured: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    repository: customizations.githubRepo || original.githubRepo || original.repository,
    liveDemo: customizations.liveDemo || original.liveDemo,
    downloadUrl: customizations.downloadUrl || original.downloadUrl,
    installCommand: customizations.installCommand || original.installCommand,
    githubRepo: customizations.githubRepo || original.githubRepo,
    platforms: original.platforms,
    license: original.license,
    remixedFrom: originalItemId,
    remixCount: 0,
    gameConfig: customizations.gameConfig || original.gameConfig,
  }

  try {
    await publishItem(remixItem as EcosystemItem)

    // Increment remix count on original
    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${MAIN_REPO}/contents/marketplace/published/index.json`,
        { headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` } }
      )
      if (response.ok) {
        const data = await response.json()
        if (data.content) {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))))
          if (Array.isArray(decoded)) {
            const originalIdx = decoded.findIndex((i: any) => i.id === originalItemId)
            if (originalIdx >= 0) {
              decoded[originalIdx].remixCount = (decoded[originalIdx].remixCount || 0) + 1
              await fetch(
                `${GITHUB_API}/repos/${MAIN_REPO}/contents/marketplace/published/index.json`,
                {
                  method: "PUT",
                  headers: {
                    Accept: "application/vnd.github.v3+json",
                    Authorization: `Bearer ${MAIN_TOKEN}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    message: `Remix created: ${newName} (from ${original.name})`,
                    content: btoa(unescape(encodeURIComponent(JSON.stringify(decoded, null, 2)))),
                    sha: data.sha,
                  }),
                }
              )
            }
          }
        }
      }
    } catch {}

    return {
      success: true,
      newItemId: remixId,
      originalItemId,
      message: `"${newName}" published as a remix of "${original.name}"! Original creator credited.`,
    }
  } catch (error) {
    return {
      success: false,
      newItemId: "",
      originalItemId,
      message: `Failed to publish remix: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}

/**
 * Get all remixes of an item
 */
export async function getRemixes(itemId: string): Promise<EcosystemItem[]> {
  const allItems = await getAllItems()
  return allItems.filter((i) => i.remixedFrom === itemId)
}

/**
 * Get the original item a remix was created from
 */
export async function getOriginal(remixItemId: string): Promise<EcosystemItem | null> {
  const allItems = await getAllItems()
  const remix = allItems.find((i) => i.id === remixItemId)
  if (!remix || !remix.remixedFrom) return null
  return allItems.find((i) => i.id === remix.remixedFrom) || null
}

/**
 * Get remix chain — follows remixedFrom links back to the root
 */
export async function getRemixChain(itemId: string): Promise<EcosystemItem[]> {
  const allItems = await getAllItems()
  const chain: EcosystemItem[] = []
  let current = allItems.find((i) => i.id === itemId)

  while (current) {
    chain.unshift(current)
    if (!current.remixedFrom) break
    current = allItems.find((i) => i.id === current!.remixedFrom)
  }

  return chain
}

/**
 * Get total remix count for an item (direct + indirect)
 */
export async function getTotalRemixCount(itemId: string): Promise<number> {
  const allItems = await getAllItems()
  let count = 0
  const queue = [itemId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    const children = allItems.filter((i) => i.remixedFrom === currentId)
    count += children.length
    children.forEach((c) => queue.push(c.id))
  }

  return count
}
