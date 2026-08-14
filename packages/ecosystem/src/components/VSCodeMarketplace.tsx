import { type Component, createSignal, createEffect, createMemo, onCleanup, For, Show } from "solid-js"
import { CommentSection } from "./CommentSection"
import { RatingStars } from "./RatingStars"
import { ShareButton } from "./ShareButton"
import { LikeButton } from "./LikeButton"
import { incrementDownload } from "../services/shared-data"

export interface VSExtension {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  publisher: { name: string; displayName: string; verified: boolean; domain: string | null }
  icon: string | null
  installs: number
  updateCount: number
  rating: number
  ratingCount: number
  trendingWeekly: number
  categories: string[]
  tags: string[]
  lastUpdated: string
  publishedDate: string
  preview: boolean
  repository: string | null
  homepage: string | null
  license: string | null
  changelog: string | null
  readmeUrl: string | null
  vsix: string | null
  marketplaceUrl: string
  installUri: string
  websiteUrl: string
  brandingColor: string | null
}

const GALLERY = "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery"

const SORT_BY: Record<string, number> = {
  relevance: 0,
  installs: 4,
  rating: 12,
  trending: 8,
  name: 2,
  updated: 10,
}

type GalleryFile = { assetType: string; source: string }
type GalleryVersion = {
  version: string
  lastUpdated: string
  assetUri?: string
  fallbackAssetUri?: string
  files?: GalleryFile[]
  properties?: { key: string; value: string }[]
}
type GalleryExtension = {
  extensionId: string
  extensionName: string
  displayName: string
  shortDescription?: string
  publishedDate: string
  lastUpdated: string
  releaseDate: string
  flags?: string
  categories?: string[]
  tags?: string[]
  publisher: { publisherName: string; displayName: string; flags?: string; domain?: string; isDomainVerified?: boolean }
  versions?: GalleryVersion[]
  statistics?: { statisticName: string; value: number }[]
}

function asset(v: GalleryVersion | undefined, type: string): string | null {
  const f = v?.files?.find((x) => x.assetType === type)
  return f?.source ?? null
}

function prop(v: GalleryVersion | undefined, key: string): string | null {
  return v?.properties?.find((p) => p.key === key)?.value ?? null
}

function stat(e: GalleryExtension, name: string): number {
  return e.statistics?.find((s) => s.statisticName === name)?.value ?? 0
}

function normalize(e: GalleryExtension): VSExtension {
  const v = e.versions?.[0]
  const id = `${e.publisher.publisherName}.${e.extensionName}`
  return {
    id,
    name: e.extensionName,
    displayName: e.displayName,
    description: e.shortDescription ?? "",
    version: v?.version ?? "",
    publisher: {
      name: e.publisher.publisherName,
      displayName: e.publisher.displayName,
      verified: e.publisher.isDomainVerified === true || (e.publisher.flags ?? "").includes("verified"),
      domain: e.publisher.domain ?? null,
    },
    icon: asset(v, "Microsoft.VisualStudio.Services.Icons.Default"),
    installs: stat(e, "install"),
    updateCount: stat(e, "updateCount"),
    rating: stat(e, "averagerating"),
    ratingCount: stat(e, "ratingcount"),
    trendingWeekly: stat(e, "trendingweekly"),
    categories: e.categories ?? [],
    tags: (e.tags ?? []).filter((t) => !t.startsWith("__")),
    lastUpdated: e.lastUpdated,
    publishedDate: e.publishedDate,
    preview: (e.flags ?? "").includes("preview"),
    repository: prop(v, "Microsoft.VisualStudio.Services.Links.Source") ?? prop(v, "Microsoft.VisualStudio.Services.Links.GitHub"),
    homepage: prop(v, "Microsoft.VisualStudio.Services.Links.Learn"),
    license: asset(v, "Microsoft.VisualStudio.Services.Content.License"),
    changelog: asset(v, "Microsoft.VisualStudio.Services.Content.Changelog"),
    readmeUrl: asset(v, "Microsoft.VisualStudio.Services.Content.Details"),
    vsix: asset(v, "Microsoft.VisualStudio.Services.VSIXPackage"),
    marketplaceUrl: `https://marketplace.visualstudio.com/items?itemName=${id}`,
    installUri: `zyraxon://install/extension/${id}`,
    websiteUrl: `https://zyraxonai.lovable.app/ecosystem?item=${encodeURIComponent(id)}`,
    brandingColor: prop(v, "Microsoft.VisualStudio.Services.Branding.Color"),
  }
}

