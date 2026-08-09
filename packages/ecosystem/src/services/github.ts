import type { EcosystemItem, CategoryInfo, EcosystemStats, RecentActivity, User, Comment } from "../types"
import { getAuthState } from "./auth"
import { GITHUB_API, MAIN_REPO, DATA_REPO, getGithubToken } from "../config"

const GITHUB_REPO = MAIN_REPO
const MARKETPLACE_REPO = DATA_REPO
const STORAGE_PREFIX = "zyraxon_ecosystem"

function getMainRepoToken(): string | null {
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}_main_token`)
    if (stored) return stored
  } catch {}
  const configToken = getGithubToken()
  if (configToken) return configToken
  return null
}

export function setMainRepoToken(token: string): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}_main_token`, token)
  } catch {}
}

export function getHeaders(useMainToken = false) {
  const auth = getAuthState()
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  }
  if (useMainToken) {
    const mainToken = getMainRepoToken()
    if (mainToken) {
      headers.Authorization = `Bearer ${mainToken}`
      return headers
    }
  }
  if (auth?.token) {
    headers.Authorization = `Bearer ${auth.token}`
  }
  return headers
}

async function fetchFromGitHub(path: string, retries = 3, useMainToken = true, repo?: string): Promise<any> {
  const targetRepo = repo || GITHUB_REPO
  let lastError: Error | null = null
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${GITHUB_API}/repos/${targetRepo}/contents${path}`, {
        headers: getHeaders(useMainToken),
      })
      if (response.status === 404) return null
      if (response.status === 403 || response.status === 429) {
        if (attempt < retries - 1) {
          await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
          continue
        }
      }
      if (!response.ok) throw new Error(`GitHub API error: ${response.status}`)
      const data = await response.json()
      if (data.content) {
        return JSON.parse(atob(data.content.replace(/\n/g, "")))
      }
      return data
    } catch (err) {
      lastError = err as Error
      if (attempt < retries - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 500))
      }
    }
  }
  return null
}

async function getFileSha(path: string, repo?: string): Promise<string | null> {
  const targetRepo = repo || GITHUB_REPO
  try {
    const response = await fetch(`${GITHUB_API}/repos/${targetRepo}/contents${path}`, { headers: getHeaders() })
    if (!response.ok) return null
    const data = await response.json()
    return data.sha || null
  } catch {
    return null
  }
}

async function commitToGitHub(path: string, content: any, message: string, repo?: string): Promise<boolean> {
  const targetRepo = repo || GITHUB_REPO
  try {
    const sha = await getFileSha(path, targetRepo)
    const auth = getAuthState()
    const mainToken = getMainRepoToken()
    const token = auth?.token || mainToken
    if (!token) return false

    const body: Record<string, any> = {
      message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    }
    if (sha) body.sha = sha
    const response = await fetch(`${GITHUB_API}/repos/${targetRepo}/contents${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    return response.ok
  } catch {
    return false
  }
}

async function fetchItemsFromPath(path: string): Promise<EcosystemItem[]> {
  try {
    const data = await fetchFromGitHub(path, 3, true, MARKETPLACE_REPO)
    if (!data) return []
    if (Array.isArray(data)) return data.map(normalizeItem)
    if (data.items) return data.items.map(normalizeItem)
    if (data.id) return [normalizeItem(data)]
    return []
  } catch {
    return []
  }
}

