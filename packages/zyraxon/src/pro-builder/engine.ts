/**
 * PRO BUILDER ENGINE
 *
 * Main engine for creating, building, and managing websites.
 * Handles the complete lifecycle from creation to publishing.
 *
 * Publishing is done via GitHub Pages (free forever, custom domains supported).
 * Local preview runs on built-in HTTP server.
 */

import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { getGitHubManager, type GitHubManager } from "./github-manager"

// ─── GitHub Integration ─────────────────────────────────────────────────────

export interface GitHubPublishInfo {
  repoName: string
  repoUrl: string
  pagesUrl: string
  customDomain?: string
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SiteConfig {
  id: string
  name: string
  type: SiteType
  template: string
  directory: string
  port: number
  published: boolean
  publishMethod?: "github-pages" | null
  githubRepo?: string | null
  githubPagesUrl?: string | null
  customDomain?: string | null
  framework: FrameworkType
  buildCommand?: string | null
  outputDir?: string | null
  created: string
  updated: string
  theme: ThemeConfig
  media: MediaConfig
  metadata: Record<string, unknown>
}

export type SiteType =
  | "portfolio"
  | "landing"
  | "blog"
  | "ecommerce"
  | "business"
  | "restaurant"
  | "saas"
  | "dashboard"
  | "gallery"
  | "custom"

export type FrameworkType =
  | "html"           // Pure HTML/CSS/JS (no build step)
  | "react"          // React + Vite
  | "vue"            // Vue + Vite
  | "astro"          // Astro framework
  | "next"           // Next.js (static export)
  | "svelte"         // Svelte + Vite
  | "tailwind"       // HTML + Tailwind CSS CDN
  | "tailwind-build" // HTML + Tailwind CSS (build step)
  | "typescript"     // TypeScript + Vite

export interface ThemeConfig {
  mode: "dark" | "light" | "auto"
  primaryColor: string
  secondaryColor: string
  backgroundColor: string
  surfaceColor: string
  textColor: string
  mutedTextColor: string
  borderColor: string
  fontFamily: string
  headingFont: string
  borderRadius: string
}

export interface MediaConfig {
  images: MediaItem[]
  videos: MediaItem[]
  audio: MediaItem[]
  icons: MediaItem[]
}

export interface MediaItem {
  id: string
  filename: string
  originalUrl: string
  localPath: string
  type: "image" | "video" | "audio" | "icon"
  format: string
  size: number
  width?: number
  height?: number
  alt?: string
  fetched: string
}

export interface SiteManifest {
  version: string
  sites: SiteConfig[]
  lastUpdated: string
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ZYRAXON_HOME = path.join(os.homedir(), ".zyraxon")
const WEBSITES_DIR = path.join(ZYRAXON_HOME, "websites")
const MANIFEST_PATH = path.join(WEBSITES_DIR, "sites.json")
const PREVIEW_STATE_PATH = path.join(WEBSITES_DIR, "preview-state.json")
const BASE_PORT = 3847
const MAX_PORT = 3947

// ─── Preview State (for Electron IPC) ───────────────────────────────────────

export interface PreviewState {
  url: string | null
  siteName: string | null
  siteId: string | null
  timestamp: string
}

const EMPTY_PREVIEW: PreviewState = {
  url: null,
  siteName: null,
  siteId: null,
  timestamp: new Date().toISOString(),
}

export async function writePreviewState(state: PreviewState): Promise<void> {
  await fs.mkdir(WEBSITES_DIR, { recursive: true })
  await fs.writeFile(PREVIEW_STATE_PATH, JSON.stringify({ ...state, timestamp: new Date().toISOString() }))
}

export async function readPreviewState(): Promise<PreviewState> {
  try {
    const data = await fs.readFile(PREVIEW_STATE_PATH, "utf-8")
    return JSON.parse(data) as PreviewState
  } catch {
    return { ...EMPTY_PREVIEW, timestamp: new Date().toISOString() }
  }
}

export async function clearPreviewState(): Promise<void> {
  await writePreviewState({ ...EMPTY_PREVIEW, timestamp: new Date().toISOString() })
}

// ─── Default Theme ──────────────────────────────────────────────────────────

export const DEFAULT_THEME: ThemeConfig = {
  mode: "dark",
  primaryColor: "#6366f1",
  secondaryColor: "#8b5cf6",
  backgroundColor: "#0a0a0a",
  surfaceColor: "#1a1a1a",
  textColor: "#ffffff",
  mutedTextColor: "#a0a0a0",
  borderColor: "#2a2a2a",
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  headingFont: "'Space Grotesk', 'Inter', sans-serif",
  borderRadius: "12px",
}

// ─── Site Manager ───────────────────────────────────────────────────────────

export class SiteManager {
  private sites: Map<string, SiteConfig> = new Map()
  private servers: Map<string, SiteServer> = new Map()
  private manifest: SiteManifest | null = null