async function queryGallery(body: unknown) {
  // Try IPC proxy first (Electron - no CORS)
  try {
    const api = (window as any).api
    if (api?.queryVscodeMarketplace) {
      const data = await api.queryVscodeMarketplace(body)
      if (data && !data.error) return data as { results: { extensions: GalleryExtension[]; resultMetadata?: { metadataType: string; metadataItems: { name: string; count: number }[] }[] }[] }
    }
  } catch {}
  // Fallback to direct fetch (may fail with CORS in browser)
  const res = await fetch(GALLERY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json;api-version=7.2-preview.1",
      "User-Agent": "zyraxon-ecosystem",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gallery ${res.status}`)
  return (await res.json()) as {
    results: { extensions: GalleryExtension[]; resultMetadata?: { metadataType: string; metadataItems: { name: string; count: number }[] }[] }[]
  }
}

async function fetchExtension(id: string): Promise<{ item: VSExtension; readme: string | null }> {
  const data = await queryGallery({
    filters: [{ criteria: [{ filterType: 8, value: "Microsoft.VisualStudio.Code" }, { filterType: 7, value: id }], pageNumber: 1, pageSize: 1 }],
    flags: 950,
  })
  const raw = data.results?.[0]?.extensions?.[0]
  if (!raw) throw new Error("Extension not found")
  const item = normalize(raw)
  let readme: string | null = null
  if (item.readmeUrl) {
    try {
      const r = await fetch(item.readmeUrl, { headers: { "User-Agent": "zyraxon-ecosystem" } })
      if (r.ok) readme = (await r.text()).slice(0, 400_000)
    } catch {}
  }
  return { item, readme }
}

async function searchExtensions(q: string, category: string, page: number, pageSize: number, sortBy: number) {
  const criteria: { filterType: number; value: string }[] = [
    { filterType: 8, value: "Microsoft.VisualStudio.Code" },
    { filterType: 12, value: "37888" },
  ]
  if (q) criteria.push({ filterType: 10, value: q })
  if (category) criteria.push({ filterType: 5, value: category })

  const data = await queryGallery({
    filters: [{ criteria, pageNumber: page, pageSize, sortBy, sortOrder: 0 }],
    flags: 914,
  })

  const result = data.results?.[0]
  const total = result?.resultMetadata?.[0]?.metadataItems?.find((m) => m.name === "TotalCount")?.count ?? 0
  return { items: (result?.extensions ?? []).map(normalize), total }
}

const CATEGORIES = [
  "All", "Programming Languages", "Snippets", "Linters", "Themes", "Debuggers",
  "Formatters", "Keymaps", "SCM Providers", "Other", "Extension Packs",
  "Language Packs", "Data Science", "Machine Learning", "Visualization",
  "Notebooks", "Education", "Testing", "AI", "Chat",
]

const SORTS = [
  { id: "installs", label: "Install Count" },
  { id: "rating", label: "Rating" },
  { id: "trending", label: "Trending Weekly" },
  { id: "updated", label: "Recently Updated" },
  { id: "name", label: "Name" },
  { id: "relevance", label: "Relevance" },
]

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) }
  catch { return iso }
}

/* ────────────────── tiny markdown renderer ────────────────── */
const ALLOWED_TAGS = new Set([
  "p", "br", "hr", "em", "i", "strong", "b", "u", "a", "img", "code", "pre", "kbd", "blockquote",
  "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "div", "span", "center", "small", "sub", "sup",
  "table", "thead", "tbody", "tr", "th", "td", "details", "summary", "picture", "source",
])

function sanitizeHtml(s: string) {
  return s
    .replace(/<(script|style|iframe|object|embed|form|link|meta)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '$1="#"')
    .replace(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g, (m, tag: string) =>
      ALLOWED_TAGS.has(tag.toLowerCase()) ? m : m.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .replace(/<(?![/a-zA-Z!])/g, "&lt;")
}

function renderMarkdown(md: string, baseRepo: string | null): string {
  let out = sanitizeHtml(md)
  const blocks: string[] = []
  out = out.replace(/```[\w-]*\n?([\s\S]*?)```/g, (_m, code: string) => {
    blocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`)
    return `\u0000BLOCK${blocks.length - 1}\u0000`
  })
  out = out
    .replace(/^######\s+(.*)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>")
    .replace(/^\s*[-*]{3,}\s*$/gm, "<hr/>")
    .replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, alt: string, src: string) => {
      const abs = /^https?:/.test(src)
        ? src
        : baseRepo
          ? `${baseRepo.replace(/\.git$/, "").replace("github.com", "raw.githubusercontent.com")}/HEAD/${src.replace(/^\.?\//, "")}`
          : ""
      return abs ? `<img src="${abs}" alt="${alt}" loading="lazy"/>` : ""
    })
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/^\s*[-*+]\s+(.*)$/gm, "<li>$1</li>")
    .replace(/^\s*\d+\.\s+(.*)$/gm, "<li>$1</li>")
  out = out.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>")
  out = out
    .split(/\n{2,}/)
    .map((p) => (/^\s*<(h\d|ul|ol|pre|hr|img|table|blockquote|p|div|center|details|a\b|span)/i.test(p.trim()) || p.includes("\u0000BLOCK") ? p : `<p>${p.replace(/\n/g, "<br/>")}</p>`))
    .join("\n")
  out = out.replace(/\u0000BLOCK(\d+)\u0000/g, (_m, i: string) => blocks[Number(i)] ?? "")
  return out
}