function normalizeItem(item: any): EcosystemItem {
  let author = item.author
  let authorAvatar = item.authorAvatar
  let authorId = item.authorId
  if (author && typeof author === "object") {
    authorAvatar = authorAvatar || author.avatar || ""
    authorId = authorId || author.name || ""
    author = author.name || author.login || String(author)
  }
  const CAT_MAP: Record<string, string> = {
    "e-commerce": "website-templates", ecommerce: "website-templates",
    "e commerce": "website-templates", game: "website-games",
    "html5-game": "website-games", "browser-game": "website-games",
  }
  let category = item.category || "plugins"
  const catLower = category.toLowerCase().replace(/[_\s]+/g, "-")
  if (CAT_MAP[catLower]) category = CAT_MAP[catLower]
  let type = item.type || "plugin"
  type = type.toLowerCase()
  return {
    id: item.id || `item-${Date.now()}`,
    name: item.name || "Untitled",
    description: item.description || "",
    version: item.version || "1.0.0",
    author: typeof author === "string" ? author : "Unknown",
    authorAvatar,
    authorId: authorId || (typeof author === "string" ? author : ""),
    category: category as any,
    type: type as any,
    tags: Array.isArray(item.tags) ? item.tags : [],
    icon: item.icon || "",
    coverImage: item.coverImage || item.cover || "",
    logo: item.logo || "",
    screenshots: item.screenshots || [],
    downloads: item.downloads || 0,
    rating: item.rating || 0,
    reviews: item.reviews || 0,
    likeCount: item.likeCount || 0,
    commentCount: item.commentCount || 0,
    verified: item.verified || false,
    featured: item.featured || false,
    createdAt: item.createdAt || item.publishedAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.publishedAt || new Date().toISOString(),
    repository: item.repository || item.githubRepo || "",
    liveDemo: item.liveDemo || "",
    githubRepo: item.githubRepo || "",
    downloadUrl: item.downloadUrl || "",
    installCommand: item.installCommand || "",
    fileSize: item.fileSize || "",
    license: item.license || "MIT",
    remixedFrom: item.remixedFrom || undefined,
    remixCount: item.remixCount || 0,
    gameConfig: item.gameConfig || undefined,
  } as EcosystemItem
}

let cachedItems: EcosystemItem[] | null = null
let cacheTime = 0
const CACHE_TTL = 30000
const LOCALSTORAGE_KEY = "zyraxon_ecosystem_cache"

function loadLocalCache(): EcosystemItem[] | null {
  try {
    const raw = localStorage.getItem(LOCALSTORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.items) && Date.now() - parsed.time < 86400000) {
      return parsed.items
    }
  } catch {}
  return null
}

function saveLocalCache(items: EcosystemItem[]) {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify({ items, time: Date.now() }))
  } catch {}
}

export async function getAllItems(): Promise<EcosystemItem[]> {
  const now = Date.now()
  if (cachedItems && now - cacheTime < CACHE_TTL) return cachedItems

  const published = await fetchItemsFromPath("/marketplace/published/index.json")

  const items = [...published]
  cachedItems = items
  cacheTime = now
  if (items.length > 0) saveLocalCache(items)
  if (items.length > 0) return items

  const local = loadLocalCache()
  if (local && local.length > 0) return local

  try {
    const { BUNDLED_MARKETPLACE_ITEMS } = await import("./bundled-marketplace")
    if (BUNDLED_MARKETPLACE_ITEMS.length > 0) {
      cachedItems = BUNDLED_MARKETPLACE_ITEMS
      cacheTime = now
      return BUNDLED_MARKETPLACE_ITEMS
    }
  } catch {}

  return items
}

export async function getItemsByCategory(category: string): Promise<EcosystemItem[]> {
  return (await getAllItems()).filter((item) => item.category === category)
}

export async function getItemsByType(type: string): Promise<EcosystemItem[]> {
  return (await getAllItems()).filter((item) => item.type === type)
}

export async function getFeaturedItems(): Promise<EcosystemItem[]> {
  return (await getAllItems()).filter((item) => item.featured)
}

export async function getTopRatedItems(limit: number = 5): Promise<EcosystemItem[]> {
  return (await getAllItems()).sort((a, b) => b.rating - a.rating).slice(0, limit)
}

export async function getTrendingItems(): Promise<EcosystemItem[]> {
  return (await getAllItems()).sort((a, b) => b.downloads - a.downloads)
}

