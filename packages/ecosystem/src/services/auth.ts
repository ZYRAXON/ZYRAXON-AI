import { initGitHubStorage, clearGitHubStorage, getGitHubStorage } from "./github-data"
import { getAIConnection, clearAIConnection } from "./ai-connection"
import { storeUserToken, retrieveUserToken, hasStoredToken } from "./token-storage"
import type { User } from "../types"

export interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

const GITHUB_CLIENT_ID = "Ov23li80YUa3q7YPon5m"
const REDIRECT_URI = "https://zyraxonai.lovable.app/ecosystem/auth/callback"
const STORAGE_KEY = "zyraxon_ecosystem_auth"
const DEVICE_CODE_KEY = "zyraxon_device_code"

function generateState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export function getAuthState(): AuthState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        user: parsed.user,
        token: parsed.token,
        isLoading: false,
        isAuthenticated: !!parsed.user && !!parsed.token,
      }
    }
  } catch {}
  return { user: null, token: null, isLoading: false, isAuthenticated: false }
}

export function setAuthState(state: Partial<AuthState>): void {
  const current = getAuthState()
  const next = { ...current, ...state }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      user: next.user,
      token: next.token,
    }),
  )
}

export function clearAuthState(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(DEVICE_CODE_KEY)
}

export async function startDeviceFlow(): Promise<DeviceCodeResponse> {
  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: "read:user user:email user:follow",
    }),
  })

  if (!response.ok) {
    throw new Error(`Device code request failed: ${response.status}`)
  }

  const data: DeviceCodeResponse = await response.json()
  localStorage.setItem(
    DEVICE_CODE_KEY,
    JSON.stringify({
      device_code: data.device_code,
      expires_at: Date.now() + data.expires_in * 1000,
      interval: data.interval,
    }),
  )

  return data
}

export async function pollDeviceCode(): Promise<{ access_token: string } | null> {
  const stored = localStorage.getItem(DEVICE_CODE_KEY)
  if (!stored) return null

  const { device_code, expires_at } = JSON.parse(stored)
  if (Date.now() > expires_at) {
    localStorage.removeItem(DEVICE_CODE_KEY)
    return null
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  })

  if (!response.ok) return null

  const data = await response.json()

  if (data.access_token) {
    localStorage.removeItem(DEVICE_CODE_KEY)
    return { access_token: data.access_token }
  }

  if (data.error === "authorization_pending") return null
  if (data.error === "slow_down") return null
  if (data.error === "expired_token" || data.error === "access_denied") {
    localStorage.removeItem(DEVICE_CODE_KEY)
    return null
  }

  return null
}

export function initiateGitHubLogin(): void {
  const state = generateState()
  localStorage.setItem("gh_state", state)

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "read:user user:email",
    state,
  })

  window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`
}

export async function handleGitHubCallback(code: string, state: string): Promise<User | null> {
  const savedState = localStorage.getItem("gh_state")
  if (state !== savedState) {
    console.error("Invalid state parameter")
    return null
  }

  try {
    const response = await fetch("/api/auth/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })

    if (!response.ok) throw new Error("Auth failed")

    const data = await response.json()
    const user: User = {
      id: data.user.id,
      githubUserId: data.user.github_user_id,
      username: data.user.login,
      displayName: data.user.name || data.user.login,
      email: data.user.email,
      avatarUrl: data.user.avatar_url,
      bio: data.user.bio || "",
      title: "",
      skills: [],
      location: data.user.location || "",
      company: data.user.company || "",
      blog: data.user.blog || "",
      followerCount: 0,
      followingCount: 0,
      publishedCount: 0,
      createdAt: new Date().toISOString(),
    }

    setAuthState({ user, token: data.token })

    try {
      const api = (window as any).api
      if (api?.storeSet) {
        await api.storeSet("ecosystem", "token", data.token)
        await api.storeSet("ecosystem", "user", JSON.stringify(user))
      }
      if (api?.saveEcosystemAuth) {
        await api.saveEcosystemAuth({ token: data.token, user })
      }
    } catch {}

    const storage = initGitHubStorage(data.token, data.user.login)
    await storage.initUserData()

    const ai = getAIConnection()
    await ai.connect(data.token, data.user.login)
    await storage.syncWithAI(ai.getSession()?.id || "")

    return user
  } catch (error) {
    console.error("GitHub auth error:", error)
    return null
  }
}

export async function loginWithToken(token: string): Promise<User | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!response.ok) throw new Error("Invalid token")

    const githubUser = await response.json()
    const user: User = {
      id: `user-${githubUser.id}`,
      githubUserId: githubUser.id,
      username: githubUser.login,
      displayName: githubUser.name || githubUser.login,
      email: githubUser.email || "",
      avatarUrl: githubUser.avatar_url,
      bio: githubUser.bio || "",
      title: "",
      skills: [],
      location: githubUser.location || "",
      company: githubUser.company || "",
      blog: githubUser.blog || "",
      followerCount: githubUser.followers || 0,
      followingCount: githubUser.following || 0,
      publishedCount: 0,
      createdAt: githubUser.created_at || new Date().toISOString(),
    }

    setAuthState({ user, token })

    // Store token encrypted in private repo
    try {
      await storeUserToken(
        user.id,
        githubUser.login,
        token,
        githubUser.avatar_url,
        ["read:user", "user:email"]
      )
    } catch {}

    try {
      const api = (window as any).api
      if (api?.storeSet) {
        await api.storeSet("ecosystem", "token", token)
        await api.storeSet("ecosystem", "user", JSON.stringify(user))
      }
      if (api?.saveEcosystemAuth) {
        await api.saveEcosystemAuth({ token, user })
      }
    } catch {}

    const storage = initGitHubStorage(token, githubUser.login)
    await storage.initUserData()

    const ai = getAIConnection()
    await ai.connect(token, githubUser.login)
    await storage.syncWithAI(ai.getSession()?.id || "")

    return user
  } catch (error) {
    console.error("Token login error:", error)
    return null
  }
}

export async function completeDeviceFlowLogin(token: string): Promise<User | null> {
  return loginWithToken(token)
}

export function logout(): void {
  clearGitHubStorage()
  clearAIConnection()
  clearAuthState()
  window.location.href = "/ecosystem"
}

export function useAuth() {
  const state = getAuthState()

  return {
    ...state,
    login: startDeviceFlow,
    logout,
    isLoggedIn: () => state.isAuthenticated,
    user: () => state.user,
  }
}

export function getStorage() {
  return getGitHubStorage()
}

export function getAI() {
  return getAIConnection()
}
