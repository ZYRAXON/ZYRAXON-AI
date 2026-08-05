import { type Component, createSignal, createResource, For, Show, createEffect, onCleanup } from "solid-js"
import { GITHUB_API } from "../config"
import { getHeaders } from "../services/github"
import { downloadInApp } from "../services/download"
import { IconDownload, IconStar, IconExternalLink, IconCopy, IconCheck, IconGithub, IconX } from "./Icons"
import { CommentSection } from "./CommentSection"
import { RatingStars } from "./RatingStars"
import { LikeButton } from "./LikeButton"
import { ShareButton } from "./ShareButton"

/**
 * GitHub Releases browser — inside the ZYRAXON AI app.
 * ------------------------------------------------------
 * Surfaces releases from the ENTIRE GitHub world (any app, bot, tool,
 * extension — anything with a release). People can search by category
 * and every release is downloadable / clone-able directly inside the
 * app. Clicking a release opens a rich detail view with full release
 * notes, every asset, and one-click source-code download.
 */

interface GitHubAsset {
  name: string
  size: number
  downloadUrl: string
  downloadCount: number
}

interface GitHubReleaseItem {
  id: number
  repo: string
  repoFullName: string
  repoUrl: string
  repoDescription: string | null
  owner: string
  ownerAvatar: string | null
  stars: number
  language: string | null
  defaultBranch: string | null
  cloneUrl: string
  sourceZipUrl: string
  branchZipUrl: string
  tagName: string
  name: string
  htmlUrl: string
  publishedAt: string
  prerelease: boolean
  draft: boolean
  body: string | null
  assets: GitHubAsset[]
  downloadUrl: string | null
  websiteUrl: string
  zyraxonUrl: string
}

