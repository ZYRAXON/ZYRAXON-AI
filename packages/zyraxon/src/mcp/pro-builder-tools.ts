// ZYRAXON Pro Builder MCP Tools
// Website creation, publishing, and management tools
// Supports: HTML, React, Vue, Astro, Svelte, Tailwind, TypeScript
// Publishing: GitHub Pages (free forever, custom domains)

import { getSiteManager } from "../pro-builder/engine"
import { getGitHubManager } from "../pro-builder/github-manager"
import { MediaManager } from "../pro-builder/media-manager"

interface ToolResult {
  success: boolean
  output: string
  error?: string
  details?: Record<string, any>
}

// ─── Site Create ────────────────────────────────────────────────────────────

export async function siteCreate(params: {
  name: string
  type?: string
  framework?: string
  theme?: { mode?: string; primaryColor?: string }
  metadata?: Record<string, string>
}): Promise<ToolResult> {
  try {
    const manager = await getSiteManager()
    const site = await manager.createSite({
      name: params.name,
      type: (params.type as any) || "portfolio",
      template: params.type || "portfolio",
      framework: (params.framework as any) || "html",
      theme: params.theme as any,
      metadata: params.metadata || {},
    })

    // Generate initial files
    const fs = await import("fs/promises")
    const pathMod = await import("path")

    if (site.framework === "html" || site.framework === "tailwind") {
      const html = generateBasicHtml(site.name, params.metadata || {})
      const css = generateBasicCss(site.theme)
      const js = generateBasicJs()

      await fs.writeFile(pathMod.join(site.directory, "index.html"), html)
      await fs.writeFile(pathMod.join(site.directory, "style.css"), css)
      await fs.writeFile(pathMod.join(site.directory, "script.js"), js)
    }

    await manager.saveSiteManifest(site.id)

    return {
      success: true,
      output: `Website "${params.name}" created!\nID: ${site.id}\nType: ${site.type}\nFramework: ${site.framework}\nDirectory: ${site.directory}\nPreview: http://localhost:${site.port}`,
      details: { siteId: site.id, port: site.port, directory: site.directory, framework: site.framework },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── Site Publish (GitHub Pages) ────────────────────────────────────────────

export async function sitePublish(params: {
  siteId: string
  action?: string
}): Promise<ToolResult> {
  try {
    const manager = await getSiteManager()
    const action = params.action || "publish"

    if (action === "publish") {
      const { pagesUrl, repoUrl } = await manager.publishSite(params.siteId)
      return {
        success: true,
        output: `Website published to GitHub Pages!\nPages URL: ${pagesUrl}\nRepo URL: ${repoUrl}\nLocal URL: http://localhost:${manager.getSite(params.siteId)?.port}`,
        details: { pagesUrl, repoUrl },
      }
    }

    if (action === "unpublish") {
      await manager.unpublishSite(params.siteId)
      return { success: true, output: "Website unpublished from GitHub Pages. Still available locally." }
    }

    if (action === "start") {
      const url = await manager.startServer(params.siteId)
      return { success: true, output: `Server started: ${url}` }
    }

    if (action === "stop") {
      await manager.stopServer(params.siteId)
      return { success: true, output: "Server stopped." }
    }

    if (action === "status") {
      const site = manager.getSite(params.siteId)
      if (!site) return { success: false, output: "", error: "Site not found" }
      return {
        success: true,
        output: `Site: ${site.name}\nPublished: ${site.published}\nMethod: ${site.publishMethod || "none"}\nPages URL: ${site.githubPagesUrl || "not published"}\nCustom Domain: ${site.customDomain || "none"}`,
      }
    }

    return { success: false, output: "", error: `Unknown action: ${action}` }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── Site List ──────────────────────────────────────────────────────────────

export async function siteList(): Promise<ToolResult> {
  try {
    const manager = await getSiteManager()
    const sites = manager.listSites()

    if (sites.length === 0) {
      return { success: true, output: "No websites found. Create one with site_create." }
    }

    const list = sites.map(s =>
      `- ${s.name} (${s.type}) | Framework: ${s.framework} | Port: ${s.port} | Published: ${s.published ? "Yes" : "No"}${s.githubPagesUrl ? ` | URL: ${s.githubPagesUrl}` : ""}`
    ).join("\n")

    return { success: true, output: `Websites:\n${list}` }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── GitHub Connect ─────────────────────────────────────────────────────────

export async function githubConnect(params: {
  action: string
  token?: string
}): Promise<ToolResult> {
  try {
    const gh = await getGitHubManager()

    switch (params.action) {
      case "connect": {
        if (!params.token) {
          return { success: false, output: "", error: "Token required. Get one at https://github.com/settings/tokens" }
        }
        const result = await gh.connectWithToken(params.token)
        if (result.success) {
          return { success: true, output: `GitHub connected! Username: ${result.username}` }
        }
        return { success: false, output: "", error: result.error }
      }

      case "disconnect": {
        await gh.disconnect()
        return { success: true, output: "GitHub disconnected." }
      }

      case "status": {
        const connected = gh.isConnected()
        if (!connected) {
          return { success: true, output: "GitHub not connected. Use connect action with a Personal Access Token." }
        }
        const user = await gh.getUser()
        const repos = await gh.listRepos()
        return {
          success: true,
          output: `GitHub connected!\nUsername: ${user?.username}\nEmail: ${user?.email}\nZYRAXON Repos: ${repos.length}`,
        }
      }

      case "list_repos": {
        if (!gh.isConnected()) return { success: false, output: "", error: "GitHub not connected" }
        const repos = await gh.listRepos()
        const list = repos.map(r => `- ${r.name}: ${r.pagesUrl}`).join("\n")
        return { success: true, output: `ZYRAXON Repos:\n${list || "None"}` }
      }

      default:
        return { success: false, output: "", error: `Unknown action: ${params.action}` }
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── Media Fetch ────────────────────────────────────────────────────────────

export async function mediaFetch(params: {
  query: string
  type?: string
  siteId?: string
}): Promise<ToolResult> {
  try {
    const manager = await getSiteManager()
    const site = params.siteId ? manager.getSite(params.siteId) : null
    const mediaManager = new MediaManager(site?.directory || "")

    const type = params.type || "image"

    if (type === "icon") {
      const svg = mediaManager.getSvgIcon(params.query)
      if (svg) {
        return { success: true, output: `SVG icon "${params.query}":\n${svg}` }
      }
      return { success: true, output: `Available icons: ${mediaManager.getAvailableIcons().join(", ")}` }
    }

    if (type === "image") {
      const results = await mediaManager.searchImages(params.query, 5)
      return {
        success: true,
        output: `Found ${results.length} images for "${params.query}"\n${results.map(r => `${r.url}`).join("\n")}`,
      }
    }

    return { success: true, output: `Media search for "${params.query}" (${type}) completed.` }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── SVG Generate ───────────────────────────────────────────────────────────

export async function svgGenerate(params: {
  type?: string
  style?: string
  colors?: string[]
  size?: number
}): Promise<ToolResult> {
  try {
    const mediaManager = new MediaManager("")
    const svg = mediaManager.generateSvgIcon({
      type: (params.type as any) || "icon",
      style: (params.style as any) || "outline",
      colors: params.colors,
      size: params.size,
    })

    return { success: true, output: `Generated SVG:\n${svg}` }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── Domain Management ──────────────────────────────────────────────────────

export async function siteDomain(params: {
  action: string
  domain?: string
  siteId?: string
}): Promise<ToolResult> {
  try {
    const manager = await getSiteManager()
    const gh = await getGitHubManager()

    switch (params.action) {
      case "add": {
        if (!params.domain || !params.siteId) {
          return { success: false, output: "", error: "domain and siteId required" }
        }
        if (!gh.isConnected()) {
          return { success: false, output: "", error: "GitHub not connected" }
        }
        const result = await manager.setCustomDomain(params.siteId, params.domain)
        return {
          success: true,
          output: `Custom domain set: ${result.domain}\n\nInstructions:\n${result.instructions.join("\n")}`,
        }
      }

      case "remove": {
        if (!params.siteId) return { success: false, output: "", error: "siteId required" }
        await manager.removeCustomDomain(params.siteId)
        return { success: true, output: "Custom domain removed." }
      }

      case "sitemap": {
        if (!params.siteId) return { success: false, output: "", error: "siteId required" }
        const site = manager.getSite(params.siteId)
        if (!site) return { success: false, output: "", error: "Site not found" }
        const { getDomainManager } = await import("../pro-builder/domain-manager")
        const domainManager = await getDomainManager()
        const domain = domainManager.getDomainForSite(params.siteId)
        const sitemap = domainManager.generateSitemap(site.directory, domain?.fullUrl || site.githubPagesUrl || `http://localhost:${site.port}`, ["", "about", "contact"])
        const fs = await import("fs/promises")
        await fs.writeFile(`${site.directory}/sitemap.xml`, sitemap)
        return { success: true, output: `sitemap.xml generated for ${site.name}` }
      }

      case "robots": {
        if (!params.siteId) return { success: false, output: "", error: "siteId required" }
        const site = manager.getSite(params.siteId)
        if (!site) return { success: false, output: "", error: "Site not found" }
        const { getDomainManager } = await import("../pro-builder/domain-manager")
        const domainManager = await getDomainManager()
        const domain = domainManager.getDomainForSite(params.siteId)
        const robots = domainManager.generateRobotsTxt(domain?.fullUrl || site.githubPagesUrl || `http://localhost:${site.port}`)
        const fs = await import("fs/promises")
        await fs.writeFile(`${site.directory}/robots.txt`, robots)
        return { success: true, output: `robots.txt generated` }
      }

      default:
        return { success: false, output: "", error: `Unknown action: ${params.action}` }
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── Auto Start (for app relaunch) ─────────────────────────────────────────

export async function autoStartSites(): Promise<ToolResult> {
  try {
    const manager = await getSiteManager()
    const results = await manager.autoStartAll()

    if (results.length === 0) {
      return { success: true, output: "No sites to auto-start." }
    }

    const list = results.map(r =>
      `- Site ${r.id}: Local=${r.url}${r.pagesUrl ? ` | Pages=${r.pagesUrl}` : ""}`
    ).join("\n")

    return { success: true, output: `Auto-started ${results.length} site(s):\n${list}` }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ─── Helper: Generate Basic HTML ────────────────────────────────────────────

function generateBasicHtml(name: string, metadata: Record<string, string>): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${metadata.title || name}</title>
  <meta name="description" content="${metadata.description || name + ' - Built with ZYRAXON Pro Builder'}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <nav class="nav">
    <div class="container nav-inner">
      <a href="#" class="nav-logo">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
          <rect width="32" height="32" rx="8" fill="var(--primary)"/>
          <path d="M10 22L16 10L22 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>${name}</span>
      </a>
    </div>
  </nav>
  <section class="hero">
    <div class="container">
      <h1>Welcome to <span class="gradient-text">${name}</span></h1>
      <p>Built with ZYRAXON Pro Builder</p>
    </div>
  </section>
  <script src="script.js"></script>
</body>
</html>`
}

function generateBasicCss(theme: any): string {
  return `
:root {
  --primary: ${theme?.primaryColor || '#6366f1'};
  --bg: ${theme?.mode === 'light' ? '#ffffff' : '#0a0a0a'};
  --surface: ${theme?.mode === 'light' ? '#f5f5f5' : '#1a1a1a'};
  --text: ${theme?.mode === 'light' ? '#1a1a1a' : '#ffffff'};
  --muted: ${theme?.mode === 'light' ? '#666666' : '#a0a0a0'};
  --border: ${theme?.mode === 'light' ? '#e5e5e5' : '#2a2a2a'};
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); }
.container { max-width: 1200px; margin: 0 auto; padding: 0 24px; }
.nav { padding: 16px 0; border-bottom: 1px solid var(--border); }
.nav-inner { display: flex; align-items: center; justify-content: space-between; }
.nav-logo { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 1.25rem; text-decoration: none; color: inherit; }
.hero { min-height: 80vh; display: flex; align-items: center; text-align: center; }
.hero h1 { font-size: clamp(2rem, 5vw, 3.5rem); margin-bottom: 16px; }
.hero p { color: var(--muted); font-size: 1.25rem; }
.gradient-text { background: linear-gradient(135deg, var(--primary), #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
`
}

function generateBasicJs(): string {
  return `console.log("Website powered by ZYRAXON Pro Builder");`
}

// ─── Exports ────────────────────────────────────────────────────────────────

export const proBuilderTools = {
  siteCreate,
  sitePublish,
  siteList,
  githubConnect,
  mediaFetch,
  svgGenerate,
  siteDomain,
  autoStartSites,
}
