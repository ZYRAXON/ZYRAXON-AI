const GITHUB_API = "https://api.github.com"

interface GitHubFile {
  path: string
  content: string
  sha?: string
}

interface GitHubRepo {
  name: string
  description: string
  private: boolean
}

export class GitHubDataStorage {
  private token: string
  private username: string
  private repoName = "zyraxon-ecosystem-data"

  constructor(token: string, username: string) {
    this.token = token
    this.username = username
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    }
  }

  async initUserData(): Promise<void> {
    const repoExists = await this.checkRepoExists()
    if (!repoExists) {
      await this.createDataRepo()
    }
    await this.ensureFileExists("profile.json", JSON.stringify({
      id: "",
      username: this.username,
      displayName: "",
      bio: "",
      location: "",
      company: "",
      blog: "",
      publishedCount: 0,
      followerCount: 0,
      followingCount: 0,
      createdAt: new Date().toISOString(),
    }))
    await this.ensureFileExists("likes.json", JSON.stringify([]))
    await this.ensureFileExists("comments.json", JSON.stringify([]))
    await this.ensureFileExists("follows.json", JSON.stringify({ followers: [], following: [] }))
    await this.ensureFileExists("published.json", JSON.stringify([]))
    await this.ensureFileExists("ai_connection.json", JSON.stringify({
      connected: false,
      sessionId: null,
      lastSync: null,
      preferences: {},
    }))
  }

  private async checkRepoExists(): Promise<boolean> {
    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${this.username}/${this.repoName}`,
        { headers: this.headers }
      )
      return response.ok
    } catch {
      return false
    }
  }

  private async createDataRepo(): Promise<void> {
    await fetch(`${GITHUB_API}/user/repos`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        name: this.repoName,
        description: "ZYRAXON Ecosystem - User Data Storage (Private)",
        private: true,
        auto_init: true,
      }),
    })
  }

  private async ensureFileExists(path: string, defaultContent: string): Promise<void> {
    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${this.username}/${this.repoName}/contents/${path}`,
        { headers: this.headers }
      )
      if (!response.ok) {
        await this.createFile(path, defaultContent)
      }
    } catch {
      await this.createFile(path, defaultContent)
    }
  }

  private async createFile(path: string, content: string): Promise<void> {
    await fetch(
      `${GITHUB_API}/repos/${this.username}/${this.repoName}/contents/${path}`,
      {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify({
          message: `Create ${path}`,
          content: btoa(unescape(encodeURIComponent(content))),
        }),
      }
    )
  }

  private async getFile(path: string): Promise<any> {
    try {
      const response = await fetch(
        `${GITHUB_API}/repos/${this.username}/${this.repoName}/contents/${path}`,
        { headers: this.headers }
      )
      if (!response.ok) return null
      const data = await response.json()
      if (data.content) {
        return JSON.parse(decodeURIComponent(escape(atob(data.content.replace(/\n/g, "")))))
      }
      return null
    } catch {
      return null
    }
  }

  async updateFile(path: string, content: any, message: string): Promise<void> {
    const getFileResponse = await fetch(
      `${GITHUB_API}/repos/${this.username}/${this.repoName}/contents/${path}`,
      { headers: this.headers }
    )
    let sha: string | undefined
    if (getFileResponse.ok) {
      const fileData = await getFileResponse.json()
      sha = fileData.sha
    }
    await fetch(
      `${GITHUB_API}/repos/${this.username}/${this.repoName}/contents/${path}`,
      {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify({
          message,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
          sha,
        }),
      }
    )
  }

  async getProfile(): Promise<any> {
    return await this.getFile("profile.json")
  }

  async updateProfile(profile: any): Promise<void> {
    await this.updateFile("profile.json", profile, "Update user profile")
  }

  async getLikes(): Promise<string[]> {
    const data = await this.getFile("likes.json")
    return data || []
  }

  async addLike(itemId: string): Promise<void> {
    const likes = await this.getLikes()
    if (!likes.includes(itemId)) {
      likes.push(itemId)
      await this.updateFile("likes.json", likes, `Like item: ${itemId}`)
    }
  }

  async removeLike(itemId: string): Promise<void> {
    const likes = await this.getLikes()
    const filtered = likes.filter((id) => id !== itemId)
    await this.updateFile("likes.json", filtered, `Unlike item: ${itemId}`)
  }

  async isLiked(itemId: string): Promise<boolean> {
    const likes = await this.getLikes()
    return likes.includes(itemId)
  }

  async getComments(): Promise<any[]> {
    const data = await this.getFile("comments.json")
    return data || []
  }

  async addComment(comment: any): Promise<void> {
    const comments = await this.getComments()
    comments.push({
      ...comment,
      id: `comment-${Date.now()}`,
      createdAt: new Date().toISOString(),
    })
    await this.updateFile("comments.json", comments, `Add comment on: ${comment.itemId}`)
  }

  async getFollows(): Promise<{ followers: string[]; following: string[] }> {
    const data = await this.getFile("follows.json")
    return data || { followers: [], following: [] }
  }

  async followUser(userId: string): Promise<void> {
    const follows = await this.getFollows()
    if (!follows.following.includes(userId)) {
      follows.following.push(userId)
      await this.updateFile("follows.json", follows, `Follow user: ${userId}`)
    }
    try {
      await fetch(`${GITHUB_API}/user/following/${userId}`, {
        method: "PUT",
        headers: this.headers,
      })
    } catch {}
  }

  async unfollowUser(userId: string): Promise<void> {
    const follows = await this.getFollows()
    follows.following = follows.following.filter((id) => id !== userId)
    await this.updateFile("follows.json", follows, `Unfollow user: ${userId}`)
    try {
      await fetch(`${GITHUB_API}/user/following/${userId}`, {
        method: "DELETE",
        headers: this.headers,
      })
    } catch {}
  }

  async isFollowing(userId: string): Promise<boolean> {
    const follows = await this.getFollows()
    return follows.following.includes(userId)
  }

  async getPublishedItems(): Promise<any[]> {
    const data = await this.getFile("published.json")
    return data || []
  }

  async addPublishedItem(item: any): Promise<void> {
    const items = await this.getPublishedItems()
    items.push({
      ...item,
      id: `item-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await this.updateFile("published.json", items, `Publish item: ${item.name}`)
  }

  async getAIConnection(): Promise<any> {
    const data = await this.getFile("ai_connection.json")
    return data || {
      connected: false,
      sessionId: null,
      lastSync: null,
      preferences: {},
    }
  }

  async updateAIConnection(connection: any): Promise<void> {
    await this.updateFile("ai_connection.json", connection, "Update AI connection")
  }

  async syncWithAI(sessionId: string): Promise<void> {
    const connection = await this.getAIConnection()
    connection.connected = true
    connection.sessionId = sessionId
    connection.lastSync = new Date().toISOString()
    await this.updateAIConnection(connection)
  }

  async getChatMessages(): Promise<any[]> {
    const data = await this.getFile("community_chat.json")
    return data || []
  }

  async addChatMessage(message: any): Promise<void> {
    const messages = await this.getChatMessages()
    messages.push({
      ...message,
      id: `msg-${Date.now()}`,
      timestamp: new Date().toISOString(),
      likes: 0,
      likedBy: [],
    })
    await this.updateFile("community_chat.json", messages, `Chat message from ${message.username}`)
  }

  async likeChatMessage(messageId: string, userId: string): Promise<void> {
    const messages = await this.getChatMessages()
    const msg = messages.find((m: any) => m.id === messageId)
    if (msg) {
      if (!msg.likedBy) msg.likedBy = []
      if (!msg.likedBy.includes(userId)) {
        msg.likedBy.push(userId)
        msg.likes = (msg.likes || 0) + 1
        await this.updateFile("community_chat.json", messages, `Like message: ${messageId}`)
      }
    }
  }

  async getMarketplaceItems(): Promise<any[]> {
    const data = await this.getFile("marketplace.json")
    return data || []
  }

  async addMarketplaceItem(item: any): Promise<void> {
    const items = await this.getMarketplaceItems()
    items.push({
      ...item,
      id: `market-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    await this.updateFile("marketplace.json", items, `Add marketplace item: ${item.name}`)
  }

  async getStats(): Promise<{
    totalLikes: number
    totalComments: number
    totalFollowers: number
    totalFollowing: number
    totalPublished: number
  }> {
    const likes = await this.getLikes()
    const comments = await this.getComments()
    const follows = await this.getFollows()
    const published = await this.getPublishedItems()
    return {
      totalLikes: likes.length,
      totalComments: comments.length,
      totalFollowers: follows.followers.length,
      totalFollowing: follows.following.length,
      totalPublished: published.length,
    }
  }
}

let storageInstance: GitHubDataStorage | null = null

export function getGitHubStorage(): GitHubDataStorage | null {
  return storageInstance
}

export function initGitHubStorage(token: string, username: string): GitHubDataStorage {
  storageInstance = new GitHubDataStorage(token, username)
  return storageInstance
}

export function clearGitHubStorage(): void {
  storageInstance = null
}