export async function getNewArrivals(): Promise<EcosystemItem[]> {
  return (await getAllItems()).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function searchItems(query: string): Promise<EcosystemItem[]> {
  const all = await getAllItems()
  const q = query.toLowerCase()
  return all.filter(
    (item) =>
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.tags.some((tag) => tag.toLowerCase().includes(q)),
  )
}

export async function getItemById(id: string): Promise<EcosystemItem | undefined> {
  return (await getAllItems()).find((item) => item.id === id)
}

export async function getItemsByAuthor(authorId: string): Promise<EcosystemItem[]> {
  return (await getAllItems()).filter((item) => item.authorId === authorId)
}

export async function getCategories(): Promise<CategoryInfo[]> {
  const all = await getAllItems()
  const categories: CategoryInfo[] = [
    { id: "ai-bots", name: "AI Bots", icon: "IconRobot", description: "Custom AI assistants and chatbots", count: 0 },
    { id: "plugins", name: "Plugins", icon: "IconExtension", description: "Extend ZYRAXON functionality", count: 0 },
    { id: "website-templates", name: "Website Templates", icon: "IconTemplate", description: "Ready-made website starters", count: 0 },
    { id: "themes", name: "Themes", icon: "IconPalette", description: "UI themes and appearance", count: 0 },
    { id: "components", name: "Components", icon: "IconBox", description: "Reusable UI components", count: 0 },
    { id: "startkits", name: "Starter Kits", icon: "IconRocket", description: "Full project starter kits", count: 0 },
    { id: "workflows", name: "Workflows", icon: "IconBolt", description: "Automation workflows", count: 0 },
    { id: "ai-models", name: "AI Models", icon: "IconCpu", description: "Pre-trained models and adapters", count: 0 },
    { id: "tools", name: "Dev Tools", icon: "IconCode", description: "Developer utilities", count: 0 },
    { id: "sdks", name: "SDKs", icon: "IconPackage", description: "Software development kits", count: 0 },
    { id: "types", name: "Type Packages", icon: "IconFileText", description: "TypeScript type definitions", count: 0 },
    { id: "pdfs", name: "PDFs", icon: "IconFileText", description: "Documentation and guides", count: 0 },
    { id: "books", name: "Books", icon: "IconBook", description: "E-books and learning material", count: 0 },
    { id: "apis", name: "APIs", icon: "IconGlobe", description: "API integrations and wrappers", count: 0 },
    { id: "mobile-apps", name: "Mobile Apps", icon: "IconSmartphone", description: "Mobile application templates", count: 0 },
    { id: "browser-extensions", name: "Browser Extensions", icon: "IconExtension", description: "Chrome/Firefox extensions", count: 0 },
    { id: "cli-tools", name: "CLI Tools", icon: "IconTerminal", description: "Command-line utilities", count: 0 },
    { id: "prompts", name: "AI Prompts", icon: "IconMessageSquare", description: "Prompt templates and libraries", count: 0 },
    { id: "datasets", name: "Datasets", icon: "IconDatabase", description: "Training and reference datasets", count: 0 },
    { id: "icons", name: "Icon Packs", icon: "IconImage", description: "Icon sets and SVG packs", count: 0 },
    { id: "ui-kits", name: "UI Kits", icon: "IconLayers", description: "Complete UI design systems", count: 0 },
    { id: "landing-pages", name: "Landing Pages", icon: "IconLayout", description: "Marketing page templates", count: 0 },
    { id: "desktop-apps", name: "Desktop Apps", icon: "IconMonitor", description: "Windows, Mac, Linux applications", count: 0 },
    { id: "iso-images", name: "ISO Images", icon: "IconDisc", description: "Bootable ISO images and system images", count: 0 },
    { id: "fonts", name: "Fonts", icon: "IconType", description: "Custom fonts and typefaces", count: 0 },
    { id: "code-snippets", name: "Code Snippets", icon: "IconCode", description: "Reusable code snippets and patterns", count: 0 },
    { id: "devops", name: "DevOps", icon: "IconRocket", description: "CI/CD, Docker, K8s configs", count: 0 },
  ]
  for (const cat of categories) {
    cat.count = all.filter((item) => item.category === cat.id).length
  }
  return categories
}

export async function getStats(): Promise<EcosystemStats> {
  const all = await getAllItems()
  return {
    totalPlugins: all.filter((item) => item.type === "plugin" || item.category === "plugins").length,
    totalBots: all.filter((item) => item.type === "bot" || item.category === "ai-bots").length,
    totalTemplates: all.filter((item) => item.type === "template" || item.category === "website-templates").length,
    totalDownloads: all.reduce((sum, item) => sum + item.downloads, 0),
    totalUsers: new Set(all.map((item) => item.authorId)).size,
  }
}

export async function getRecentActivity(): Promise<RecentActivity[]> {
  return (await getAllItems())
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10)
    .map((item) => ({
      id: item.id,
      type: item.type as RecentActivity["type"],
      name: item.name,
      author: item.author,
      authorAvatar: item.authorAvatar,
      timestamp: item.updatedAt,
    }))
}

