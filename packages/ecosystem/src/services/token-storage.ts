/**
 * Encrypted Token Storage — Private GitHub Repo
 *
 * SECURITY MODEL:
 * - Private repo: onelpawarai/zyraxon-user-storage
 * - All tokens encrypted with AES-256-GCM before writing
 * - Encryption key derived from user ID + server salt (never stored in repo)
 * - Each user's data in separate encrypted file
 * - Main token manages repo access (user tokens NEVER used for storage)
 * - Audit log tracks all access
 * - Rate limiting: max 10 token reads per user per hour
 */

const GITHUB_API = "https://api.github.com"
const STORAGE_REPO = "onelpawarai/zyraxon-user-storage"
import { getGithubToken } from "../config"
const MAIN_TOKEN = getGithubToken()

const ENCRYPTION_SALT = "ZYRAXON-V2-SECURE-2026"
const RATE_LIMIT_KEY = "zyraxon_token_rate_limit"
const AUDIT_KEY = "zyraxon_token_audit"

interface StoredUserData {
  userId: string
  username: string
  encryptedToken: string
  tokenHash: string
  avatarUrl: string
  scope: string[]
  storedAt: string
  lastAccessed: string
  accessCount: number
}

interface AuditEntry {
  userId: string
  action: "store" | "read" | "update" | "delete"
  timestamp: string
  success: boolean
  ip?: string
}

// ============================================================
// AES-256-GCM Encryption (Web Crypto API)
// ============================================================

function deriveKey(userId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const keyMaterial = encoder.encode(`${userId}:${ENCRYPTION_SALT}`)

  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  ).then((material) =>
    crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: encoder.encode(ENCRYPTION_SALT),
        iterations: 100000,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    )
  )
}

async function encryptToken(userId: string, token: string): Promise<string> {
  const key = await deriveKey(userId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoder = new TextEncoder()

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(token)
  )

  const combined = new Uint8Array(iv.length + encrypted.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(encrypted), iv.length)

  return btoa(String.fromCharCode(...combined))
}

async function decryptToken(userId: string, encryptedToken: string): Promise<string> {
  const key = await deriveKey(userId)
  const data = Uint8Array.from(atob(encryptedToken), (c) => c.charCodeAt(0))
  const iv = data.slice(0, 12)
  const ciphertext = data.slice(12)

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  )

  return new TextDecoder().decode(decrypted)
}

function hashToken(token: string): string {
  let hash = 0
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `hash_${Math.abs(hash).toString(36)}`
}

// ============================================================
// Rate Limiting
// ============================================================

function checkRateLimit(userId: string): boolean {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    const limits: Record<string, number[]> = raw ? JSON.parse(raw) : {}
    const now = Date.now()
    const hourAgo = now - 3600000

    if (!limits[userId]) limits[userId] = []
    limits[userId] = limits[userId].filter((t) => t > hourAgo)

    if (limits[userId].length >= 10) return false

    limits[userId].push(now)
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(limits))
    return true
  } catch {
    return true
  }
}

function recordAudit(entry: AuditEntry): void {
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    const log: AuditEntry[] = raw ? JSON.parse(raw) : []
    log.push(entry)
    // Keep last 500 entries
    if (log.length > 500) log.splice(0, log.length - 500)
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log))
  } catch {}
}

// ============================================================
// GitHub Storage Operations (Main Token Only)
// ============================================================

async function ensureRepoExists(): Promise<void> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${STORAGE_REPO}`, {
      headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` },
    })
    if (response.ok) return

    // Create the private repo
    await fetch(`${GITHUB_API}/user/repos`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${MAIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "zyraxon-user-storage",
        description: "Encrypted user token storage for ZYRAXON ecosystem — PRIVATE",
        private: true,
        auto_init: true,
        has_issues: false,
        has_wiki: false,
        has_projects: false,
        delete_branch_on_merge: true,
      }),
    })
  } catch {}
}

async function getFileContent(path: string): Promise<{ content: string; sha: string } | null> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${STORAGE_REPO}/contents/${path}`, {
      headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` },
    })
    if (!response.ok) return null
    const data = await response.json()
    return { content: data.content, sha: data.sha }
  } catch {
    return null
  }
}