const SUGGESTIONS = ["ai", "chatgpt", "vs-code", "browser", "bot", "terminal", "database", "editor", "game", "python", "react", "docker", "machine-learning", "api", "cli", "web"]
const SEARCH_PAGE_SIZE = 100
const SEARCH_MAX_PAGES = 5
const DEFAULT_DEPTH = 30
const MAX_DEPTH = 100
const DEFAULT_PER_REPO = 10

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function timeAgo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86_400_000)
    if (days <= 0) return "today"
    if (days === 1) return "yesterday"
    if (days < 30) return `${days} days ago`
    const months = Math.floor(days / 30)
    if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`
    return `${Math.floor(months / 12)} year${Math.floor(months / 12) > 1 ? "s" : ""} ago`
  } catch {
    return ""
  }
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
  } catch {
    return iso
  }
}

function launchZyraxon(url: string): void {
  try {
    window.location.href = url
  } catch {
    /* no-op */
  }
}

function RenderBody(props: { body: string | null }) {
  const blocks = () => (props.body ?? "").split(/\r?\n{2,}/).filter(Boolean)
  return (
    <div class="text-[13px] leading-relaxed text-[#c9d1d9] whitespace-pre-wrap flex flex-col gap-2.5">
      <Show when={blocks().length === 0} fallback={<For each={blocks()}>{(b) => <p class="m-0">{b}</p>}</For>}>
        <p class="m-0 text-[#8b949e] italic">No release notes provided.</p>
      </Show>
    </div>
  )
}

interface ReleaseCardProps {
  r: GitHubReleaseItem
  onOpen: (r: GitHubReleaseItem) => void
}

const ReleaseCard: Component<ReleaseCardProps> = (props) => {
  const [copied, setCopied] = createSignal(false)
  const [copiedSrc, setCopiedSrc] = createSignal(false)

  const copyCommand = (e: MouseEvent) => {
    e.stopPropagation()
    const cmd = `Start-Process "zyraxon://install/release/${props.r.repoFullName}/${props.r.tagName}"`
    navigator.clipboard?.writeText(cmd).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const copyClone = (e: MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(`git clone ${props.r.cloneUrl}`).then(() => {
      setCopiedSrc(true)
      setTimeout(() => setCopiedSrc(false), 1500)
    }).catch(() => {})
  }

  return (
    <div
      class="flex flex-col gap-3 p-4 rounded-2xl border border-[#21262d] bg-gradient-to-br from-[#1c2128]/95 to-[#0d1117]/90 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/40 cursor-pointer"
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(137,87,229,0.6)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#21262d")}
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <Show when={props.r.ownerAvatar}>
              <img src={props.r.ownerAvatar ?? undefined} alt="" class="w-6 h-6 rounded-full border border-[#30363d]" />
            </Show>
            <span class="text-sm font-semibold text-[#f0f6fc] truncate">
              {props.r.owner ? `${props.r.owner}/` : ""}<span class="text-[#58a6ff]">{props.r.repo}</span>
            </span>
            <span
              class={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                props.r.prerelease
                  ? "bg-[#f0883e]/15 text-[#f0883e] border border-[#f0883e]/40"
                  : "bg-[#3fb950]/15 text-[#3fb950] border border-[#3fb950]/40"
              }`}
            >
              {props.r.prerelease ? "Pre-release" : "Release"}
            </span>
          </div>
          <div class="mt-1.5 text-[15px] font-bold text-[#e6edf3] leading-snug">
            {props.r.name}
            <span class="ml-2 text-xs font-medium text-[#8b949e] font-mono">{props.r.tagName}</span>
          </div>
        </div>
        <span class="text-[11px] text-[#8b949e] whitespace-nowrap opacity-75">Details →</span>
      </div>

      <div class="flex items-center gap-3 text-xs text-[#8b949e] flex-wrap">
        <span class="flex items-center gap-1">
          <IconStar size={12} class="text-[#e3b341]" />
          <span class="font-semibold text-[#c9d1d9]">{props.r.stars >= 1000 ? `${(props.r.stars / 1000).toFixed(1)}k` : props.r.stars}</span>
        </span>
        <Show when={props.r.language}>
          <span class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-[#8957e5]" />
            {props.r.language}
          </span>
        </Show>
        <span class="text-[#484f58]">·</span>
        <span title={fmtDate(props.r.publishedAt)}>{timeAgo(props.r.publishedAt)}</span>
      </div>

      <Show when={props.r.repoDescription}>
        <p class="m-0 text-xs text-[#8b949e] leading-relaxed line-clamp-2">{props.r.repoDescription}</p>
      </Show>

      <Show when={props.r.assets.length > 0}>
        <div class="flex items-center gap-2 flex-wrap text-[11px]">
          <span class="inline-flex items-center gap-1 text-[#3fb950]">
            <IconDownload size={12} /> {props.r.assets.length} asset{props.r.assets.length > 1 ? "s" : ""}
          </span>
          <Show when={props.r.assets[0]}>
            <span class="text-[#8b949e]">{props.r.assets[0].name} · {fmtSize(props.r.assets[0].size)}</span>
          </Show>
        </div>
      </Show>

      <div class="flex gap-2 flex-wrap mt-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); props.onOpen(props.r) }}
          class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-[#8957e5] to-[#6f42c1] shadow-lg shadow-[#8957e5]/30 hover:shadow-[#8957e5]/50 hover:-translate-y-px transition-all"
        >
          <IconDownload size={13} />
          View Details
        </button>
        <button
          type="button"
          onClick={copyClone}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-[#3fb950]/50 bg-[#3fb950]/10 text-[#3fb950] hover:bg-[#3fb950]/20 transition-colors"
        >
          <IconGithub size={13} />
          {copiedSrc() ? "Clone copied" : "Clone"}
        </button>
        <button
          type="button"
          onClick={copyCommand}
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-[#30363d] bg-[#161b22] text-[#c9d1d9] hover:border-[#30363d] hover:bg-[#21262d] transition-colors"
        >
          {copied() ? <IconCheck size={13} class="text-[#3fb950]" /> : <IconCopy size={13} class="text-[#8b949e]" />}
          {copied() ? "Copied" : "Copy cmd"}
        </button>
        <a
          href={props.r.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors ml-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <IconGithub size={13} />
          GitHub
        </a>
      </div>
    </div>
  )
}

/* ─────────────── Detail modal (like VS Code extension details) ─────────────── */

interface ReleaseDetailProps {
  r: GitHubReleaseItem | null
  onClose: () => void
}

const ReleaseDetailInner: Component<{ r: GitHubReleaseItem; onClose: () => void }> = (props) => {
  const [copied, setCopied] = createSignal(false)
  const [copiedSrc, setCopiedSrc] = createSignal(false)
  const [openInApp, setOpenInApp] = createSignal(false)

  const copyInstall = () => {
    if (!props.r) return
    navigator.clipboard?.writeText(`Start-Process "zyraxon://install/release/${props.r.repoFullName}/${props.r.tagName}"`).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }

  const copyClone = () => {
    if (!props.r) return
    navigator.clipboard?.writeText(`git clone ${props.r.cloneUrl}`).then(() => {
      setCopiedSrc(true)
      setTimeout(() => setCopiedSrc(false), 1500)
    }).catch(() => {})
  }

  return (
    <div
      class="fixed inset-0 z-50 bg-[#010409]/90 backdrop-blur-sm overflow-y-auto"
      onClick={props.onClose}
    >
        <div class="min-h-screen flex items-start justify-center p-4 sm:p-8">
          <div
            class="w-full max-w-3xl bg-gradient-to-b from-[#161b22] to-[#0d1117] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div class="px-6 py-5 border-b border-[#21262d] bg-[radial-gradient(circle_at_20%_0%,rgba(137,87,229,0.18),transparent_55%)]">
              <div class="flex justify-between items-start gap-4">
                <div class="min-w-0">
                  <div class="flex items-center gap-2.5 flex-wrap">
                    <Show when={props.r.ownerAvatar}>
                      <img src={props.r.ownerAvatar ?? undefined} alt="" class="w-8 h-8 rounded-full border border-[#30363d]" />
                    </Show>
                    <a href={props.r.repoUrl} target="_blank" rel="noopener noreferrer" class="text-[15px] font-bold text-[#f0f6fc] hover:text-[#58a6ff]">
                      {props.r.owner ? `${props.r.owner}/` : ""}<span class="text-[#58a6ff]">{props.r.repo}</span>
                    </a>
                    <span
                      class={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                        props.r.prerelease
                          ? "bg-[#f0883e]/15 text-[#f0883e] border border-[#f0883e]/40"
                          : "bg-[#3fb950]/15 text-[#3fb950] border border-[#3fb950]/40"
                      }`}
                    >
                      {props.r.prerelease ? "Pre-release" : "Release"}
                    </span>
                  </div>
                  <h2 class="mt-3 mb-1 text-2xl font-extrabold text-[#f0f6fc] leading-tight">{props.r.name}</h2>
                  <div class="flex items-center gap-2.5 flex-wrap text-xs text-[#8b949e]">
                    <span class="font-mono text-[#e3b341]">{props.r.tagName}</span>
                    <span>·</span>
                    <span title={fmtDate(props.r.publishedAt)}>Released {timeAgo(props.r.publishedAt)}</span>
                    <Show when={props.r.stars > 0}>
                      <span>·</span>
                      <span class="inline-flex items-center gap-1"><IconStar size={12} class="text-[#e3b341]" /> {props.r.stars.toLocaleString()}</span>
                    </Show>
                    <Show when={props.r.language}>
                      <span>·</span>
                      <span class="inline-flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-[#8957e5]" />{props.r.language}</span>
                    </Show>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={props.onClose}
                  class="p-2 rounded-lg bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] transition-colors shrink-0"
                >
                  <IconX size={18} />
                </button>
              </div>
              <Show when={props.r.repoDescription}>
                <p class="mt-3 text-[13.5px] text-[#8b949e] leading-relaxed m-0">{props.r.repoDescription}</p>
              </Show>
            </div>

            {/* Body */}
            <div class="px-6 py-5 flex flex-col gap-6">
              {/* Action buttons */}
              <div class="flex gap-2.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => { setOpenInApp(true); launchZyraxon(props.r.zyraxonUrl) }}
                  class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-bold text-white bg-gradient-to-r from-[#8957e5] to-[#6f42c1] shadow-lg shadow-[#8957e5]/40 hover:shadow-[#8957e5]/60 hover:-translate-y-px transition-all"
                >
                  <IconDownload size={15} />
                  {openInApp() ? "Opening ZYRAXON AI…" : "Open in ZYRAXON AI"}
                </button>
                <Show when={props.r.downloadUrl}>
                  <a
                    href={props.r.downloadUrl ?? ""}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13.5px] font-bold text-white bg-gradient-to-r from-[#238636] to-[#1f7a37] shadow-lg shadow-[#238636]/30 hover:-translate-y-px transition-all"
                  >
                    <IconDownload size={15} />
                    Download
                  </a>
                </Show>
                <button
                  type="button"
                  onClick={copyInstall}
                  class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs border border-[#30363d] bg-[#161b22] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
                >
                  {copied() ? <IconCheck size={13} class="text-[#3fb950]" /> : <IconCopy size={13} />}
                  {copied() ? "Copied" : "Copy cmd"}
                </button>
                <button
                  type="button"
                  onClick={copyClone}
                  class="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs border border-[#3fb950]/50 bg-[#3fb950]/10 text-[#3fb950] hover:bg-[#3fb950]/20 transition-colors"
                >
                  <IconGithub size={13} />
                  {copiedSrc() ? "Clone copied" : "Copy git clone"}
                </button>
              </div>

              {/* Source code download */}
              <div class="bg-[#0d1117] border border-[#21262d] rounded-xl p-4">
                <div class="flex items-center gap-2 mb-2.5">
                  <IconGithub size={16} class="text-[#58a6ff]" />
                  <span class="text-[13px] font-bold text-[#e6edf3]">Source code</span>
                  <span class="text-[11.5px] text-[#8b949e]">— download this release's source or the latest branch</span>
                </div>
                <div class="flex gap-2 flex-wrap">
                  <a
                    href={props.r.sourceZipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#388bfd]/15 border border-[#388bfd]/45 text-[#58a6ff] hover:bg-[#388bfd]/25 transition-colors"
                  >
                    <IconDownload size={12} /> Download release source (.zip)
                  </a>
                  <a
                    href={props.r.branchZipUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-[#161b22] border border-[#30363d] text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
                  >
                    <IconDownload size={12} /> Latest {props.r.defaultBranch || "main"} (.zip)
                  </a>
                  <code class="inline-flex items-center px-3 py-2 rounded-lg text-[11.5px] font-mono bg-[#0d1117] border border-[#30363d] text-[#8b949e] overflow-hidden text-ellipsis whitespace-nowrap">
                    git clone {props.r.cloneUrl}
                  </code>
                </div>
              </div>

              {/* Release notes */}
              <div>
                <h3 class="m-0 mb-2.5 text-[13px] font-bold text-[#e6edf3] uppercase tracking-wide">Release notes</h3>
                <RenderBody body={props.r.body} />
              </div>

              {/* Assets */}
              <Show
                when={props.r.assets.length > 0}
                fallback={<div class="text-xs text-[#484f58]">No binary assets in this release — use the source downloads above.</div>}
              >
                <div>
                  <h3 class="m-0 mb-2.5 text-[13px] font-bold text-[#e6edf3] uppercase tracking-wide">Downloads ({props.r.assets.length})</h3>
                  <div class="flex flex-col gap-1.5">
                    <For each={props.r.assets}>
                      {(a) => (
                        <a
                          href={a.downloadUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-[#0d1117]/80 border border-[#30363d] text-[#c9d1d9] text-[13px] hover:border-[#58a6ff] hover:bg-[#388bfd]/10 transition-all group"
                        >
                          <IconDownload size={15} class="text-[#58a6ff] shrink-0" />
                          <span class="flex-1 min-w-0 font-mono text-xs overflow-hidden text-ellipsis whitespace-nowrap">{a.name}</span>
                          <span class="text-[11.5px] text-[#8b949e] shrink-0">{fmtSize(a.size)}</span>
                          <Show when={a.downloadCount > 0}>
                            <span class="text-[11.5px] text-[#3fb950] shrink-0">{a.downloadCount.toLocaleString()}↓</span>
                          </Show>
                        </a>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* Footer */}
              <div class="flex gap-2.5 flex-wrap border-t border-[#21262d] pt-4 items-center">
                <a
                  href={props.r.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
                >
                  <IconGithub size={13} /> View on GitHub
                </a>
                <a
                  href={props.r.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-[#161b22] border border-[#30363d] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] transition-colors"
                >
                  <IconExternalLink size={13} /> Repository
                </a>
                <div class="ml-auto flex items-center gap-2">
                  <ShareButton itemId={`github-release-${props.r.id}`} itemName={props.r.name} itemUrl={`https://zyraxonai.lovable.app/ecosystem?item=${encodeURIComponent(props.r.repo)}`} />
                  <LikeButton itemId={`github-release-${props.r.id}`} initialLikeCount={0} />
                </div>
              </div>

              {/* Rating */}
              <div class="border-t border-[#21262d] pt-4">
                <h3 class="m-0 mb-2.5 text-[13px] font-bold text-[#e6edf3] uppercase tracking-wide">Rating</h3>
                <RatingStars itemId={`github-release-${props.r.id}`} initialAverage={0} />
              </div>

              {/* Comments */}
              <div class="border-t border-[#21262d] pt-4">
                <h3 class="m-0 mb-2.5 text-[13px] font-bold text-[#e6edf3] uppercase tracking-wide">Comments</h3>
                <CommentSection itemId={`github-release-${props.r.id}`} comments={[]} />
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}

const ReleaseDetail: Component<ReleaseDetailProps> = (props) => (
  <Show when={props.r}>
    <ReleaseDetailInner r={props.r!} onClose={props.onClose} />
  </Show>
)

/* ─────────────── global search + releases ─────────────── */

interface SearchRepo {
  full_name: string
  name: string
  html_url: string
  description: string | null
  owner: { login: string; avatar_url: string | null }
  stargazers_count: number
  language: string | null
  default_branch: string
}

interface RawRelease {
  id: number
  tag_name: string
  name: string
  html_url: string
  published_at: string
  prerelease: boolean
  draft: boolean
  body: string | null
  assets: { name: string; size: number; browser_download_url: string; download_count: number }[]
}

async function searchRepos(q: string, maxPages = SEARCH_MAX_PAGES): Promise<SearchRepo[]> {
  const all: SearchRepo[] = []
  for (let page = 1; page <= maxPages; page++) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const res = await fetch(`${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${SEARCH_PAGE_SIZE}&page=${page}`, {
          headers: getHeaders(true),
        })
        if (res.status === 403 || res.status === 429) {
          await new Promise(r => setTimeout(r, 2000 * (retry + 1)))
          continue
        }
        if (!res.ok) break
        const data = await res.json()
        const items = (data.items ?? []) as SearchRepo[]
        if (!items.length) break
        all.push(...items)
        if (items.length < SEARCH_PAGE_SIZE) break
        break
      } catch {
        await new Promise(r => setTimeout(r, 1000 * (retry + 1)))
      }
    }
  }
  return all
}

/** Fetch a repo's release history — paginating through ALL pages, capped at perRepo. */
async function getRepoReleases(fullName: string, perRepo = DEFAULT_PER_REPO): Promise<RawRelease[]> {
  const out: RawRelease[] = []
  let page = 1
  const PAGE = 100
  while (out.length < perRepo) {
    try {
      const res = await fetch(`${GITHUB_API}/repos/${fullName}/releases?per_page=${PAGE}&page=${page}`, { headers: getHeaders(true) })
      if (!res.ok) break
      const batch = (await res.json()) as RawRelease[]
      if (!batch.length) break
      out.push(...batch)
      if (batch.length < PAGE) break
      page += 1
      if (page > 20) break
    } catch {
      break
    }
  }
  return out.slice(0, perRepo)
}

function normalize(repo: SearchRepo, r: RawRelease): GitHubReleaseItem {
  const firstAsset = r.assets[0] ?? null
  const branch = repo.default_branch || "main"
  return {
    id: r.id,
    repo: repo.name,
    repoFullName: repo.full_name,
    repoUrl: repo.html_url,
    repoDescription: repo.description,
    owner: repo.owner?.login ?? "",
    ownerAvatar: repo.owner?.avatar_url ?? null,
    stars: repo.stargazers_count ?? 0,
    language: repo.language ?? null,
    defaultBranch: branch,
    cloneUrl: `https://github.com/${repo.full_name}.git`,
    sourceZipUrl: `https://github.com/${repo.full_name}/archive/refs/tags/${encodeURIComponent(r.tag_name)}.zip`,
    branchZipUrl: `https://github.com/${repo.full_name}/archive/refs/heads/${encodeURIComponent(branch)}.zip`,
    tagName: r.tag_name,
    name: r.name || r.tag_name,
    htmlUrl: r.html_url,
    publishedAt: r.published_at,
    prerelease: r.prerelease,
    draft: r.draft,
    body: r.body,
    assets: r.assets.map((a) => ({
      name: a.name,
      size: a.size,
      downloadUrl: a.browser_download_url,
      downloadCount: a.download_count,
    })),
    downloadUrl: firstAsset?.browser_download_url ?? null,
    websiteUrl: `https://zyraxonai.lovable.app/ecosystem?item=${encodeURIComponent(repo.name)}`,
    zyraxonUrl: `zyraxon://install/release/${encodeURIComponent(repo.full_name)}/${encodeURIComponent(r.tag_name)}`,
  }
}

async function releasesForRepos(repos: SearchRepo[], depth: number, perRepo: number): Promise<GitHubReleaseItem[]> {
  const out: GitHubReleaseItem[] = []
  const batchSize = 5
  for (let i = 0; i < repos.length && i < depth; i += batchSize) {
    const batch = repos.slice(i, i + batchSize)
    const results = await Promise.all(
      batch.map(async (repo) => ({ repo, rs: await getRepoReleases(repo.full_name, perRepo) })),
    )
    for (const { repo, rs } of results) {
      for (const r of rs) out.push(normalize(repo, r))
    }
  }
  out.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
  return out
}

export const GitHubReleases: Component = () => {
  const [query, setQuery] = createSignal("")
  const [debounced, setDebounced] = createSignal("")
  const [releases, setReleases] = createSignal<GitHubReleaseItem[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal<string | null>(null)
  const [searchedFor, setSearchedFor] = createSignal("")
  const [depth, setDepth] = createSignal(DEFAULT_DEPTH)
  const [selected, setSelected] = createSignal<GitHubReleaseItem | null>(null)
  const [hasMore, setHasMore] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  createEffect(() => {
    const q = query()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      setDebounced(q.trim())
    }, 350)
  })

  onCleanup(() => {
    if (timer) clearTimeout(timer)
  })

  createResource(
    () => ({ q: debounced(), d: depth() }),
    async ({ q, d }) => {
      setLoading(true)
      setError(null)
      try {
        const repoQuery = q || "stars:>500 topic:ai"
        let repos = await searchRepos(repoQuery)
        if (repos.length === 0 && !q) {
          repos = await searchRepos("stars:>200")
        }
        if (repos.length === 0 && !q) {
          repos = await searchRepos("topic:cli language:python")
        }
        if (repos.length === 0) {
          setReleases([])
          setSearchedFor(q)
          setHasMore(false)
          return
        }
        const flat = await releasesForRepos(repos, d, DEFAULT_PER_REPO)
        setReleases(flat)
        setSearchedFor(q)
        setHasMore(d < MAX_DEPTH && repos.length > d)
      } catch (e: any) {
        setError(e?.message || "Could not load GitHub releases. Try searching manually.")
      } finally {
        setLoading(false)
      }
    },
  )

  const loadMore = () => {
    setDepth(Math.min(MAX_DEPTH, depth() + 10))
  }

  return (
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-3 flex-wrap">
        <div class="relative flex-1 min-w-[220px]">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M10.68 11.74a6 6 0 1 1 .357-.357l3.786 3.786a.75.75 0 1 1-1.06 1.06l-3.083-3.083zM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0z"/></svg>
          </span>
          <input
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="Search releases across ALL of GitHub — try a category…"
            class="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#161b22] border border-[#30363d] text-sm text-[#c9d1d9] placeholder:text-[#484f58] outline-none focus:border-[#8957e5] focus:ring-2 focus:ring-[#8957e5]/20 transition-all"
          />
        </div>
        <Show when={searchedFor()}>
          <span class="text-xs text-[#8b949e]">{releases().length} releases found</span>
        </Show>
      </div>

      <div class="flex gap-2 flex-wrap">
        <For each={SUGGESTIONS}>
          {(s) => (
            <button
              type="button"
              onClick={() => setQuery(s)}
              class={`px-3 py-1 rounded-full text-xs border transition-colors ${
                query() === s
                  ? "bg-[#8957e5]/20 text-[#bc8cff] border-[#8957e5]/50"
                  : "bg-[#161b22] text-[#8b949e] border-[#30363d] hover:border-[#8957e5]/40 hover:text-[#c9d1d9]"
              }`}
            >
              {s}
            </button>
          )}
        </For>
      </div>

      <Show when={error()}>
        <div class="px-4 py-3 rounded-xl border border-[#f85149]/50 bg-[#f85149]/10 text-sm text-[#f85149]">{error()}</div>
      </Show>

      <Show when={loading()} fallback={
        <Show
          when={releases().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-20 text-center">
              <div class="w-16 h-16 rounded-2xl bg-[#161b22] border border-[#21262d] flex items-center justify-center mb-4">
                <IconDownload size={26} class="text-[#484f58]" />
              </div>
              <p class="text-lg text-[#c9d1d9] mb-2">No releases found</p>
              <p class="text-sm text-[#8b949e] max-w-md">Try searching for a different app, bot, or tool.</p>
            </div>
          }
        >
          <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <For each={releases()}>{(r) => <ReleaseCard r={r} onOpen={setSelected} />}</For>
          </div>
          <Show when={hasMore() && !loading()}>
            <div class="flex justify-center pt-1">
              <button
                type="button"
                onClick={loadMore}
                class="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-[#161b22] border border-[#30363d] text-[#c9d1d9] hover:border-[#8957e5] hover:bg-[#8957e5]/10 transition-colors"
              >
                Load more releases ({Math.min(depth() + 10, MAX_DEPTH)}/{MAX_DEPTH} repos depth)
              </button>
            </div>
          </Show>
        </Show>
      }>
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <For each={Array.from({ length: 6 })}>
            {(_, i) => (
              <div class="h-48 rounded-2xl bg-[#161b22] border border-[#21262d] opacity-60 animate-pulse" style={{ "animation-delay": `${(i() || 0) * 0.12}s` }} />
            )}
          </For>
        </div>
      </Show>

      <ReleaseDetail r={selected()} onClose={() => setSelected(null)} />
    </div>
  )
}

export default GitHubReleases