  /**
   * Initialize the site manager - load existing sites
   */
  async initialize(): Promise<void> {
    await fs.mkdir(WEBSITES_DIR, { recursive: true })
    
    try {
      const data = await fs.readFile(MANIFEST_PATH, "utf-8")
      this.manifest = JSON.parse(data)
      for (const site of this.manifest!.sites) {
        this.sites.set(site.id, site)
      }
    } catch {
      this.manifest = {
        version: "1.0.0",
        sites: [],
        lastUpdated: new Date().toISOString(),
      }
      await this.saveManifest()
    }
  }

  /**
   * Create a new website
   */
  async createSite(options: {
    name: string
    type: SiteType
    template?: string
    framework?: FrameworkType
    buildCommand?: string
    outputDir?: string
    theme?: Partial<ThemeConfig>
    metadata?: Record<string, unknown>
  }): Promise<SiteConfig> {
    const id = this.generateId(options.name)
    const directory = path.join(WEBSITES_DIR, id)
    const port = this.getNextPort()
    const framework = options.framework || "html"

    // Create directory structure
    await fs.mkdir(directory, { recursive: true })
    await fs.mkdir(path.join(directory, "assets", "images"), { recursive: true })
    await fs.mkdir(path.join(directory, "assets", "videos"), { recursive: true })
    await fs.mkdir(path.join(directory, "assets", "audio"), { recursive: true })
    await fs.mkdir(path.join(directory, "assets", "icons"), { recursive: true })

    // For framework projects, create src directory
    if (framework !== "html") {
      await fs.mkdir(path.join(directory, "src"), { recursive: true })
    }

    const site: SiteConfig = {
      id,
      name: options.name,
      type: options.type,
      template: options.template || options.type,
      directory,
      port,
      published: false,
      publishMethod: null,
      githubRepo: null,
      githubPagesUrl: null,
      customDomain: null,
      framework,
      buildCommand: options.buildCommand || null,
      outputDir: options.outputDir || null,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      theme: { ...DEFAULT_THEME, ...options.theme },
      media: { images: [], videos: [], audio: [], icons: [] },
      metadata: options.metadata || {},
    }

    this.sites.set(id, site)
    await this.saveManifest()

    return site
  }

  /**
   * Get a site by ID
   */
  getSite(id: string): SiteConfig | undefined {
    return this.sites.get(id)
  }

  /**
   * List all sites
   */
  listSites(): SiteConfig[] {
    return Array.from(this.sites.values())
  }

  /**
   * Update a site's configuration
   */
  async updateSite(id: string, updates: Partial<SiteConfig>): Promise<SiteConfig> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)

    const updated = { ...site, ...updates, updated: new Date().toISOString() }
    this.sites.set(id, updated)
    await this.saveManifest()

    return updated
  }

