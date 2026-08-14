import { app, WebContentsView, type BrowserWindow } from "electron"
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs"
import { basename, join } from "node:path"
import { tmpdir } from "node:os"
import { getLastFocusedWindow } from "./windows"

let view: WebContentsView | null = null
let active = false

export function editorExtensionsDir(): string {
  return join(app.getPath("userData"), "editor", "extensions")
}

function serverRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, "zyraxon-code-server")
  // Dev path: the desktop VS Code build output from packages/zyraxon-code
  return join(app.getAppPath(), "..", "zyraxon-code", "VSCode-win32-x64")
}

function findEditorHtml(): string | null {
  // Desktop VS Code renderer entry inside the packaged Electron app folder
  const html = join(serverRoot(), "resources", "app", "out", "vs", "code", "electron-browser", "workbench", "workbench.html")
  if (existsSync(html)) return html
  return null
}

function getView(): WebContentsView {
  if (!view) {
    view = new WebContentsView({
      webPreferences: {
        partition: "persist:zyraxon-editor",
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    })
  }
  return view
}

export async function setEditorMode(on: boolean, directory?: string): Promise<void> {
  active = on
  const win = getLastFocusedWindow()
  if (!win || win.isDestroyed()) return
  if (!on) {
    getView().setVisible(false)
    win.webContents.send("editor-mode-changed", false)
    return
  }
  const html = findEditorHtml()
  if (!html) {
    console.error("[editor] desktop VS Code build not found:", serverRoot())
    return
  }
  const v = getView()
  if (!win.contentView.children.includes(v)) win.contentView.addChildView(v)
  const target = `file://${html}`
  if (v.webContents.getURL() !== target) v.webContents.loadURL(target)
  v.setVisible(true)
  win.webContents.send("editor-mode-changed", true)
}

export function setEditorBounds(bounds: { x: number; y: number; width: number; height: number }): void {
  if (!view) return
  if (bounds.width <= 0 || bounds.height <= 0) return
  view.setBounds(bounds)
}

export function isEditorActive(): boolean {
  return active
}

export function installEditorExtension(sourceDir: string): { ok: boolean; error?: string } {
  try {
    const target = join(editorExtensionsDir(), basename(sourceDir))
    cpSync(sourceDir, target, { recursive: true })
    view?.webContents.reloadIgnoringCache()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export interface VsixMetadata {
  displayName?: string
  version?: string
  publisher?: string
  description?: string
  icon?: string
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`)
  const fs = await import("node:fs/promises")
  const writer = await fs.open(dest, "w")
  try {
    for await (const chunk of res.body as any as AsyncIterable<Uint8Array>) {
      await writer.write(chunk)
    }
  } finally {
    await writer.close()
  }
}

async function unzipVsix(vsixPath: string, targetDir: string): Promise<void> {
  // VSIX is a ZIP. Unzip it with @zip.js/zip.js (already a dependency) and
  // extract every entry; the editor scans `<extensions-dir>/<id>/extension/`.
  const { ZipReader, BlobReader, BlobWriter } = await import("@zip.js/zip.js")
  const fs = await import("node:fs/promises")
  const path = await import("node:path")

  const data = await fs.readFile(vsixPath)
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
  const reader = new ZipReader(new BlobReader(new Blob([buf])))
  const entries = await reader.getEntries()
  for (const entry of entries) {
    if (entry.directory) continue
    if (!entry.getData) continue
    const relative = entry.filename.replace(/^extension[\\/]/, "")
    if (!relative) continue
    const outPath = path.join(targetDir, relative)
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    const blob = await entry.getData(new BlobWriter("application/octet-stream"))
    await fs.writeFile(outPath, new Uint8Array(await blob.arrayBuffer()))
  }
  await reader.close()
}

export async function installVsix(vsixUrl: string, extensionId: string, meta?: VsixMetadata): Promise<{ ok: boolean; error?: string }> {
  try {
    const root = editorExtensionsDir()
    mkdirSync(root, { recursive: true })
    const extDir = join(root, extensionId)
    if (existsSync(extDir)) rmSync(extDir, { recursive: true })
    mkdirSync(extDir, { recursive: true })

    const tmpFile = join(tmpdir(), `${Date.now()}-${extensionId.replace(/[^a-zA-Z0-9_.-]/g, "_")}.vsix`)
    await downloadFile(vsixUrl, tmpFile)
    await unzipVsix(tmpFile, extDir)
    try { rmSync(tmpFile, { force: true }) } catch {}

    view?.webContents.reloadIgnoringCache()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