export async function uploadFileToRepo(
  repoOwner: string,
  repoName: string,
  filePath: string,
  fileContent: ArrayBuffer,
  message: string
): Promise<string | null> {
  const auth = getAuthState()
  if (!auth?.token) return null

  const contentBase64 = btoa(
    new Uint8Array(fileContent).reduce((data, byte) => data + String.fromCharCode(byte), "")
  )

  let sha: string | undefined
  try {
    const resp = await fetch(
      `${GITHUB_API}/repos/${repoOwner}/${repoName}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${auth.token}`, Accept: "application/vnd.github.v3+json" } }
    )
    if (resp.ok) {
      const data = await resp.json()
      sha = data.sha
    }
  } catch {}

  const body: Record<string, any> = { message, content: contentBase64 }
  if (sha) body.sha = sha

  const resp = await fetch(`${GITHUB_API}/repos/${repoOwner}/${repoName}/contents/${filePath}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (resp.ok) {
    return `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/${filePath}`
  }
  return null
}

export async function createGitHubRelease(
  repoOwner: string,
  repoName: string,
  tagName: string,
  name: string,
  body: string
): Promise<{ id: number; uploadUrl: string } | null> {
  const auth = getAuthState()
  if (!auth?.token) return null

  const resp = await fetch(`${GITHUB_API}/repos/${repoOwner}/${repoName}/releases`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tag_name: tagName, name, body, draft: false, prerelease: false }),
  })

  if (resp.ok) {
    const data = await resp.json()
    return { id: data.id, uploadUrl: data.upload_url }
  }
  return null
}

export async function uploadReleaseAsset(
  uploadUrl: string,
  fileName: string,
  fileContent: ArrayBuffer,
  contentType: string
): Promise<string | null> {
  const auth = getAuthState()
  if (!auth?.token) return null

  const url = uploadUrl.replace("{?name,label}", `?name=${encodeURIComponent(fileName)}`)

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": contentType,
      Accept: "application/vnd.github.v3+json",
    },
    body: fileContent,
  })

  if (resp.ok) {
    const data = await resp.json()
    return data.browser_download_url
  }
  return null
}

export async function uploadFileForItem(
  file: File,
  itemId: string,
  auth: { username: string; token: string }
): Promise<string | null> {
  const reader = new FileReader()
  return new Promise((resolve) => {
    reader.onload = async () => {
      const ArrayBuffer = reader.result as ArrayBuffer
      const ext = file.name.split(".").pop() || ""
      const filePath = `marketplace/assets/${itemId}/${file.name}`

      const url = await uploadFileToRepo(
        auth.username,
        "zyraxon-ecosystem-data",
        filePath,
        ArrayBuffer,
        `Upload asset: ${file.name} for ${itemId}`
      )
      resolve(url)
    }
    reader.onerror = () => resolve(null)
    reader.readAsArrayBuffer(file)
  })
}

export async function publishItem(
  item: Omit<EcosystemItem, "id" | "createdAt" | "updatedAt">,
  files?: {
    coverImage?: File
    screenshots?: File[]
    downloadFile?: File
    logo?: File
  }
): Promise<EcosystemItem> {
  const auth = getAuthState()
  if (!auth.isAuthenticated) throw new Error("Not authenticated")

  const itemId = `${item.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  let coverImageUrl = item.coverImage || ""
  let logoUrl = item.logo || ""
  let downloadUrl = item.downloadUrl || ""
  const screenshotUrls: string[] = item.screenshots || []

  if (files?.coverImage) {
    const url = await uploadFileForItem(files.coverImage, itemId, {
      username: auth.user!.username,
      token: auth.token!,
    })
    if (url) coverImageUrl = url
  }

  if (files?.logo) {
    const url = await uploadFileForItem(files.logo, itemId, {
      username: auth.user!.username,
      token: auth.token!,
    })
    if (url) logoUrl = url
  }

  if (files?.downloadFile) {
    const ArrayBuffer = await files.downloadFile.arrayBuffer()
    const tagName = `${itemId}-v${item.version || "1.0.0"}`
    const release = await createGitHubRelease(
      auth.user!.username,
      "zyraxon-ecosystem-data",
      tagName,
      `${item.name} v${item.version || "1.0.0"}`,
      item.description
    )
    if (release) {
      const assetUrl = await uploadReleaseAsset(
        release.uploadUrl,
        files.downloadFile.name,
        ArrayBuffer,
        files.downloadFile.type || "application/octet-stream"
      )
      if (assetUrl) downloadUrl = assetUrl
    }
  }

  if (files?.screenshots) {
    for (const ss of files.screenshots.slice(0, 5)) {
      const url = await uploadFileForItem(ss, `${itemId}-ss-${Date.now()}`, {
        username: auth.user!.username,
        token: auth.token!,
      })
      if (url) screenshotUrls.push(url)
    }
  }

  const newItem: EcosystemItem = {
    ...item,
    id: itemId,
    authorId: auth.user!.id,
    coverImage: coverImageUrl || undefined,
    logo: logoUrl || undefined,
    downloadUrl: downloadUrl || undefined,
    screenshots: screenshotUrls.length > 0 ? screenshotUrls : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  try {
    let existingItems: EcosystemItem[] = []
    try {
      const data = await fetchFromGitHub("/marketplace/published/index.json", 3, true, MARKETPLACE_REPO)
      existingItems = Array.isArray(data) ? data : data.items || []
    } catch {
      existingItems = []
    }
    existingItems.push(newItem)
    await commitToGitHub("/marketplace/published/index.json", existingItems, `Publish: ${newItem.name} to ZYRAXON Ecosystem`, MARKETPLACE_REPO)

    const { getGitHubStorage } = await import("./github-data")
    const storage = getGitHubStorage()
    if (storage) {
      try {
        await storage.addPublishedItem(newItem)
      } catch {}
    }

    cachedItems = null
  } catch (err) {
    console.error("Failed to persist to GitHub:", err)
  }
  return newItem
}

export async function likeItem(itemId: string): Promise<void> {
  const auth = getAuthState()
  if (!auth.isAuthenticated) throw new Error("Not authenticated")
}

export async function unlikeItem(itemId: string): Promise<void> {
  const auth = getAuthState()
  if (!auth.isAuthenticated) throw new Error("Not authenticated")
}

export async function addCommentLocal(itemId: string, content: string, parentId?: string): Promise<Comment> {
  const auth = getAuthState()
  if (!auth.isAuthenticated) throw new Error("Not authenticated")
  return {
    id: `comment-${Date.now()}`,
    userId: auth.user!.id,
    username: auth.user!.username,
    avatarUrl: auth.user!.avatarUrl,
    content,
    itemId,
    parentId,
    createdAt: new Date().toISOString(),
    likeCount: 0,
  }
}

export async function followUser(userId: string): Promise<void> {
  const auth = getAuthState()
  if (!auth.isAuthenticated) throw new Error("Not authenticated")
  await commitToGitHub(
    `/marketplace/users/${userId}.json`,
    { followerAdded: auth.user!.id, timestamp: new Date().toISOString() },
    `Follow user: ${userId}`
  )
}

export async function unfollowUser(userId: string): Promise<void> {
  const auth = getAuthState()
  if (!auth.isAuthenticated) throw new Error("Not authenticated")
  await commitToGitHub(
    `/marketplace/users/${userId}.json`,
    { followerRemoved: auth.user!.id, timestamp: new Date().toISOString() },
    `Unfollow user: ${userId}`
  )
}

export async function getUserProfile(userId: string): Promise<User | null> {
  try {
    const data = await fetchFromGitHub(`/marketplace/users/${userId}.json`)
    return data
  } catch {
    return null
  }
}