  /**
   * Delete a site
   */
  async deleteSite(id: string): Promise<void> {
    const site = this.sites.get(id)
    if (!site) return

    // Stop server if running
    const server = this.servers.get(id)
    if (server) {
      await server.stop()
      this.servers.delete(id)
    }

    // Delete from GitHub if published
    if (site.published && site.githubRepo) {
      try {
        const gh = await getGitHubManager()
        if (gh.isConnected()) {
          await gh.deleteRepo(site.githubRepo)
        }
      } catch {}
    }

    // Remove directory
    await fs.rm(site.directory, { recursive: true, force: true })

    this.sites.delete(id)
    await this.saveManifest()
  }

  /**
   * Get the next available port
   */
  private getNextPort(): number {
    const usedPorts = new Set(
      Array.from(this.sites.values()).map((s) => s.port)
    )

    for (let port = BASE_PORT; port < MAX_PORT; port++) {
      if (!usedPorts.has(port)) return port
    }

    throw new Error("No available ports")
  }

  /**
   * Generate a URL-safe ID from a name
   */
  private generateId(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      + "-" + Date.now().toString(36)
  }

  /**
   * Save the manifest to disk
   */
  private async saveManifest(): Promise<void> {
    this.manifest!.sites = Array.from(this.sites.values())
    this.manifest!.lastUpdated = new Date().toISOString()
    await fs.writeFile(MANIFEST_PATH, JSON.stringify(this.manifest, null, 2))
  }

