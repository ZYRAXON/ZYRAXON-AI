/**
 * ZYRAXON Extension Manager
 * 
 * Manages VS Code extensions directly within ZYRAXON — no VS Code dependency.
 * Downloads VSIX packages, extracts them, stores locally, and tracks installed extensions.
 */

import { app, BrowserWindow } from "electron"
import { join } from "node:path"
import { mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs"
import { readFile, writeFile, unlink, stat, readdir, mkdir } from "node:fs/promises"
import { promisify } from "node:util"
import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"

const execFileAsync = promisify(execFile)

// ─── Paths ───────────────────────────────────────────────────────────────────

function getExtensionsDir(): string {
  const dir = join(app.getPath("userData"), "extensions")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getInstalledManifestPath(): string {
  return join(getExtensionsDir(), "installed.json")
}

function getExtensionDir(extensionId: string): string {
  // Sanitize extension ID for filesystem (e.g., "ms-python.python" → "ms-python.python")
  const safe = extensionId.replace(/[<>:"/\\|?*]/g, "_")
  return join(getExtensionsDir(), safe)
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InstalledExtension {
  id: string
  displayName: string
  version: string
  publisher: string
  description: string
  installedAt: string
  vsixPath: string       // Path to the downloaded VSIX file
  extensionPath: string  // Path to the extracted extension directory
  icon?: string
  size: number
  status: "active" | "inactive" | "error"
}

export interface InstallResult {
  success: boolean
  extensionId: string
  error?: string
  extension?: InstalledExtension
}

// ─── Manifest Management ─────────────────────────────────────────────────────

function loadManifest(): InstalledExtension[] {
  try {
    const path = getInstalledManifestPath()
    if (!existsSync(path)) return []
    const raw = JSON.parse(readFileSync(path, "utf-8"))
    const data = Array.isArray(raw) ? raw : (raw?.value ?? [])
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveManifest(extensions: InstalledExtension[]): void {
  const path = getInstalledManifestPath()
  writeFileSync(path, JSON.stringify(extensions, null, 2))
}

// ─── VSIX Extraction (using zip.js) ──────────────────────────────────────────

/**
 * Extract a VSIX file (which is a ZIP) to a directory.
 * Tries tar first (fast, built-in on Windows 10+), falls back to PowerShell.
 */
async function extractVsix(vsixPath: string, targetDir: string): Promise<void> {
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  // Try tar first (fast, no PowerShell overhead)
  try {
    await execFileAsync("tar", [
      "-xf", vsixPath,
      "-C", targetDir
    ], { timeout: 60000 })
  } catch {
    // Fallback: PowerShell Expand-Archive
    try {
      await execFileAsync("powershell", [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Path '${vsixPath}' -DestinationPath '${targetDir}' -Force`
      ], { timeout: 120000 })
    } catch (err: any) {
      throw new Error(`Failed to extract VSIX: ${err.message}`)
    }
  }

  // VSIX packages have an "extension" directory inside with the actual extension files
  const extensionSubdir = join(targetDir, "extension")
  if (existsSync(extensionSubdir)) {
    // Move contents from extension/ to the target dir root
    const items = readdirSync(extensionSubdir)
    for (const item of items) {
      const src = join(extensionSubdir, item)
      const dest = join(targetDir, item)
      try {
        // Use node:fs rename first (fast, same volume)
        const { renameSync } = await import("node:fs")
        renameSync(src, dest)
      } catch {
        try {
          // Fallback to PowerShell Move-Item for cross-device moves
          await execFileAsync("powershell", [
            "-NoProfile",
            "-Command",
            `Copy-Item -Path '${src}' -Destination '${dest}' -Recurse -Force; Remove-Item -Path '${src}' -Recurse -Force`
          ], { timeout: 30000 })
        } catch {
          // If all moves fail, leave it in extension/ subdirectory
        }
      }
    }
    // Clean up the empty extension/ directory
    try {
      rmSync(extensionSubdir, { recursive: true, force: true })
    } catch {}
  }
}

// ─── Package.json Parsing ────────────────────────────────────────────────────

interface ExtensionPackageJson {
  name?: string
  displayName?: string
  version?: string
  publisher?: string
  description?: string
  engines?: { vscode?: string }
  [key: string]: any
}

function parsePackageJson(extensionDir: string): ExtensionPackageJson | null {
  try {
    const pkgPath = join(extensionDir, "package.json")
    if (!existsSync(pkgPath)) return null
    const data = readFileSync(pkgPath, "utf-8")
    return JSON.parse(data)
  } catch {
    return null
  }
}

// ─── Notification ───────────────────────────────────────────────────────────

function notifyExtensionInstalled(extensionId: string): void {
  try {
    // Send to all open windows so the extension panel refreshes
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send("extension-installed", { extensionId })
      }
    }
  } catch {}
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Install an extension from a VSIX URL.
 * Downloads, extracts, and registers the extension.
 */
export async function installExtensionFromUrl(
  vsixUrl: string,
  extensionId: string,
  options?: {
    displayName?: string
    version?: string
    publisher?: string
    description?: string
    icon?: string
  }
): Promise<InstallResult> {
  try {
    // Check if already installed
    const manifest = loadManifest()
    const existing = manifest.find((e) => e.id === extensionId)
    if (existing) {
      return {
        success: true,
        extensionId,
        extension: existing,
      }
    }

    // Create extension directory
    const extensionDir = getExtensionDir(extensionId)
    if (existsSync(extensionDir)) {
      rmSync(extensionDir, { recursive: true, force: true })
    }
    mkdirSync(extensionDir, { recursive: true })

    // Download VSIX with timeout and proper headers
    const vsixPath = join(extensionDir, `${extensionId}.vsix`)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 120000) // 120s timeout
    let response: Response
    try {
      response = await fetch(vsixUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "ZYRAXON/1.0 (Electron)",
          "Accept": "application/octet-stream,*/*",
        },
        redirect: "follow",
      })
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    }
    const buffer = Buffer.from(await response.arrayBuffer())
    await writeFile(vsixPath, buffer)

    // Extract VSIX
    await extractVsix(vsixPath, extensionDir)

    // Parse package.json for metadata + icon
    const pkg = parsePackageJson(extensionDir)
    const finalId = pkg?.name || extensionId
    const finalDisplayName = pkg?.displayName || options?.displayName || finalId
    const finalVersion = pkg?.version || options?.version || "0.0.0"
    const finalPublisher = pkg?.publisher || options?.publisher || "unknown"
    const finalDescription = pkg?.description || options?.description || ""

    // Extract icon from package.json (icon field, contributes.icon, or icon URL)
    let finalIcon = options?.icon
    if (!finalIcon && pkg) {
      // Direct icon field (string path or URL)
      if (typeof pkg.icon === "string") {
        const iconValue = pkg.icon
        // If it's a URL, use directly
        if (iconValue.startsWith("http://") || iconValue.startsWith("https://") || iconValue.startsWith("data:")) {
          finalIcon = iconValue
        }
        // If it's a relative path, resolve to absolute path
        else {
          const iconPath = join(extensionDir, iconValue)
          if (existsSync(iconPath)) {
            try {
              const iconBuffer = readFileSync(iconPath)
              const ext = iconValue.split(".").pop()?.toLowerCase() || "png"
              const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"
              finalIcon = `data:${mime};base64,${iconBuffer.toString("base64")}`
            } catch {}
          }
        }
      }
      // VS Code contributes.icon pattern
      else if (pkg.contributes?.icon) {
        const iconValue = pkg.contributes.icon
        if (typeof iconValue === "string") {
          if (iconValue.startsWith("http://") || iconValue.startsWith("https://") || iconValue.startsWith("data:")) {
            finalIcon = iconValue
          } else {
            const iconPath = join(extensionDir, iconValue)
            if (existsSync(iconPath)) {
              try {
                const iconBuffer = readFileSync(iconPath)
                const ext = iconValue.split(".").pop()?.toLowerCase() || "png"
                const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"
                finalIcon = `data:${mime};base64,${iconBuffer.toString("base64")}`
              } catch {}
            }
          }
        }
      }
      // Check for common icon file names in extension directory
      else {
        const iconCandidates = [
          "icon.png", "icon.svg", "icon.jpg", "icon.jpeg", "icon.ico",
          "assets/icon.png", "assets/icon.svg", "images/icon.png",
          "resources/icon.png", "media/icon.png",
          `${finalId.split(".").pop()}.png`,
        ]
        for (const candidate of iconCandidates) {
          const iconPath = join(extensionDir, candidate)
          if (existsSync(iconPath)) {
            try {
              const iconBuffer = readFileSync(iconPath)
              const ext = candidate.split(".").pop()?.toLowerCase() || "png"
              const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"
              finalIcon = `data:${mime};base64,${iconBuffer.toString("base64")}`
            } catch {}
            break
          }
        }
      }
    }

    // If the package.json name differs from extensionId, rename directory
    if (pkg?.name && pkg.name !== extensionId) {
      const newDir = getExtensionDir(pkg.name)
      if (newDir !== extensionDir) {
        try {
          if (existsSync(newDir)) rmSync(newDir, { recursive: true, force: true })
          // Use PowerShell to rename/move
          await execFileAsync("powershell", [
            "-NoProfile",
            "-Command",
            `Move-Item -Path '${extensionDir}' -Destination '${newDir}' -Force`
          ], { timeout: 10000 })
          
          // Update manifest with correct ID
          const installed: InstalledExtension = {
            id: pkg.name,
            displayName: finalDisplayName,
            version: finalVersion,
            publisher: finalPublisher,
            description: finalDescription,
            installedAt: new Date().toISOString(),
            vsixPath,
            extensionPath: newDir,
            icon: finalIcon,
            size: buffer.length,
            status: "active",
          }
          
          manifest.push(installed)
          saveManifest(manifest)
          
          notifyExtensionInstalled(pkg.name)
          return { success: true, extensionId: pkg.name, extension: installed }
        } catch {
          // If rename fails, use original directory
        }
      }
    }

    // Register in manifest
    const installed: InstalledExtension = {
      id: extensionId,
      displayName: finalDisplayName,
      version: finalVersion,
      publisher: finalPublisher,
      description: finalDescription,
      installedAt: new Date().toISOString(),
      vsixPath,
      extensionPath: extensionDir,
      icon: finalIcon,
      size: buffer.length,
      status: "active",
    }

    manifest.push(installed)
    saveManifest(manifest)

    // Notify all windows to refresh extension lists
    notifyExtensionInstalled(extensionId)

    return { success: true, extensionId, extension: installed }
  } catch (error: any) {
    // Cleanup on failure
    try {
      const dir = getExtensionDir(extensionId)
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    } catch {}

    return {
      success: false,
      extensionId,
      error: error.message || "Failed to install extension",
    }
  }
}

/**
 * Get all installed extensions.
 */
export function getInstalledExtensions(): InstalledExtension[] {
  return loadManifest()
}

/**
 * Check if an extension is installed.
 */
export function isExtensionInstalled(extensionId: string): boolean {
  const manifest = loadManifest()
  return manifest.some((e) => e.id === extensionId)
}

/**
 * Uninstall an extension.
 */
export function uninstallExtension(extensionId: string): { success: boolean; error?: string } {
  try {
    const manifest = loadManifest()
    const index = manifest.findIndex((e) => e.id === extensionId)
    if (index === -1) {
      return { success: false, error: "Extension not found" }
    }

    const ext = manifest[index]
    
    // Remove extension directory
    if (existsSync(ext.extensionPath)) {
      rmSync(ext.extensionPath, { recursive: true, force: true })
    }

    // Remove from manifest
    manifest.splice(index, 1)
    saveManifest(manifest)

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Toggle extension active/inactive status.
 */
export function toggleExtensionStatus(extensionId: string): { success: boolean; status?: string; error?: string } {
  try {
    const manifest = loadManifest()
    const ext = manifest.find((e) => e.id === extensionId)
    if (!ext) {
      return { success: false, error: "Extension not found" }
    }

    ext.status = ext.status === "active" ? "inactive" : "active"
    saveManifest(manifest)

    return { success: true, status: ext.status }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Get extension count.
 */
export function getExtensionCount(): number {
  return loadManifest().length
}

/**
 * Get total size of all installed extensions.
 */
export function getTotalExtensionSize(): number {
  const manifest = loadManifest()
  return manifest.reduce((sum, ext) => sum + ext.size, 0)
}
