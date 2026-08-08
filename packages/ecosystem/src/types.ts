export type Category =
  | "ai-bots"
  | "plugins"
  | "website-templates"
  | "themes"
  | "components"
  | "startkits"
  | "workflows"
  | "ai-models"
  | "tools"
  | "sdks"
  | "pdfs"
  | "books"
  | "apis"
  | "mobile-apps"
  | "browser-extensions"
  | "cli-tools"
  | "prompts"
  | "datasets"
  | "icons"
  | "ui-kits"
  | "landing-pages"
  | "desktop-apps"
  | "iso-images"
  | "fonts"
  | "code-snippets"
  | "devops"
  | "website-games"
  | "types"

export type ItemType = "plugin" | "template" | "bot" | "model" | "tool" | "sdk" | "api" | "app" | "extension" | "cli" | "prompt" | "dataset" | "icon" | "ui-kit" | "landing-page" | "workflow" | "pdf" | "book" | "component" | "theme" | "startkit" | "desktop-app" | "iso" | "font" | "snippet" | "devops" | "website-game"

export interface SocialLinks {
  facebook?: string
  telegram?: string
  tiktok?: string
  discord?: string
  twitter?: string
}

export interface EcosystemItem {
  id: string
  name: string
  description: string
  version: string
  author: string
  authorAvatar?: string
  authorId: string
  category: Category
  type: ItemType
  tags: string[]
  icon?: string
  coverImage?: string
  logo?: string
  screenshots?: string[]
  downloads: number
  rating: number
  reviews: number
  likeCount: number
  commentCount: number
  verified: boolean
  featured: boolean
  createdAt: string
  updatedAt: string
  repository: string
  liveDemo?: string
  npmPackage?: string
  githubRepo?: string
  socialLinks?: SocialLinks
  platforms?: ("windows" | "macos" | "linux" | "android" | "ios" | "web")[]
  downloadUrl?: string
  installCommand?: string
  fileSize?: string
  license?: string
  remixedFrom?: string
  remixCount?: number
  gameConfig?: GameConfig
}

export interface GameConfig {
  engine: "html5" | "phaser" | "pixi" | "threejs" | "unity-webgl" | "custom"
  width?: number
  height?: number
  fullscreen?: boolean
  controls?: Record<string, string>
  assets?: string[]
}

export interface CategoryInfo {
  id: Category
  name: string
  icon: string
  description: string
  count: number
}

export interface EcosystemStats {
  totalPlugins: number
  totalBots: number
  totalTemplates: number
  totalDownloads: number
  totalUsers: number
}

export interface RecentActivity {
  id: string
  type: "plugin" | "bot" | "template" | "update" | "like" | "comment"
  name: string
  author: string
  authorAvatar?: string
  timestamp: string
}

export type ViewMode = "home" | "explore" | "categories" | "top-rated" | "trending" | "new" | "my-plugins" | "my-downloads" | "my-favorites" | "my-extensions" | "profile" | "marketplace" | "extensions" | "github" | "product-detail" | "settings" | "ai-settings" | "community"

export interface User {
  id: string
  githubUserId: number
  username: string
  displayName: string
  email: string
  avatarUrl: string
  bio: string
  title: string
  skills: string[]
  location: string
  company: string
  blog: string
  followerCount: number
  followingCount: number
  publishedCount: number
  createdAt: string
}

export interface ChatAttachment {
  url: string
  name: string
  type: string
  size: number
}

export interface ChatMessage {
  id: string
  userId: string
  username: string
  avatarUrl: string
  content: string
  timestamp: string
  likes: number
  likedBy: string[]
  attachment?: ChatAttachment
}

export interface Comment {
  id: string
  userId: string
  username: string
  avatarUrl: string
  content: string
  itemId: string
  parentId?: string
  createdAt: string
  likeCount: number
}

export interface Follow {
  followerId: string
  followingId: string
  createdAt: string
}

export interface Like {
  userId: string
  itemId: string
  createdAt: string
}