/* ────────────────── Extension Row ────────────────── */
const Row: Component<{ ext: VSExtension; onOpen: () => void }> = (props) => {
  const [hover, setHover] = createSignal(false)
  return (
    <div
      onClick={props.onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", gap: "14px", padding: "14px", cursor: "pointer",
        background: hover() ? "#1c2128" : "#161b22",
        border: `1px solid ${hover() ? "#30363d" : "#21262d"}`,
        "border-radius": "10px", transition: "background 0.12s ease, border-color 0.12s ease",
      }}
    >
      <img
        src={props.ext.icon ?? "https://cdn.vsassets.io/v/M190_20210811.1/_content/Header/default_icon.png"}
        alt=""
        width={48} height={48} loading="lazy"
        style={{ width: "48px", height: "48px", "border-radius": "8px", "object-fit": "contain", background: "#0d1117", "flex-shrink": "0" }}
      />
      <div style={{ "min-width": "0", flex: "1" }}>
        <div style={{ display: "flex", "align-items": "baseline", gap: "8px", "flex-wrap": "wrap" }}>
          <span style={{ "font-size": "14px", "font-weight": "600", color: "#e6edf3", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis", "max-width": "100%" }}>{props.ext.displayName}</span>
          <span style={{ "font-size": "12px", color: "#8b949e" }}>v{props.ext.version}</span>
          <Show when={props.ext.preview}>
            <span style={{ "font-size": "10px", color: "#d29922", border: "1px solid #d2992255", "border-radius": "4px", padding: "0 5px" }}>PREVIEW</span>
          </Show>
        </div>
        <p style={{
          margin: "4px 0 6px", "font-size": "12.5px", color: "#8b949e", "line-height": "1.45",
          display: "-webkit-box", "-webkit-line-clamp": "2", "-webkit-box-orient": "vertical", overflow: "hidden",
        }}>{props.ext.description}</p>
        <div style={{ display: "flex", "align-items": "center", gap: "12px", "font-size": "12px", color: "#8b949e", "flex-wrap": "wrap" }}>
          <span style={{ display: "inline-flex", "align-items": "center", gap: "4px", color: "#58a6ff" }}>
            {props.ext.publisher.displayName}
            <Show when={props.ext.publisher.verified}>
              <VerifiedBadge />
            </Show>
          </span>
          <span style={{ display: "inline-flex", "align-items": "center", gap: "4px" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
            {fmt(props.ext.installs)}
          </span>
          <Show when={props.ext.ratingCount > 0}>
            <span style={{ display: "inline-flex", "align-items": "center", gap: "4px" }}>
              <Stars value={props.ext.rating} />({props.ext.ratingCount})
            </span>
          </Show>
        </div>
      </div>
    </div>
  )
}

/* ────────────────── Stars ────────────────── */
const Stars: Component<{ value: number; size?: number }> = (props) => {
  const size = () => props.size ?? 12
  return (
    <span style={{ display: "inline-flex", gap: "1px" }}>
      <For each={[1, 2, 3, 4, 5]}>
        {(i) => (
          <svg width={size()} height={size()} viewBox="0 0 24 24"
            fill={i <= Math.round(props.value) ? "#e3b341" : "#30363d"}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )}
      </For>
    </span>
  )
}

/* ────────────────── Verified Badge ────────────────── */
const VerifiedBadge: Component = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="#58a6ff" aria-label="Verified publisher">
    <path d="M12 1l2.6 2.1 3.3-.3.9 3.2 2.9 1.7-1.4 3 1.4 3-2.9 1.7-.9 3.2-3.3.3L12 23l-2.6-2.1-3.3.3-.9-3.2L2.3 16l1.4-3-1.4-3 2.9-1.7.9-3.2 3.3.3z" />
    <path d="M10.6 15.4l-2.8-2.8 1.2-1.2 1.6 1.6 4-4 1.2 1.2z" fill="#0d1117" />
  </svg>
)

/* ────────────────── Detail View ────────────────── */
const Detail: Component<{ id: string; onBack: () => void }> = (props) => {
  const [ext, setExt] = createSignal<VSExtension | null>(null)
  const [readme, setReadme] = createSignal<string | null>(null)
  const [tab, setTab] = createSignal<"details" | "changelog" | "resources">("details")
  const [changelog, setChangelog] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(true)
  const [copied, setCopied] = createSignal(false)
  const [installing, setInstalling] = createSignal(false)
  const [installed, setInstalled] = createSignal(false)
  const [installError, setInstallError] = createSignal<string | null>(null)

  const STORAGE_KEY = "zyraxon_installed_extensions"

  function getInstalledIds(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  function saveInstalledIds(ids: string[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  }

  function checkInstalled(id: string) {
    setInstalled(getInstalledIds().includes(id))
  }

  createEffect(() => {
    const id = props.id
    checkInstalled(id)
  })

  const handleInstall = async () => {
    if (!ext() || installing() || installed()) return
    setInstalling(true)
    setInstallError(null)
    try {
      const vsixUrl = ext()!.vsix
      if (!vsixUrl) {
        setInstallError("No VSIX download available for this extension")
        return
      }

      // Install via ZYRAXON Extension Manager (no VS Code dependency)
      const api = (window as any).api
      if (api?.installVsix) {
        const result = await api.installVsix(vsixUrl, ext()!.id, {
          displayName: ext()!.displayName,
          version: ext()!.version,
          publisher: ext()!.publisher.displayName,
          description: ext()!.description,
          icon: ext()!.icon ?? undefined,
        })
        if (result.ok) {
          incrementDownload(ext()!.id).catch(() => {})
          const ids = getInstalledIds()
          if (!ids.includes(ext()!.id)) {
            ids.push(ext()!.id)
            saveInstalledIds(ids)
          }
          setInstalled(true)
          window.dispatchEvent(
            new CustomEvent("zyraxon:ai-system-message", {
              detail: {
                message: `Extension "${ext()!.displayName}" (${ext()!.id}) v${ext()!.version} has been installed in ZYRAXON. Publisher: ${ext()!.publisher.displayName}. The extension is now available for use.`,
                type: "extension-installed",
                extensionId: ext()!.id,
                extensionName: ext()!.displayName,
              },
            })
          )
        } else {
          setInstallError(result.error || "Installation failed — check that ZYRAXON is running in the desktop app")
        }
      } else {
        setInstallError("Extension manager not available. Please restart ZYRAXON and try again.")
      }
    } catch (err: any) {
      setInstallError(err.message || "Installation failed")
    } finally { setInstalling(false) }
  }

  createEffect(() => {
    const id = props.id
    setLoading(true)
    setExt(null)
    setReadme(null)
    setChangelog(null)
    setTab("details")
    let alive = true
    ;(async () => {
      try {
        const data = await fetchExtension(id)
        if (!alive) return
        setExt(data.item)
        setReadme(data.readme)
      } catch {}
      finally { if (alive) setLoading(false) }
    })()
    onCleanup(() => { alive = false })
  })

  const loadChangelog = async () => {
    setTab("changelog")
    if (changelog() !== null || !ext()?.changelog) return
    try {
      const r = await fetch(ext()!.changelog!)
      setChangelog(r.ok ? await r.text() : "")
    } catch { setChangelog("") }
  }

  const html = createMemo(() =>
    tab() === "changelog"
      ? renderMarkdown(changelog() ?? "", ext()?.repository ?? null)
      : renderMarkdown(readme() ?? "", ext()?.repository ?? null)
  )

  const copyInstall = () => {
    if (!ext()) return
    navigator.clipboard?.writeText(`Start-Process "zyraxon://install/extension/${ext()!.id}"`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <Show
      when={!loading()}
      fallback={<div style={{ padding: "60px", "text-align": "center", color: "#8b949e" }}>Loading extension...</div>}
    >
      <Show
        when={ext()}
        fallback={
          <div style={{ padding: "60px", "text-align": "center", color: "#8b949e" }}>
            Extension not found. <button onClick={props.onBack} style={linkBtn}>Go back</button>
          </div>
        }
      >
        <div style={{ display: "flex", "flex-direction": "column", gap: "20px" }}>
          <button onClick={props.onBack} style={{ ...linkBtn, "align-self": "flex-start" }}>&larr; Back to Marketplace</button>

          <div style={{
            display: "flex", gap: "20px", padding: "20px", "border-radius": "12px",
            background: ext()!.brandingColor ? `linear-gradient(135deg, ${ext()!.brandingColor}55, #161b22 70%)` : "#161b22",
            border: "1px solid #21262d", "flex-wrap": "wrap",
          }}>
            <img src={ext()!.icon ?? ""} alt="" width={112} height={112}
              style={{ width: "112px", height: "112px", "border-radius": "12px", "object-fit": "contain", background: "#0d1117" }} />
            <div style={{ flex: "1", "min-width": "260px" }}>
              <h1 style={{ "font-size": "24px", "font-weight": "700", color: "#e6edf3", margin: "0" }}>{ext()!.displayName}</h1>
              <div style={{ display: "flex", "align-items": "center", gap: "10px", margin: "6px 0 10px", "font-size": "13px", color: "#8b949e", "flex-wrap": "wrap" }}>
                <span style={{ display: "inline-flex", "align-items": "center", gap: "4px", color: "#58a6ff" }}>
                  {ext()!.publisher.displayName}
                  <Show when={ext()!.publisher.verified}><VerifiedBadge /></Show>
                </span>
                <span>|</span>
                <span>{fmt(ext()!.installs)} installs</span>
                <Show when={ext()!.ratingCount > 0}>
                  <span>|</span>
                  <span style={{ display: "inline-flex", "align-items": "center", gap: "4px" }}>
                    <Stars value={ext()!.rating} />({ext()!.ratingCount})
                  </span>
                </Show>
                <span>|</span><span>v{ext()!.version}</span>
              </div>
              <p style={{ margin: "0 0 14px", "font-size": "14px", color: "#b1bac4", "line-height": "1.5" }}>{ext()!.description}</p>
              <div style={{ display: "flex", gap: "8px", "flex-wrap": "wrap", "align-items": "center" }}>
                <Show
                  when={!installed()}
                  fallback={
                    <span style={{ ...primaryBtn, background: "#238636", cursor: "default", display: "inline-flex", "align-items": "center", gap: "6px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                      Installed
                    </span>
                  }
                >
                  <button onClick={handleInstall} disabled={installing()} style={{
                    ...primaryBtn,
                    background: installing() ? "#21262d" : "#1f6feb",
                    color: installing() ? "#8b949e" : "#fff",
                    cursor: installing() ? "wait" : "pointer",
                    border: "none",
                    "font-family": "inherit",
                    display: "inline-flex",
                    "align-items": "center",
                    gap: "6px",
                  }}>
                    {installing() ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    )}
                    {installing() ? "Installing..." : "Install"}
                  </button>
                </Show>
                <Show when={ext()!.vsix}>
                  <a href={ext()!.vsix!} style={ghostBtn} download="true">Download VSIX</a>
                </Show>
                <button onClick={copyInstall} style={ghostBtn}>{copied() ? "Copied!" : "Copy install command"}</button>
                <a href={`https://zyraxonai.lovable.app/ecosystem?item=${ext()!.id}`} target="_blank" rel="noopener noreferrer" style={ghostBtn}>Open in Marketplace</a>
                <Show when={ext()!.repository}>
                  <a href={ext()!.repository!} target="_blank" rel="noopener noreferrer" style={ghostBtn}>Repository</a>
                </Show>
                <ShareButton itemId={ext()!.id} itemName={ext()!.displayName} itemUrl={`https://zyraxonai.lovable.app/ecosystem?item=${encodeURIComponent(ext()!.id)}`} />
              </div>
              <Show when={installError()}>
                <div style={{ padding: "10px", border: "1px solid #f8514955", background: "#f8514915", "border-radius": "8px", color: "#f85149", "font-size": "13px", "margin-top": "8px" }}>
                  {installError()}
                </div>
              </Show>
            </div>
          </div>

          <div style={{ display: "grid", "grid-template-columns": "minmax(0,1fr) 280px", gap: "20px" }} class="vsx-detail-grid">
            <div>
              <div style={{ display: "flex", gap: "4px", "border-bottom": "1px solid #21262d", "margin-bottom": "16px" }}>
                <For each={[["details", "Details"], ["changelog", "Changelog"], ["resources", "Resources"]] as const}>
                  {([key, label]) => (
                    <button
                      onClick={() => (key === "changelog" ? loadChangelog() : setTab(key as any))}
                      style={{
                        padding: "8px 14px", background: "none", border: "none", cursor: "pointer",
                        "font-family": "inherit", "font-size": "13px", "font-weight": tab() === key ? "600" : "400",
                        color: tab() === key ? "#e6edf3" : "#8b949e",
                        "border-bottom": `2px solid ${tab() === key ? "#58a6ff" : "transparent"}`,
                      }}>{label}</button>
                  )}
                </For>
              </div>
              <Show when={tab() === "resources"}>
                <ul style={{ "list-style": "none", padding: "0", margin: "0", display: "flex", "flex-direction": "column", gap: "8px" }}>
                  <For each={[["Marketplace", `https://zyraxonai.lovable.app/ecosystem?item=${ext()!.id}`], ["Repository", ext()!.repository], ["Homepage", ext()!.homepage], ["License", ext()!.license], ["Download VSIX", ext()!.vsix]].filter(([, href]) => !!href) as [string, string][]}>
                    {([label, href]) => (
                      <li><a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "#58a6ff", "font-size": "13px" }}>{label}</a></li>
                    )}
                  </For>
                </ul>
              </Show>
              <Show when={tab() !== "resources"}>
                <div class="vsx-markdown" innerHTML={html() || '<p style="color:#8b949e">No content provided.</p>'} />
              </Show>
            </div>

            <aside style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
              <div style={panel}>
                <h4 style={panelTitle}>Categories</h4>
                <div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px" }}>
                  <For each={ext()!.categories}>
                    {(c) => <span style={chip}>{c}</span>}
                  </For>
                </div>
              </div>
              <Show when={ext()!.tags.length > 0}>
                <div style={panel}>
                  <h4 style={panelTitle}>Tags</h4>
                  <div style={{ display: "flex", "flex-wrap": "wrap", gap: "6px" }}>
                    <For each={ext()!.tags.slice(0, 24)}>
                      {(t) => <span style={chip}>{t}</span>}
                    </For>
                  </div>
                </div>
              </Show>
              <div style={panel}>
                <h4 style={panelTitle}>More Info</h4>
                <For each={[["Identifier", ext()!.id], ["Version", ext()!.version], ["Last updated", fmtDate(ext()!.lastUpdated)], ["Published", fmtDate(ext()!.publishedDate)], ["Installs", fmt(ext()!.installs)]] as [string, string][]}>
                  {([k, v]) => (
                    <div style={{ display: "flex", "justify-content": "space-between", gap: "10px", "font-size": "12px", padding: "5px 0", "border-top": "1px solid #21262d" }}>
                      <span style={{ color: "#8b949e" }}>{k}</span>
                      <span style={{ color: "#c9d1d9", "text-align": "right", "word-break": "break-all" }}>{v}</span>
                    </div>
                  )}
                </For>
              </div>
            </aside>
          </div>

          <div style={{ "border-top": "1px solid #21262d", "padding-top": "24px", "margin-top": "8px" }}>
            <div style={{ display: "grid", "grid-template-columns": "1fr 280px", gap: "24px" }}>
              <div>
                <h3 style={{ "font-size": "16px", "font-weight": "600", color: "#c9d1d9", margin: "0 0 16px" }}>Community</h3>
                <CommentSection itemId={ext()!.id} comments={[]} />
              </div>
              <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
                <div style={panel}>
                  <h4 style={panelTitle}>Rate this extension</h4>
                  <RatingStars itemId={ext()!.id} initialAverage={ext()!.rating} />
                </div>
                <div style={panel}>
                  <h4 style={panelTitle}>Like</h4>
                  <LikeButton itemId={`vscode-ext-${ext()!.id}`} initialLikeCount={0} />
                </div>
                <div style={panel}>
                  <h4 style={panelTitle}>Share</h4>
                  <ShareButton itemId={ext()!.id} itemName={ext()!.displayName} itemUrl={`https://zyraxonai.lovable.app/ecosystem?item=${encodeURIComponent(ext()!.id)}`} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  )
}

/* ────────────────── Main View ────────────────── */
export const VSCodeMarketplace: Component<{ deepLinkId?: string }> = (props) => {
  const [query, setQuery] = createSignal("")
  const [sort, setSort] = createSignal("installs")
  const [category, setCategory] = createSignal("All")
  const [page, setPage] = createSignal(1)
  const [items, setItems] = createSignal<VSExtension[]>([])
  const [total, setTotal] = createSignal(0)
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [selected, setSelected] = createSignal<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null
  const pageSize = 24

  let debounced = ""
  const updateDebounced = (q: string) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced = q.trim()
      setPage(1)
      fetchItems()
    }, 350)
  }

  const fetchItems = async (retries = 2) => {
    setLoading(true)
    setError(null)
    const q = debounced
    const s = sort()
    const c = category()
    const p = page()
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const sortBy = SORT_BY[q ? (s === "installs" ? "relevance" : s) : s] ?? 4
        const data = await searchExtensions(q, c === "All" ? "" : c, p, pageSize, sortBy)
        setItems(data.items)
        setTotal(data.total)
        break
      } catch {
        if (attempt === retries) {
          setError("Could not reach the Visual Studio Marketplace. Try again in a moment.")
          setItems([])
        } else {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        }
      } finally {
        setLoading(false)
      }
    }
  }

  createEffect(() => {
    // Subscribe to reactive deps
    const _q = query()
    const _s = sort()
    const _c = category()
    const _p = page()
    // Initial fetch
    fetchItems()
  })

  // Auto-select extension when deep link ID is provided
  createEffect(() => {
    const id = props.deepLinkId
    if (id) {
      setSelected(id)
    }
  })

  const pages = () => Math.max(1, Math.min(50, Math.ceil(total() / pageSize)))

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
      <MarketplaceStyles />

      <Show when={!selected()}>
        <div>
          <h2 style={{ "font-size": "20px", "font-weight": "700", color: "#e6edf3", margin: "0" }}>ZYRAXON Extensions</h2>
          <p style={{ margin: "4px 0 0", "font-size": "13px", color: "#8b949e" }}>
            Browse extensions from the Visual Studio Marketplace &mdash; {total().toLocaleString()} results.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", "flex-wrap": "wrap", "align-items": "center" }}>
          <input
            value={query()}
            onInput={(e) => { setQuery(e.currentTarget.value); updateDebounced(e.currentTarget.value) }}
            placeholder="Search extensions..."
            style={{
              flex: "1 1 260px", "min-width": "200px", padding: "9px 12px", background: "#0d1117",
              border: "1px solid #30363d", "border-radius": "8px", color: "#c9d1d9", "font-size": "14px",
              "font-family": "inherit", outline: "none",
            }}
          />
          <select value={sort()} onChange={(e) => { setSort(e.currentTarget.value); setPage(1); fetchItems() }} style={selectStyle}>
            <For each={SORTS}>
              {(s) => <option value={s.id}>Sort by: {s.label}</option>}
            </For>
          </select>
          <select value={category()} onChange={(e) => { setCategory(e.currentTarget.value); setPage(1); fetchItems() }} style={selectStyle}>
            <For each={CATEGORIES}>
              {(c) => <option value={c}>{c}</option>}
            </For>
          </select>
        </div>

        <Show when={error()}>
          <div style={{ padding: "14px", border: "1px solid #f8514955", background: "#f8514915", "border-radius": "8px", color: "#f85149", "font-size": "13px" }}>{error()}</div>
        </Show>

        <Show
          when={!loading()}
          fallback={
            <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
              <For each={Array.from({ length: 9 })}>
                {() => <div style={{ height: "108px", "border-radius": "10px", background: "#161b22", border: "1px solid #21262d", opacity: "0.6" }} />}
              </For>
            </div>
          }
        >
          <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
            <For each={items()}>
              {(ext) => <Row ext={ext} onOpen={() => setSelected(ext.id)} />}
            </For>
          </div>
          <Show when={items().length === 0 && !error()}>
            <div style={{ color: "#8b949e", padding: "40px", "text-align": "center" }}>No extensions found.</div>
          </Show>
        </Show>

        <Show when={pages() > 1}>
          <div style={{ display: "flex", gap: "8px", "justify-content": "center", "align-items": "center", padding: "8px 0" }}>
            <button disabled={page() <= 1} onClick={() => { setPage(page() - 1); fetchItems() }} style={{ ...ghostBtn, opacity: page() <= 1 ? "0.4" : "1" }}>Previous</button>
            <span style={{ "font-size": "13px", color: "#8b949e" }}>Page {page()} of {pages()}</span>
            <button disabled={page() >= pages()} onClick={() => { setPage(page() + 1); fetchItems() }} style={{ ...ghostBtn, opacity: page() >= pages() ? "0.4" : "1" }}>Next</button>
          </div>
        </Show>
      </Show>

      <Show when={selected()}>
        <Detail id={selected()!} onBack={() => setSelected(null)} />
      </Show>
    </div>
  )
}

