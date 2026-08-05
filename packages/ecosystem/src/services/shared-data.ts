/**
 * SharedData — Central GitHub storage for likes, comments, ratings, downloads
 * All data stored in onelpawarai/ZYRAXON-DATA/marketplace/data/
 *
 * READ: unauthenticated (public repo, 60 req/hr) or user token
 * WRITE: App token via Electron IPC (git remote URL) — guaranteed write access
 */

const GITHUB_API = "https://api.github.com"
const MAIN_REPO = "onelpawarai/ZYRAXON-DATA"
const DATA_PATH = "/marketplace/data"

// App token from Electron main process (reads from git remote URL)
async function getAppToken(): Promise<string | null> {
  try {
    const api = (window as any).api
    if (api?.getGithubToken) return await api.getGithubToken()
  } catch {}
  return null
}

// User's own token from GitHub OAuth login (for identifying user)
function getUserToken(): string | null {
  try {
    const stored = localStorage.getItem("zyraxon_ecosystem_auth")
    if (stored) {
      const parsed = JSON.parse(stored)
      return parsed.token || null
    }
  } catch {}
  return null
}

function readHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github.v3+json" }
  const userToken = getUserToken()
  if (userToken) h.Authorization = `Bearer ${userToken}`
  return h
}

async function writeHeaders(): Promise<Record<string, string>> {
  const appToken = await getAppToken()
  return {
    Accept: "application/vnd.github.v3+json",
    Authorization: `Bearer ${appToken}`,
    "Content-Type": "application/json",
  }
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${GITHUB_API}/repos/${MAIN_REPO}/contents${path}`, { headers: readHeaders() })
    if (!res.ok) return fallback
    const data = await res.json()
    if (!data.content) return fallback
    return JSON.parse(atob(data.content.replace(/\n/g, "")))
  } catch {
    return fallback
  }
}

async function writeJson(path: string, content: any, message: string): Promise<boolean> {
  const headers = await writeHeaders()
  if (!headers.Authorization || headers.Authorization === "Bearer null") return false
  try {
    const getRes = await fetch(`${GITHUB_API}/repos/${MAIN_REPO}/contents${path}`, { headers: readHeaders() })
    let sha: string | undefined
    if (getRes.ok) {
      const existing = await getRes.json()
      sha = existing.sha
    }
    const body: any = {
      message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    }
    if (sha) body.sha = sha
    const putRes = await fetch(`${GITHUB_API}/repos/${MAIN_REPO}/contents${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    })
    return putRes.ok
  } catch {
    return false
  }
}

// ─── LIKES ────────────────────────────────────────────────
export async function getLikeCount(itemId: string): Promise<number> {
  const data = await readJson<Record<string, number>>(`${DATA_PATH}/likes.json`, {})
  return data[itemId] || 0
}

export async function getUserLikes(userId: string): Promise<string[]> {
  const data = await readJson<Record<string, string[]>>(`${DATA_PATH}/user_likes.json`, {})
  return data[userId] || []
}

export async function toggleLike(itemId: string, userId: string): Promise<{ liked: boolean; count: number }> {
  const allLikes = await readJson<Record<string, number>>(`${DATA_PATH}/likes.json`, {})
  const userLikes = await readJson<Record<string, string[]>>(`${DATA_PATH}/user_likes.json`, {})

  const userArr = userLikes[userId] || []
  const isLiked = userArr.includes(itemId)

  if (isLiked) {
    userLikes[userId] = userArr.filter((id) => id !== itemId)
    allLikes[itemId] = Math.max(0, (allLikes[itemId] || 1) - 1)
  } else {
    userLikes[userId] = [...userArr, itemId]
    allLikes[itemId] = (allLikes[itemId] || 0) + 1
  }

  await writeJson(`${DATA_PATH}/likes.json`, allLikes, `Like ${itemId}`)
  await writeJson(`${DATA_PATH}/user_likes.json`, userLikes, `User like ${userId}`)
  return { liked: !isLiked, count: allLikes[itemId] || 0 }
}

// ─── COMMENTS ─────────────────────────────────────────────
export interface SharedComment {
  id: string
  itemId: string
  userId: string
  username: string
  avatarUrl: string
  content: string
  createdAt: string
  likeCount: number
}

export async function getComments(itemId: string): Promise<SharedComment[]> {
  const data = await readJson<Record<string, SharedComment[]>>(`${DATA_PATH}/comments.json`, {})
  return data[itemId] || []
}

export async function addComment(comment: SharedComment): Promise<boolean> {
  const all = await readJson<Record<string, SharedComment[]>>(`${DATA_PATH}/comments.json`, {})
  const itemComments = all[comment.itemId] || []
  itemComments.push(comment)
  all[comment.itemId] = itemComments.slice(-200)
  return writeJson(`${DATA_PATH}/comments.json`, all, `Comment on ${comment.itemId}`)
}

// ─── RATINGS ──────────────────────────────────────────────
export async function getRating(itemId: string, userId?: string): Promise<{ average: number; count: number; userRating: number }> {
  const allRatings = await readJson<Record<string, Array<{ userId: string; rating: number; createdAt?: string }>>>(`${DATA_PATH}/ratings.json`, {})
  const ratings = allRatings[itemId] || []
  if (ratings.length === 0) return { average: 0, count: 0, userRating: 0 }
  const sum = ratings.reduce((s, r) => s + r.rating, 0)
  const userRating = userId ? (ratings.find((r) => r.userId === userId)?.rating || 0) : 0
  return { average: sum / ratings.length, count: ratings.length, userRating }
}

export async function setRating(itemId: string, userId: string, rating: number): Promise<{ average: number; count: number }> {
  const allRatings = await readJson<Record<string, Array<{ userId: string; rating: number; createdAt?: string }>>>(`${DATA_PATH}/ratings.json`, {})
  const itemRatings = allRatings[itemId] || []
  const existing = itemRatings.findIndex((r) => r.userId === userId)
  if (existing >= 0) {
    itemRatings[existing].rating = rating
  } else {
    itemRatings.push({ userId, rating, createdAt: new Date().toISOString() })
  }
  allRatings[itemId] = itemRatings
  await writeJson(`${DATA_PATH}/ratings.json`, allRatings, `Rate ${itemId}`)
  const sum = itemRatings.reduce((s, r) => s + r.rating, 0)
  return { average: sum / itemRatings.length, count: itemRatings.length }
}

// ─── DOWNLOADS ────────────────────────────────────────────
export async function incrementDownload(itemId: string): Promise<number> {
  const data = await readJson<Record<string, number>>(`${DATA_PATH}/downloads.json`, {})
  data[itemId] = (data[itemId] || 0) + 1
  await writeJson(`${DATA_PATH}/downloads.json`, data, `Download ${itemId}`)
  return data[itemId]
}

export async function getDownloadCount(itemId: string): Promise<number> {
  const data = await readJson<Record<string, number>>(`${DATA_PATH}/downloads.json`, {})
  return data[itemId] || 0
}