  /**
   * Start a site's local server
   */
  async startServer(id: string): Promise<string> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)

    let server = this.servers.get(id)
    if (!server) {
      server = new SiteServer(site)
      this.servers.set(id, server)
    }

    if (server.isRunning()) return server.getUrl()

    await server.start()
    return server.getUrl()
  }

  /**
   * Stop a site's local server
   */
  async stopServer(id: string): Promise<void> {
    const server = this.servers.get(id)
    if (server) {
      await server.stop()
    }
  }

  /**
   * Build a site (for frameworks that need compilation)
   */
  async buildSite(id: string): Promise<{ success: boolean; outputDir: string; error?: string }> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)

    // HTML sites don't need building
    if (site.framework === "html" || site.framework === "tailwind") {
      return { success: true, outputDir: site.directory }
    }

    const { exec } = await import("child_process")
    const { promisify } = await import("util")
    const execAsync = promisify(exec)

    try {
      // Install dependencies if needed
      const pkgJsonPath = path.join(site.directory, "package.json")
      const pkgExists = await fs.access(pkgJsonPath).then(() => true).catch(() => false)

      if (pkgExists) {
        console.log(`[ProBuilder] Installing dependencies for "${site.name}"...`)
        await execAsync("npm install", { cwd: site.directory, timeout: 120000 })
      }

      // Build the project
      const buildCmd = site.buildCommand || this.getDefaultBuildCommand(site.framework)
      if (buildCmd) {
        console.log(`[ProBuilder] Building "${site.name}" with: ${buildCmd}`)
        await execAsync(buildCmd, { cwd: site.directory, timeout: 120000 })
      }

      // Determine output directory
      const outputDir = site.outputDir || this.getDefaultOutputDir(site.framework)

      return { success: true, outputDir: path.join(site.directory, outputDir) }
    } catch (error: any) {
      return { success: false, outputDir: site.directory, error: error.message }
    }
  }

  /**
   * Get default build command for a framework
   */
  private getDefaultBuildCommand(framework: FrameworkType): string | null {
    const commands: Record<FrameworkType, string | null> = {
      html: null,
      tailwind: null,
      "tailwind-build": "npx tailwindcss -i ./src/input.css -o ./dist/style.css --minify",
      react: "npm run build",
      vue: "npm run build",
      astro: "npm run build",
      next: "npx next build && npx next export",
      svelte: "npm run build",
      typescript: "npm run build",
    }
    return commands[framework] || null
  }

  /**
   * Get default output directory for a framework
   */
  private getDefaultOutputDir(framework: FrameworkType): string {
    const dirs: Record<FrameworkType, string> = {
      html: ".",
      tailwind: ".",
      "tailwind-build": "dist",
      react: "dist",
      vue: "dist",
      astro: "dist",
      next: "out",
      svelte: "dist",
      typescript: "dist",
    }
    return dirs[framework] || "dist"
  }

  /**
   * Get the serve directory (output for frameworks, root for HTML)
   */
  getServeDir(site: SiteConfig): string {
    if (site.framework === "html" || site.framework === "tailwind") {
      return site.directory
    }
    return path.join(site.directory, this.getDefaultOutputDir(site.framework))
  }

  /**
   * Publish a site to GitHub Pages
   */
  async publishSite(id: string): Promise<{ pagesUrl: string; repoUrl: string }> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)

    const gh = await getGitHubManager()
    if (!gh.isConnected()) {
      throw new Error(
        "GitHub not connected. Please connect your GitHub account first. " +
        "Go to Settings > GitHub > Connect, or provide a Personal Access Token."
      )
    }

    // Create repo (or get existing)
    const repo = await gh.createRepo(site.name, `ZYRAXON Pro Builder site: ${site.name}`)

    // Push all site files
    const pushResult = await gh.pushFiles(
      repo.name,
      site.directory,
      `Update site "${site.name}" via ZYRAXON Pro Builder`,
    )
    if (!pushResult.success) {
      throw new Error(`Failed to push files: ${pushResult.error}`)
    }

    // Enable GitHub Pages
    const pagesResult = await gh.enablePages(repo.name)
    if (!pagesResult.success) {
      throw new Error(`Failed to enable GitHub Pages: ${pagesResult.error}`)
    }

    // Update site config
    site.published = true
    site.publishMethod = "github-pages"
    site.githubRepo = repo.name
    site.githubPagesUrl = pagesResult.url || repo.pagesUrl
    await this.updateSite(id, site)

    // Write preview state so Electron renderer can show the live preview
    await writePreviewState({
      url: site.githubPagesUrl,
      siteName: site.name,
      siteId: site.id,
      timestamp: new Date().toISOString(),
    })

    return {
      pagesUrl: site.githubPagesUrl,
      repoUrl: repo.url,
    }
  }

  /**
   * Unpublish a site (remove from GitHub Pages)
   */
  async unpublishSite(id: string): Promise<void> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)

    const gh = await getGitHubManager()
    if (gh.isConnected() && site.githubRepo) {
      // Delete the repo
      await gh.deleteRepo(site.githubRepo)
    }

    // Update site config
    site.published = false
    site.publishMethod = null
    site.githubRepo = null
    site.githubPagesUrl = null
    site.customDomain = null
    await this.updateSite(id, site)

    // Clear preview state
    await clearPreviewState()
  }

  /**
   * Set a custom domain for a published site
   */
  async setCustomDomain(id: string, domain: string): Promise<{ domain: string; instructions: string[] }> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)
    if (!site.githubRepo) throw new Error("Site not published yet. Publish first, then set custom domain.")

    const gh = await getGitHubManager()
    if (!gh.isConnected()) throw new Error("GitHub not connected.")

    const result = await gh.setCustomDomain(site.githubRepo, domain)
    if (!result.success) throw new Error(`Failed to set custom domain: ${result.error}`)

    site.customDomain = domain
    await this.updateSite(id, site)

    return {
      domain,
      instructions: [
        `1. Go to your domain registrar (where you bought ${domain})`,
        `2. Add a CNAME record:`,
        `   - Name: @ (or www)`,
        `   - Value: ${site.githubRepo ? (await gh.getUser())?.username + ".github.io" : "username.github.io"}`,
        `   - Type: CNAME`,
        `3. Wait 5-30 minutes for DNS propagation`,
        `4. Your site will be live at https://${domain}`,
      ],
    }
  }

  /**
   * Remove custom domain
   */
  async removeCustomDomain(id: string): Promise<void> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)
    if (!site.githubRepo) throw new Error("Site not published.")

    const gh = await getGitHubManager()
    if (gh.isConnected()) {
      await gh.removeCustomDomain(site.githubRepo)
    }

    site.customDomain = null
    await this.updateSite(id, site)
  }

  /**
   * Auto-start all published sites (called on app launch)
   */
  async autoStartAll(): Promise<Array<{ id: string; url: string; pagesUrl?: string }>> {
    const results: Array<{ id: string; url: string; pagesUrl?: string }> = []

    for (const [id, site] of this.sites) {
      try {
        const url = await this.startServer(id)
        const result: { id: string; url: string; pagesUrl?: string } = { id, url }

        if (site.published && site.githubPagesUrl) {
          result.pagesUrl = site.githubPagesUrl
        }

        results.push(result)
      } catch (error) {
        console.error(`Failed to auto-start site ${id}:`, error)
      }
    }

    return results
  }

  /**
   * Stop all servers
   */
  async stopAll(): Promise<void> {
    for (const [id, server] of this.servers) {
      await server.stop()
    }
    this.servers.clear()
  }

  /**
   * Get manifest path for a site
   */
  getSiteManifestPath(id: string): string {
    return path.join(WEBSITES_DIR, id, "site.json")
  }

  /**
   * Save site manifest to its directory
   */
  async saveSiteManifest(id: string): Promise<void> {
    const site = this.sites.get(id)
    if (!site) throw new Error(`Site not found: ${id}`)
    
    const manifestPath = path.join(site.directory, "site.json")
    await fs.writeFile(manifestPath, JSON.stringify(site, null, 2))
  }
}