/* ────────────────── Styles ────────────────── */
const MarketplaceStyles: Component = () => (
  <style>{`
    .vsx-markdown { color: #b1bac4; font-size: 14px; line-height: 1.65; overflow-wrap: anywhere; }
    .vsx-markdown h1, .vsx-markdown h2, .vsx-markdown h3, .vsx-markdown h4 { color: #e6edf3; margin: 22px 0 10px; line-height: 1.3; }
    .vsx-markdown h1 { font-size: 22px; border-bottom: 1px solid #21262d; padding-bottom: 8px; }
    .vsx-markdown h2 { font-size: 18px; border-bottom: 1px solid #21262d; padding-bottom: 6px; }
    .vsx-markdown h3 { font-size: 15px; }
    .vsx-markdown p { margin: 10px 0; }
    .vsx-markdown a { color: #58a6ff; text-decoration: none; }
    .vsx-markdown a:hover { text-decoration: underline; }
    .vsx-markdown img { max-width: 100%; border-radius: 6px; }
    .vsx-markdown code { background: #21262d; padding: 2px 5px; border-radius: 4px; font-size: 12.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .vsx-markdown pre { background: #0d1117; border: 1px solid #21262d; border-radius: 8px; padding: 12px; overflow-x: auto; }
    .vsx-markdown pre code { background: none; padding: 0; }
    .vsx-markdown ul { padding-left: 20px; margin: 10px 0; }
    .vsx-markdown li { margin: 4px 0; }
    .vsx-markdown hr { border: none; border-top: 1px solid #21262d; margin: 18px 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 860px) { .vsx-detail-grid { grid-template-columns: minmax(0,1fr) !important; } }
  `}</style>
)

