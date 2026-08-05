/**
 * Download inside the app
 * -----------------------
 * The marketplace lives INSIDE the ZYRAXON AI desktop app, so "Install" /
 * "Download" buttons must download the item directly in-app — never pop
 * an external window or ask the user to open a separate app.
 */

/** Trigger a browser download in-app via a temporary anchor. */
export function downloadInApp(url?: string, name?: string): void {
  if (!url) return
  try {
    const a = document.createElement("a")
    a.href = url
    a.download = name || ""
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {
    // Last-resort fallback — open in a new tab
    window.open(url, "_blank")
  }
}

/**
 * Best-effort install for an ecosystem item:
 *  1. If there's a direct downloadUrl → download it in-app.
 *  2. Else if it has a githubRepo → open its releases page.
 *  3. Else if it has an installCommand → copy it.
 * Returns true if something was actually done.
 */
export function installItemInApp(opts: {
  downloadUrl?: string
  githubRepo?: string
  installCommand?: string
}): boolean {
  if (opts.downloadUrl) {
    downloadInApp(opts.downloadUrl)
    return true
  }
  if (opts.githubRepo) {
    try {
      window.open(`${opts.githubRepo}/releases/latest`, "_blank")
    } catch {
      /* ignore */
    }
    return true
  }
  if (opts.installCommand) {
    navigator.clipboard?.writeText(opts.installCommand).catch(() => {})
    return true
  }
  return false
}