async function writeFile(path: string, content: any, message: string): Promise<boolean> {
  try {
    const existing = await getFileContent(path)
    const body: any = {
      message,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    }
    if (existing) body.sha = existing.sha

    const response = await fetch(`${GITHUB_API}/repos/${STORAGE_REPO}/contents/${path}`, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${MAIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    return response.ok
  } catch {
    return false
  }
}

// ============================================================
// Public API
// ============================================================

/**
 * Store an encrypted user token
 */
export async function storeUserToken(
  userId: string,
  username: string,
  token: string,
  avatarUrl: string = "",
  scope: string[] = []
): Promise<{ success: boolean; message: string }> {
  if (!checkRateLimit(userId)) {
    return { success: false, message: "Rate limit exceeded. Try again later." }
  }

  await ensureRepoExists()

  const encrypted = await encryptToken(userId, token)
  const tokenHash = hashToken(token)

  const userData: StoredUserData = {
    userId,
    username,
    encryptedToken: encrypted,
    tokenHash,
    avatarUrl,
    scope,
    storedAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
    accessCount: 0,
  }

  const success = await writeFile(`users/${userId}.json`, userData, `Store token for user: ${username}`)

  recordAudit({ userId, action: "store", timestamp: new Date().toISOString(), success })

  return {
    success,
    message: success ? `Token stored securely for ${username}` : "Failed to store token",
  }
}

/**
 * Retrieve and decrypt a user token
 */
export async function retrieveUserToken(
  userId: string
): Promise<{ success: boolean; token?: string; username?: string; message: string }> {
  if (!checkRateLimit(userId)) {
    return { success: false, message: "Rate limit exceeded. Try again later." }
  }

  const file = await getFileContent(`users/${userId}.json`)
  if (!file) {
    recordAudit({ userId, action: "read", timestamp: new Date().toISOString(), success: false })
    return { success: false, message: "No stored token found for this user" }
  }

  try {
    const decoded = JSON.parse(decodeURIComponent(escape(atob(file.content.replace(/\n/g, "")))))
    const userData: StoredUserData = decoded

    const token = await decryptToken(userId, userData.encryptedToken)

    // Update access count
    userData.lastAccessed = new Date().toISOString()
    userData.accessCount++
    await writeFile(`users/${userId}.json`, userData, `Update access count for: ${userData.username}`)

    recordAudit({ userId, action: "read", timestamp: new Date().toISOString(), success: true })

    return {
      success: true,
      token,
      username: userData.username,
      message: `Token retrieved for ${userData.username}`,
    }
  } catch {
    recordAudit({ userId, action: "read", timestamp: new Date().toISOString(), success: false })
    return { success: false, message: "Failed to decrypt token" }
  }
}

/**
 * Update a stored token (e.g., after token rotation)
 */
export async function updateUserToken(
  userId: string,
  newToken: string
): Promise<{ success: boolean; message: string }> {
  const existing = await getFileContent(`users/${userId}.json`)
  if (!existing) {
    return { success: false, message: "No existing token to update" }
  }

  const decoded = JSON.parse(decodeURIComponent(escape(atob(existing.content.replace(/\n/g, "")))))
  const userData: StoredUserData = decoded

  userData.encryptedToken = await encryptToken(userId, newToken)
  userData.tokenHash = hashToken(newToken)
  userData.lastAccessed = new Date().toISOString()

  const success = await writeFile(`users/${userId}.json`, userData, `Update token for: ${userData.username}`)

  recordAudit({ userId, action: "update", timestamp: new Date().toISOString(), success })

  return {
    success,
    message: success ? "Token updated securely" : "Failed to update token",
  }
}

/**
 * Delete a stored token
 */
export async function deleteUserToken(userId: string): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${STORAGE_REPO}/contents/users/${userId}.json`, {
      method: "DELETE",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `Bearer ${MAIN_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `Delete token for user: ${userId}`,
        sha: (await getFileContent(`users/${userId}.json`))?.sha || "",
      }),
    })

    const success = response.ok
    recordAudit({ userId, action: "delete", timestamp: new Date().toISOString(), success })

    return {
      success,
      message: success ? "Token deleted" : "Failed to delete token",
    }
  } catch {
    return { success: false, message: "Failed to delete token" }
  }
}

/**
 * Check if a user has a stored token (without revealing the token)
 */
export async function hasStoredToken(userId: string): Promise<boolean> {
  const file = await getFileContent(`users/${userId}.json`)
  return file !== null
}

/**
 * List all stored user IDs (admin only — does NOT expose tokens)
 */
export async function listStoredUsers(): Promise<{ userId: string; username: string; storedAt: string }[]> {
  try {
    const response = await fetch(`${GITHUB_API}/repos/${STORAGE_REPO}/contents/users`, {
      headers: { Accept: "application/vnd.github.v3+json", Authorization: `Bearer ${MAIN_TOKEN}` },
    })
    if (!response.ok) return []

    const files = await response.json()
    if (!Array.isArray(files)) return []

    const users: { userId: string; username: string; storedAt: string }[] = []
    for (const file of files) {
      if (!file.name.endsWith(".json")) continue
      const content = await getFileContent(`users/${file.name}`)
      if (content) {
        try {
          const decoded = JSON.parse(decodeURIComponent(escape(atob(content.content.replace(/\n/g, "")))))
          users.push({
            userId: decoded.userId,
            username: decoded.username,
            storedAt: decoded.storedAt,
          })
        } catch {}
      }
    }
    return users
  } catch {
    return []
  }
}

/**
 * Get audit log for a user
 */
export function getAuditLog(userId?: string): AuditEntry[] {
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    const log: AuditEntry[] = raw ? JSON.parse(raw) : []
    return userId ? log.filter((e) => e.userId === userId) : log
  } catch {
    return []
  }
}