const selectStyle = {
  padding: "9px 10px", background: "#0d1117", border: "1px solid #30363d",
  "border-radius": "8px", color: "#c9d1d9", "font-size": "13px", "font-family": "inherit", outline: "none", cursor: "pointer",
}
const primaryBtn = {
  padding: "8px 18px", background: "#1f6feb", border: "none", "border-radius": "8px", color: "#fff",
  "font-size": "13px", "font-weight": "600", cursor: "pointer", "text-decoration": "none", "font-family": "inherit", display: "inline-block",
}
const ghostBtn = {
  padding: "8px 14px", background: "#21262d", border: "1px solid #30363d", "border-radius": "8px",
  color: "#c9d1d9", "font-size": "13px", cursor: "pointer", "text-decoration": "none", "font-family": "inherit", display: "inline-block",
}
const linkBtn = {
  background: "none", border: "none", color: "#58a6ff", cursor: "pointer", "font-size": "13px", "font-family": "inherit", padding: "0",
}
const panel = { background: "#161b22", border: "1px solid #21262d", "border-radius": "12px", padding: "14px" }
const panelTitle = { "font-size": "12px", "font-weight": "600", color: "#8b949e", margin: "0 0 10px", "text-transform": "uppercase", "letter-spacing": "0.5px" }
const chip = { "font-size": "11px", color: "#8b949e", background: "#0d1117", border: "1px solid #21262d", "border-radius": "20px", padding: "3px 9px" }

export default VSCodeMarketplace
