/**
 * Centralized configuration — single place for all constants
 * Token is NOT stored in source code. Read at runtime.
 */

export const GITHUB_API = "https://api.github.com"
export const MAIN_REPO = "onelpawarai/ZYRAXON-AI"
export const DATA_REPO = "onelpawarai/ZYRAXON-DATA"

export function getGithubToken(): string {
  try {
    // @ts-expect-error — injected by Electron main process at runtime
    return window?.__ZYRAXON_CONFIG__?.token || ""
  } catch {
    return ""
  }
}
