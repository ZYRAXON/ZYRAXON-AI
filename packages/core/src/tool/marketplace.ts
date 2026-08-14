export * as MarketplaceTool from "./marketplace"

import { ToolFailure } from "@zyraxon-ai/llm"
import { Context, Effect, Layer, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import { makeLocationNode } from "../effect/app-node"
import { LayerNodePlatform } from "../effect/app-node-platform"
import { PermissionV2 } from "../permission"
import { Tool } from "./tool"
import { Tools } from "./tools"
import { ToolRegistry } from "./registry"

export const name = "marketplace"

export const description = `Search, install, and PUBLISH to ZYRAXON Ecosystem marketplace:
- ZYRAXON Ecosystem (plugins, bots, templates, themes, tools, games, desktop apps, ISOs) — data in onelpawarai/ZYRAXON-DATA repo
- VS Code Marketplace (extensions, themes, snippets)
- Open VSX (open source extensions)
- npm Registry (JavaScript packages)
- GitHub Actions (CI/CD workflows)
- Docker Hub (container images)
- Chromium Web Store (browser extensions)

Use "publish" action to add items to ZYRAXON marketplace — commits directly to ZYRAXON-DATA repo.`

const Source = Schema.Literals(["zyraxon", "vscode", "openvsx", "npm", "github-actions", "docker", "chromium"])

export const Input = Schema.Union([
  Schema.Struct({
    action: Schema.Literal("search"),
    source: Source,
    query: Schema.String.annotate({ description: "Search query" }),
    limit: Schema.optional(Schema.Number).annotate({ description: "Max results (default: 20)" }),
  }),
  Schema.Struct({
    action: Schema.Literal("search_all"),
    query: Schema.String.annotate({ description: "Search query" }),
    limit: Schema.optional(Schema.Number).annotate({ description: "Max results per marketplace (default: 10)" }),
  }),
  Schema.Struct({
    action: Schema.Literal("recommend"),
    description: Schema.String.annotate({ description: "What you need (e.g., 'React development', 'Python linting')" }),
  }),
  Schema.Struct({
    action: Schema.Literal("popular"),
    source: Source,
    limit: Schema.optional(Schema.Number).annotate({ description: "Max results (default: 20)" }),
  }),
  Schema.Struct({
    action: Schema.Literal("install"),
    source: Source,
    item_id: Schema.String.annotate({ description: "Item ID or extension identifier to install" }),
  }),
  Schema.Struct({
    action: Schema.Literal("publish"),
    name: Schema.String.annotate({ description: "Item name (e.g., 'NovaMart', 'My Portfolio')" }),
    description: Schema.String.annotate({ description: "Item description" }),
    author: Schema.String.annotate({ description: "Author name or GitHub username" }),
    version: Schema.String.annotate({ description: "Version (e.g., '1.0.0')" }),
    category: Schema.String.annotate({ description: "Category: ai-bots, plugins, website-templates, themes, components, startkits, workflows, ai-models, tools, sdks, types, pdfs, books, apis, mobile-apps, browser-extensions, cli-tools, prompts, datasets, icons, ui-kits, landing-pages, desktop-apps, iso-images, fonts, code-snippets, devops, website-games" }),
    type: Schema.optional(Schema.String.annotate({ description: "Type: plugin, bot, template, theme, tool, game, desktop-app, iso, website, website-game" })),
    tags: Schema.optional(Schema.Array(Schema.String).annotate({ description: "Tags for searchability" })),
    liveDemo: Schema.optional(Schema.String.annotate({ description: "Live demo URL (e.g., GitHub Pages URL)" })),
    githubRepo: Schema.optional(Schema.String.annotate({ description: "GitHub repository URL" })),
    installCommand: Schema.optional(Schema.String.annotate({ description: "Install command (e.g., 'npm install xyz')" })),
    screenshot: Schema.optional(Schema.String.annotate({ description: "Screenshot URL" })),
  }),
])

const VSCode_API = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery"
const OpenVSX_API = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery1"
const Npm_API = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery0"
const GitHub_API = "https://api.github.com/search/repositories"
const Docker_API = "https://hub.docker.com/api/search/v3/catalog"
const Chromium_API = "https://chromewebstore.google.com/_/ChromeWebStoreData/search"
const ZYRAXON_API = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery2"

// Load marketplace config (ZYRAXON-DATA repo + token)
let MARKETPLACE_CONFIG: { zyraxonDataRepo: string; zyraxonDataToken: string } = { zyraxonDataRepo: "onelpawarai/ZYRAXON-DATA", zyraxonDataToken: "" }
try {
  const fs = require("node:fs")
  const path = require("node:path")
  const configPath = path.join(__dirname, "marketplace-config.json")
  if (fs.existsSync(configPath)) {
    MARKETPLACE_CONFIG = JSON.parse(fs.readFileSync(configPath, "utf-8"))
  }
} catch {}
const ZYRAXON_REPO = MARKETPLACE_CONFIG.zyraxonDataRepo

interface MarketItem {
  name: string
  displayName: string
  description: string
  publisher: string
  version: string
  installs: number
  rating: number
  source: string
  url: string
  categories: string[]
  installCommand?: string
  liveDemo?: string
  githubRepo?: string
}

async function searchZyraxon(query: string, limit: number): Promise<MarketItem[]> {
  try {
    const resp = await fetch(`${ZYRAXON_API}/repos/${ZYRAXON_REPO}/contents/marketplace/published/index.json`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
    if (!resp.ok) return []
    const data = await resp.json()
    if (!data.content) return []
    const items = JSON.parse(atob(data.content.replace(/\n/g, ""))) as any[]
    const q = query.toLowerCase()
    const filtered = items.filter((item: any) =>
      item.name?.toLowerCase().includes(q) ||
      item.description?.toLowerCase().includes(q) ||
      item.author?.toLowerCase().includes(q) ||
      item.tags?.some((t: string) => t.toLowerCase().includes(q)) ||
      item.category?.toLowerCase().includes(q)
    ).slice(0, limit)

    return filtered.map((item: any) => ({
      name: item.name || "",
      displayName: item.name || "",
      description: item.description || "",
      publisher: item.author || "",
      version: item.version || "",
      installs: item.downloads || 0,
      rating: item.rating || 0,
      source: "zyraxon",
      url: `https://zyraxonai.lovable.app/ecosystem`,
      categories: [item.category, item.type].filter(Boolean),
      installCommand: item.installCommand,
      liveDemo: item.liveDemo,
      githubRepo: item.githubRepo || item.repository,
    }))
  } catch {
    return []
  }
}

async function getZyraxonItem(itemId: string): Promise<MarketItem | null> {
  try {
    const resp = await fetch(`${ZYRAXON_API}/repos/${ZYRAXON_REPO}/contents/marketplace/published/index.json`, {
      headers: { Accept: "application/vnd.github.v3+json" },
    })
    if (!resp.ok) return null
    const data = await resp.json()
    if (!data.content) return null
    const items = JSON.parse(atob(data.content.replace(/\n/g, ""))) as any[]
    const item = items.find((i: any) => i.id === itemId || i.name === itemId)
    if (!item) return null
    return {
      name: item.name || "",
      displayName: item.name || "",
      description: item.description || "",
      publisher: item.author || "",
      version: item.version || "",
      installs: item.downloads || 0,
      rating: item.rating || 0,
      source: "zyraxon",
      url: `https://zyraxonai.lovable.app/ecosystem`,
      categories: [item.category, item.type].filter(Boolean),
      installCommand: item.installCommand,
      liveDemo: item.liveDemo,
      githubRepo: item.githubRepo || item.repository,
    }
  } catch {
    return null
  }
}

async function searchVSCode(query: string, limit: number): Promise<MarketItem[]> {
  const body = {
    filters: [{
      criteria: [{ filterType: 10, value: query }],
      pageNumber: 1,
      pageSize: limit,
      sortBy: 0,
      sortOrder: 0,
    }],
    flags: 914,
  }

  const resp = await fetch(`${VSCode_API}?api-version=3.0-preview.1`, {
    method: "POST",
    headers: {
      Accept: "application/json;api-version=3.0-preview.1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) return []
  const data = await resp.json()
  const exts = data.results?.[0]?.extensions || []

  return exts.map((ext: any) => ({
    name: ext.extensionName,
    displayName: ext.displayName,
    description: ext.shortDescription || "",
    publisher: ext.publisher?.publisherName || "",
    version: ext.versions?.[0]?.version || "",
    installs: Math.round(ext.statistics?.find((s: any) => s.statisticName === "install")?.value || 0),
    rating: Number((ext.statistics?.find((s: any) => s.statisticName === "averagerating")?.value || 0).toFixed(1)),
    source: "vscode",
    url: `https://marketplace.visualstudio.com/items?itemName=${ext.publisher?.publisherName}.${ext.extensionName}`,
    categories: ext.categories || [],
  }))
}

async function searchOpenVSX(query: string, limit: number): Promise<MarketItem[]> {
  const resp = await fetch(`${OpenVSX_API}/search?query=${encodeURIComponent(query)}&size=${limit}`)
  if (!resp.ok) return []
  const data = await resp.json()

  return (data.extensions || []).map((ext: any) => ({
    name: ext.name,
    displayName: ext.displayName || ext.name,
    description: ext.description || "",
    publisher: ext.namespace || "",
    version: ext.version || "",
    installs: ext.downloadCount || 0,
    rating: ext.avgRating || 0,
    source: "openvsx",
    url: `https://open-vsx.org/extension/${ext.namespace}/${ext.name}`,
    categories: ext.categories || [],
  }))
}

async function searchNpm(query: string, limit: number): Promise<MarketItem[]> {
  const resp = await fetch(`${Npm_API}?text=${encodeURIComponent(query)}&size=${limit}`)
  if (!resp.ok) return []
  const data = await resp.json()

  return (data.objects || []).map((pkg: any) => ({
    name: pkg.package.name,
    displayName: pkg.package.name,
    description: pkg.package.description || "",
    publisher: pkg.package.publisher?.username || "",
    version: pkg.package.version || "",
    installs: Math.round((pkg.score?.detail?.popularity || 0) * 1000000),
    rating: Math.round((pkg.score?.final || 0) * 5 * 10) / 10,
    source: "npm",
    url: pkg.package.links?.npm || `https://www.npmjs.com/package/${pkg.package.name}`,
    categories: pkg.package.keywords?.slice(0, 5) || [],
  }))
}

async function searchGitHubActions(query: string, limit: number): Promise<MarketItem[]> {
  const resp = await fetch(`${GitHub_API}?q=${encodeURIComponent(query)}+topic:github-actions&sort=stars&per_page=${limit}`, {
    headers: { Accept: "application/vnd.github.v3+json" },
  })
  if (!resp.ok) return []
  const data = await resp.json()

  return (data.items || []).map((repo: any) => ({
    name: repo.name,
    displayName: repo.full_name,
    description: repo.description || "",
    publisher: repo.owner?.login || "",
    version: "",
    installs: repo.stargazers_count || 0,
    rating: 0,
    source: "github-actions",
    url: repo.html_url,
    categories: repo.topics || [],
  }))
}

async function searchDocker(query: string, limit: number): Promise<MarketItem[]> {
  const resp = await fetch(`${Docker_API}?type=image&query=${encodeURIComponent(query)}&page_size=${limit}`)
  if (!resp.ok) return []
  const data = await resp.json()

  return (data.results || []).map((img: any) => ({
    name: img.repo_name?.split("/").pop() || "",
    displayName: img.repo_name || "",
    description: img.short_description || "",
    publisher: img.repo_owner || "",
    version: "",
    installs: img.pull_count || 0,
    rating: img.star_count || 0,
    source: "docker",
    url: `https://hub.docker.com/r/${img.repo_name}`,
    categories: img.is_official ? ["Official"] : [],
  }))
}

async function searchChromium(query: string, limit: number): Promise<MarketItem[]> {
  try {
    const resp = await fetch(`${Chromium_API}?hl=en&gl=US&q=${encodeURIComponent(query)}`)
    if (!resp.ok) return []
    const data = await resp.json()
    const exts = data[1] || []

    return exts.slice(0, limit).map((ext: any) => ({
      name: ext.name || "",
      displayName: ext.name || "",
      description: ext.description || "",
      publisher: ext.developer?.name || "",
      version: ext.version || "",
      installs: ext.user_count || 0,
      rating: ext.rating || 0,
      source: "chromium",
      url: ext.detail_url || `https://chromewebstore.google.com/detail/${ext.id}`,
      categories: ext.category ? [ext.category] : [],
    }))
  } catch {
    return []
  }
}

async function searchMarketplace(source: string, query: string, limit: number): Promise<MarketItem[]> {
  switch (source) {
    case "zyraxon": return searchZyraxon(query, limit)
    case "vscode": return searchVSCode(query, limit)
    case "openvsx": return searchOpenVSX(query, limit)
    case "npm": return searchNpm(query, limit)
    case "github-actions": return searchGitHubActions(query, limit)
    case "docker": return searchDocker(query, limit)
    case "chromium": return searchChromium(query, limit)
    default: return []
  }
}

function formatItems(items: MarketItem[]): string {
  if (items.length === 0) return "No results found."
  return items.map((item, i) => {
    const installs = item.installs >= 1000000 ? `${(item.installs / 1000000).toFixed(1)}M` :
                     item.installs >= 1000 ? `${(item.installs / 1000).toFixed(1)}K` :
                     String(item.installs)
    return `${i + 1}. ${item.displayName} (${item.source})
   Publisher: ${item.publisher}
   ${item.description.slice(0, 150)}${item.description.length > 150 ? '...' : ''}
   Downloads: ${installs} | Rating: ${item.rating}/5
   URL: ${item.url}`
  }).join("\n\n")
}

async function publishToZyraxon(item: {
  name: string, description: string, author: string, version: string,
  category: string, type?: string, tags?: string[], liveDemo?: string,
  githubRepo?: string, installCommand?: string, screenshot?: string,
}): Promise<string> {
  // Token priority: 1) Config file (OUR token), 2) Env var, 3) Auth.json (user token)
  let token = MARKETPLACE_CONFIG.zyraxonDataToken || ""
  
  // Fallback: environment variable
  if (!token) token = process.env.ZYRAXON_GITHUB_TOKEN || process.env.GITHUB_TOKEN || ""
  
  // Fallback: read from auth.json (user's token)
  if (!token) {
    try {
      const fs = require("node:fs")
      const path = require("node:path")
      const os = require("node:os")
      const appDataPath = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
      const authPath = path.join(appDataPath, "zyraxon", "ecosystem", "auth.json")
      if (fs.existsSync(authPath)) {
        const authData = JSON.parse(fs.readFileSync(authPath, "utf-8"))
        token = authData.token || ""
      }
    } catch {}
  }

  if (!token) return "ERROR: No GitHub token available. User must login to marketplace first."

  const headers = {
    Authorization: `token ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  }

  // Read current items
  const fileResp = await fetch(`${ZYRAXON_API}/repos/${ZYRAXON_REPO}/contents/marketplace/published/index.json`, { headers })
  if (!fileResp.ok) return "ERROR: Could not read marketplace data."
  const fileData = await fileResp.json()
  const sha = fileData.sha
  const items = JSON.parse(atob(fileData.content.replace(/\n/g, ""))) as any[]

  // Check if item already exists
  const itemId = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const existing = items.find((i: any) => i.id === itemId || i.name === item.name)
  if (existing) return `ERROR: Item "${item.name}" already exists in marketplace.`

  // Add new item
  const newItem = {
    id: itemId,
    name: item.name,
    description: item.description,
    author: item.author,
    version: item.version,
    category: item.category,
    type: item.type || item.category,
    tags: item.tags || [],
    downloads: 0,
    rating: 0,
    createdAt: new Date().toISOString(),
    liveDemo: item.liveDemo || "",
    githubRepo: item.githubRepo || "",
    installCommand: item.installCommand || "",
    screenshot: item.screenshot || "",
  }
  items.push(newItem)

  // Commit to repo
  const content = btoa(JSON.stringify(items, null, 2))
  const commitResp = await fetch(`${ZYRAXON_API}/repos/${ZYRAXON_REPO}/contents/marketplace/published/index.json`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `feat: publish "${item.name}" to ZYRAXON marketplace`,
      content,
      sha,
    }),
  })

  if (!commitResp.ok) {
    const err = await commitResp.json()
    return `ERROR: Failed to publish — ${err.message || "unknown error"}`
  }

  return `SUCCESS: "${item.name}" published to ZYRAXON marketplace!\nItem ID: ${itemId}\nView at: https://zyraxonai.lovable.app/ecosystem`
}

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const permission = yield* PermissionV2.Service

    yield* tools
      .register({
        [name]: Tool.make({
          description,
          input: Input,
          output: Schema.Struct({ text: Schema.String }),
          toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
          execute: (input, context) => {
            return Effect.gen(function* () {
              yield* permission.assert({
                action: name,
                resources: [JSON.stringify(input)],
                save: ["*"],
                metadata: input,
                sessionID: context.sessionID,
                agent: context.agent,
                source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
              })

              let text = ""

              if (input.action === "search") {
                const items = yield* Effect.promise(() => searchMarketplace(input.source, input.query, input.limit || 20))
                text = formatItems(items)
              } else if (input.action === "search_all") {
                const sources = ["zyraxon", "vscode", "openvsx", "npm", "github-actions", "docker", "chromium"]
                const allResults = yield* Effect.promise(() =>
                  Promise.all(sources.map(s => searchMarketplace(s, input.query, input.limit || 5)))
                )
                text = sources.map((s, i) => `\n## ${s.toUpperCase()}\n${formatItems(allResults[i])}`).join("\n")
              } else if (input.action === "recommend") {
                const sources = ["zyraxon", "vscode", "npm", "github-actions", "docker"]
                const allResults = yield* Effect.promise(() =>
                  Promise.all(sources.map(s => searchMarketplace(s, input.description, 3)))
                )
                text = `Recommendations for "${input.description}":\n\n` +
                  sources.map((s, i) => `\n## ${s.toUpperCase()}\n${formatItems(allResults[i])}`).join("\n")
              } else if (input.action === "popular") {
                const items = yield* Effect.promise(() => searchMarketplace(input.source, "", input.limit || 20))
                text = formatItems(items)
              } else if (input.action === "install") {
                if (input.source === "zyraxon") {
                  const item = yield* Effect.promise(() => getZyraxonItem(input.item_id))
                  if (!item) {
                    text = `Item "${input.item_id}" not found in ZYRAXON Ecosystem.`
                  } else {
                    text = `## ${item.displayName}\n` +
                      `Author: ${item.publisher}\n` +
                      `${item.description}\n` +
                      `Version: ${item.version}\n` +
                      `Installs: ${item.installs} | Rating: ${item.rating}/5\n` +
                      (item.installCommand ? `\nInstall command: \`${item.installCommand}\`\n` : "") +
                      (item.liveDemo ? `\nLive demo: ${item.liveDemo}\n` : "") +
                      (item.githubRepo ? `\nGitHub: ${item.githubRepo}\n` : "") +
                      `\nTo install this item, open the ZYRAXON Ecosystem tab and click Install.`
                  }
                } else {
                  text = `To install ${input.source} extension "${input.item_id}":\n` +
                    `- Open ZYRAXON Extensions tab in the Ecosystem sidebar\n` +
                    `- Search for "${input.item_id}"\n` +
                    `- Click Install to download and enable it in-app\n` +
                    `Or use the CLI: zyraxon extensions install ${input.item_id}`
                }
              } else if (input.action === "publish") {
                text = yield* Effect.promise(() => publishToZyraxon({
                  name: input.name,
                  description: input.description,
                  author: input.author,
                  version: input.version,
                  category: input.category,
                  type: input.type,
                  tags: input.tags,
                  liveDemo: input.liveDemo,
                  githubRepo: input.githubRepo,
                  installCommand: input.installCommand,
                  screenshot: input.screenshot,
                }))
              }

              return { text: text || "No results found." }
            }).pipe(Effect.mapError(() => new ToolFailure({ message: "Marketplace search failed" })))
          },
        }),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/marketplace",
  layer,
  deps: [ToolRegistry.node, PermissionV2.node, LayerNodePlatform.httpClient],
})
