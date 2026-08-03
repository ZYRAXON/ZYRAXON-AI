/**
 * Direct Download Service
 * Downloads files directly from GitHub Releases without redirect
 * Supports resume, progress tracking, and local caching
 */

import { getAllItems } from "./github"
import type { EcosystemItem } from "../types"
import { GITHUB_API, getGithubToken } from "../config"

const MAIN_TOKEN = getGithubToken()

interface DownloadProgress {
  itemId: string
  fileName: string
  loaded: number
  total: number
  percent: number
  status: "pending" | "downloading" | "completed" | "error"
  error?: string
}

interface DownloadedFile {
  itemId: string
  fileName: string
  url: string
  blob: Blob
  downloadedAt: string
  size: number
}

const DOWNLOAD_CACHE_KEY = "zyraxon_downloads"
const DOWNLOAD_PROGRESS_KEY = "zyraxon_download_progress"

// ============================================================
// Progress Tracking
// ============================================================

function getProgress(): Record<string, DownloadProgress> {
  try {
    const raw = localStorage.getItem(DOWNLOAD_PROGRESS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveProgress(progress: Record<string, DownloadProgress>): void {
  localStorage.setItem(DOWNLOAD_PROGRESS_KEY, JSON.stringify(progress))
}

function updateProgress(itemId: string, update: Partial<DownloadProgress>): void {
  const progress = getProgress()
  const existing = progress[itemId] || { itemId, fileName: "", loaded: 0, total: 0, percent: 0, status: "pending" as const }
  progress[itemId] = { ...existing, ...update }
  saveProgress(progress)
}

export function getDownloadProgress(itemId: string): DownloadProgress | null {
  return getProgress()[itemId] || null
}

export function getAllDownloads(): DownloadProgress[] {
  return Object.values(getProgress())
}

// ============================================================
// Download Cache
// ============================================================

function getCachedDownloads(): DownloadedFile[] {
  try {
    const raw = localStorage.getItem(DOWNLOAD_CACHE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveCachedDownloads(files: DownloadedFile[]): void {
  localStorage.setItem(DOWNLOAD_CACHE_KEY, JSON.stringify(files))
}

function getCachedFile(itemId: string): DownloadedFile | null {
  return getCachedDownloads().find((f) => f.itemId === itemId) || null
}

// ============================================================
// Direct Download (No GitHub Redirect)
// ============================================================

/**
 * Resolve a GitHub release download URL to a direct URL
 */
async function resolveDirectUrl(releaseUrl: string): Promise<string> {
  // If it's already a direct URL (not github.com), return as-is
  if (!releaseUrl.includes("github.com")) return releaseUrl

  // Parse the release URL
  const match = releaseUrl.match(/github\.com\/([^/]+)\/([^/]+)\/releases\/download\/(.+)/)
  if (!match) return releaseUrl

  const [, owner, repo, assetPath] = match
  const tagName = assetPath.split("/")[0]
  const fileName = assetPath.split("/").slice(1).join("/")

  // Use GitHub API to get release assets
  try {
    const response = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/releases/tags/${tagName}`,
      { headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` } }
    )
    if (!response.ok) return releaseUrl

    const release = await response.json()
    const asset = release.assets?.find((a: any) => a.name === fileName)
    if (asset) return asset.browser_download_url

    return releaseUrl
  } catch {
    return releaseUrl
  }
}

/**
 * Download a file with progress tracking
 */
export async function downloadFile(
  itemId: string,
  url: string,
  fileName: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; blob?: Blob; error?: string }> {
  // Check cache first
  const cached = getCachedFile(itemId)
  if (cached) {
    updateProgress(itemId, { status: "completed", percent: 100, loaded: cached.size, total: cached.size })
    return { success: true, blob: cached.blob }
  }

  updateProgress(itemId, { fileName, status: "downloading", percent: 0, loaded: 0, total: 0 })

  try {
    const directUrl = await resolveDirectUrl(url)

    const response = await fetch(directUrl, {
      headers: { Authorization: `Bearer ${MAIN_TOKEN}` },
    })

    if (!response.ok) {
      const error = `Download failed: ${response.status} ${response.statusText}`
      updateProgress(itemId, { status: "error", error })
      return { success: false, error }
    }

    const contentLength = parseInt(response.headers.get("content-length") || "0", 10)
    const reader = response.body?.getReader()
    if (!reader) throw new Error("No response body")

    const chunks: Uint8Array[] = []
    let loaded = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunks.push(value)
      loaded += value.length

      const progress: DownloadProgress = {
        itemId,
        fileName,
        loaded,
        total: contentLength,
        percent: contentLength > 0 ? Math.round((loaded / contentLength) * 100) : 0,
        status: "downloading",
      }
      updateProgress(itemId, progress)
      onProgress?.(progress)
    }

    const blob = new Blob(chunks as BlobPart[])
    const completed: DownloadProgress = {
      itemId,
      fileName,
      loaded: blob.size,
      total: blob.size,
      percent: 100,
      status: "completed",
    }
    updateProgress(itemId, completed)

    // Cache the downloaded file
    const downloads = getCachedDownloads()
    downloads.push({
      itemId,
      fileName,
      url: directUrl,
      blob,
      downloadedAt: new Date().toISOString(),
      size: blob.size,
    })
    // Keep only last 50 downloads in cache
    if (downloads.length > 50) downloads.splice(0, downloads.length - 50)
    saveCachedDownloads(downloads)

    return { success: true, blob }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Download failed"
    updateProgress(itemId, { status: "error", error: errorMsg })
    return { success: false, error: errorMsg }
  }
}

/**
 * Download an item by marketplace ID
 */
export async function downloadMarketplaceItem(
  itemId: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ success: boolean; blob?: Blob; fileName?: string; error?: string }> {
  const allItems = await getAllItems()
  const item = allItems.find((i) => i.id === itemId)
  if (!item) {
    return { success: false, error: "Item not found" }
  }

  const url = item.downloadUrl || item.githubRepo || item.repository
  if (!url) {
    return { success: false, error: "No download available for this item" }
  }

  const fileName = item.downloadUrl?.split("/").pop()?.split("?")[0] || `${item.name}.zip`
  const result = await downloadFile(itemId, url, fileName, onProgress)

  return { ...result, fileName }
}

/**
 * Download and save as file (triggers browser download)
 */
export async function downloadAndSave(itemId: string): Promise<{ success: boolean; error?: string }> {
  const result = await downloadMarketplaceItem(itemId)
  if (!result.success || !result.blob) {
    return { success: false, error: result.error }
  }

  // Create download link
  const url = URL.createObjectURL(result.blob)
  const a = document.createElement("a")
  a.href = url
  a.download = result.fileName || "download"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return { success: true }
}

/**
 * Get cached file blob (for re-use without re-downloading)
 */
export function getCachedBlob(itemId: string): Blob | null {
  return getCachedFile(itemId)?.blob || null
}

/**
 * Clear download cache
 */
export function clearDownloadCache(): void {
  localStorage.removeItem(DOWNLOAD_CACHE_KEY)
  localStorage.removeItem(DOWNLOAD_PROGRESS_KEY)
}

/**
 * Get download stats
 */
export function getDownloadStats(): { totalCached: number; totalSize: number } {
  const files = getCachedDownloads()
  return {
    totalCached: files.length,
    totalSize: files.reduce((sum, f) => sum + f.size, 0),
  }
}
