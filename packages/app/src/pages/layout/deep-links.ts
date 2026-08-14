export const deepLinkEvent = "zyraxon:deep-link"

const parseUrl = (input: string) => {
  if (!input.startsWith("zyraxon://") && !input.startsWith("zyraxon://")) return
  if (typeof URL.canParse === "function" && !URL.canParse(input)) return
  try {
    return new URL(input)
  } catch {
    return
  }
}

export const parseDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "open-project") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  return directory
}

export const parseNewSessionDeepLink = (input: string) => {
  const url = parseUrl(input)
  if (!url) return
  if (url.hostname !== "new-session") return
  const directory = url.searchParams.get("directory")
  if (!directory) return
  const prompt = url.searchParams.get("prompt") || undefined
  if (!prompt) return { directory }
  return { directory, prompt }
}

export interface InstallReleaseDeepLink {
  type: "release"
  repo: string
  tag: string
}

export type InstallDeepLink = InstallReleaseDeepLink

/**
 * Parse zyraxon://install/release/{repo}/{tag} deep links
 * Format: zyraxon://install/release/owner/repo/v1.0.0
 */
export const parseInstallReleaseDeepLink = (input: string): InstallReleaseDeepLink | null => {
  if (!input.startsWith("zyraxon://install/release/")) return null
  const remainder = input.slice("zyraxon://install/release/".length)
  if (!remainder) return null
  // Format: owner/repo/tag or owner/repo/releases/tag/v1.0.0
  // We need to extract the repo (owner/name) and tag
  const parts = remainder.split("/")
  if (parts.length < 3) return null
  const repo = `${parts[0]}/${parts[1]}`
  const tag = parts.slice(2).join("/")
  if (!repo || !tag) return null
  return { type: "release", repo, tag }
}

export const collectInstallDeepLinks = (urls: string[]): InstallDeepLink[] =>
  urls
    .map((url) => parseInstallReleaseDeepLink(url))
    .filter((link): link is InstallDeepLink => !!link)

export const collectOpenProjectDeepLinks = (urls: string[]) =>
  urls.map(parseDeepLink).filter((directory): directory is string => !!directory)

export const collectNewSessionDeepLinks = (urls: string[]) =>
  urls.map(parseNewSessionDeepLink).filter((link): link is { directory: string; prompt?: string } => !!link)

type ZyraxonWindow = Window & {
  __ZYRAXON__?: {
    deepLinks?: string[]
  }
}

export const drainPendingDeepLinks = (target: ZyraxonWindow) => {
  const pending = target.__ZYRAXON__?.deepLinks ?? []
  if (pending.length === 0) return []
  if (target.__ZYRAXON__) target.__ZYRAXON__.deepLinks = []
  return pending
}