// ─── Site Server ────────────────────────────────────────────────────────────

class SiteServer {
  private site: SiteConfig
  private server: import("http").Server | null = null
  private running = false

  constructor(site: SiteConfig) {
    this.site = site
  }

  isRunning(): boolean {
    return this.running
  }

  getUrl(): string {
    return `http://localhost:${this.site.port}`
  }

  async start(): Promise<void> {
    if (this.running) return

    const http = await import("http")
    const mimeTypes: Record<string, string> = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".txt": "text/plain",
      ".xml": "application/xml",
      ".pdf": "application/pdf",
    }

    this.server = http.createServer(async (req, res) => {
      let urlPath = req.url?.split("?")[0] || "/"
      if (urlPath === "/") urlPath = "/index.html"

      const filePath = path.join(this.site.directory, urlPath)

      try {
        const data = await fs.readFile(filePath)
        const ext = path.extname(filePath).toLowerCase()
        const contentType = mimeTypes[ext] || "application/octet-stream"

        res.writeHead(200, {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        })
        res.end(data)
      } catch {
        res.writeHead(404, { "Content-Type": "text/html" })
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>404 Not Found</title></head>
          <body style="font-family:sans-serif;padding:40px;text-align:center;background:#0a0a0a;color:#fff">
            <h1>404 - Not Found</h1>
            <p>The file <code>${urlPath}</code> was not found.</p>
          </body>
          </html>
        `)
      }
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(this.site.port, "127.0.0.1", () => {
        this.running = true
        console.log(`[ProBuilder] Site "${this.site.name}" running at ${this.getUrl()}`)
        resolve()
      })
      this.server!.on("error", reject)
    })
  }

  async stop(): Promise<void> {
    if (!this.server || !this.running) return

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false
        console.log(`[ProBuilder] Site "${this.site.name}" stopped`)
        resolve()
      })
    })
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: SiteManager | null = null

export async function getSiteManager(): Promise<SiteManager> {
  if (!instance) {
    instance = new SiteManager()
    await instance.initialize()
  }
  return instance
}

export function getSiteManagerSync(): SiteManager | null {
  return instance
}
