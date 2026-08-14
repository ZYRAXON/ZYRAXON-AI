// ZYRAXON Auto Screen Vision v4 — SINGLE FRAME ONLY
// 24/7 SILENT background daemon — keeps ONLY the latest frame
// Every 3 seconds: capture new → delete old → keep only latest
// Auto-injects into memory for ALL mode prompts

import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs"
import path from "path"
import os from "os"
import { Global } from "@zyraxon-ai/core/global"

const execAsync = promisify(exec)
const SCREENSHOT_DIR = path.join(Global.Path.data, "screen_vision")
const LATEST_JSON = path.join(SCREENSHOT_DIR, "latest.json")
const LATEST_IMAGE = path.join(SCREENSHOT_DIR, "latest.png")

export interface ScreenCapture {
  id: string
  timestamp: number
  filepath: string
  platform: string
  size: number
  width?: number
  height?: number
  method: string
  error?: string
  buffer?: Buffer
}

let daemonInterval: NodeJS.Timeout | null = null
let daemonRunning = false
let latestCapture: ScreenCapture | null = null
let latestBuffer: Buffer | null = null
const CAPTURE_INTERVAL_MS = 3000

function ensureDir() {
  try { fs.accessSync(SCREENSHOT_DIR) } catch { fs.mkdirSync(SCREENSHOT_DIR, { recursive: true }) }
}

async function captureScreen(): Promise<ScreenCapture> {
  ensureDir()
  const platform = process.platform
  const filepath = LATEST_IMAGE
  let method = "none"
  let w = 1920, h = 1080

  try {
    if (platform === "win32") {
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $totalW = 0; $totalH = 0
        foreach ($s in $screens) {
          if ($s.Bounds.Right -gt $totalW) { $totalW = $s.Bounds.Right }
          if ($s.Bounds.Bottom -gt $totalH) { $totalH = $s.Bounds.Bottom }
        }
        $bmp = New-Object System.Drawing.Bitmap($totalW, $totalH)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen(0, 0, 0, 0, [System.Drawing.Size]::new($totalW, $totalH))
        $bmp.Save('${filepath.replace(/\\/g, "\\\\")}')
        $g.Dispose(); $bmp.Dispose()
        Write-Output "$totalW|$totalH"
      `
      const tmp = path.join(os.tmpdir(), `zyx_cap_${Date.now()}.ps1`)
      fs.writeFileSync(tmp, psScript, "utf-8")
      const { stdout } = await execAsync(`powershell -ExecutionPolicy Bypass -NoProfile -File "${tmp}"`, { timeout: 15000 })
      fs.unlinkSync(tmp)
      const dims = stdout.trim().split("|").map(Number)
      if (dims.length === 2 && dims[0] > 0) { w = dims[0]; h = dims[1] }
      method = "powershell"
    } else if (platform === "darwin") {
      await execAsync(`screencapture -x -t jpg "${filepath}"`, { timeout: 10000 })
      method = "screencapture"
    } else {
      const cmds = [`gnome-screenshot -f "${filepath}"`, `scrot "${filepath}"`, `import -window root "${filepath}"`]
      for (const cmd of cmds) {
        try { await execAsync(cmd, { timeout: 10000 }); fs.accessSync(filepath); method = cmd.split(" ")[0]; break } catch { continue }
      }
      if (!method) throw new Error("No capture tool")
    }
    const stats = fs.statSync(filepath)
    return { id: `cap_${Date.now()}`, timestamp: Date.now(), filepath, platform, size: stats.size, width: w, height: h, method }
  } catch (e) {
    return { id: `cap_err_${Date.now()}`, timestamp: Date.now(), filepath: "", platform, size: 0, method: "none", error: e instanceof Error ? e.message : String(e) }
  }
}

function startAutoCapture(intervalMs: number = CAPTURE_INTERVAL_MS): void {
  if (daemonRunning) return
  daemonRunning = true
  ensureDir()
  const tick = async () => {
    const cap = await captureScreen()
    if (cap.filepath && cap.size > 1000) {
      try { latestBuffer = fs.readFileSync(cap.filepath) } catch {}
    }
    latestCapture = cap
    fs.writeFileSync(LATEST_JSON, JSON.stringify({ ...cap, buffer: undefined }))
  }
  tick()
  daemonInterval = setInterval(tick, intervalMs)
}

function stopAutoCapture(): void {
  if (daemonInterval) { clearInterval(daemonInterval); daemonInterval = null }
  daemonRunning = false
}

function getLatestCapture(): { capture: ScreenCapture | null; buffer: Buffer | null } {
  return { capture: latestCapture, buffer: latestBuffer }
}

function captureNowSync(): ScreenCapture | null {
  captureScreen().then(c => {
    if (c.filepath && c.size > 1000) {
      try { latestBuffer = fs.readFileSync(c.filepath) } catch {}
    }
    latestCapture = c
    fs.writeFileSync(LATEST_JSON, JSON.stringify({ ...c, buffer: undefined }))
  })
  return latestCapture
}

function describeScreen(): string {
  const cap = latestCapture
  if (!cap) return "Auto vision active — waiting for first capture (~3s)"
  if (cap.error) return `Auto vision: ${cap.error}`
  return `Latest screen: ${new Date(cap.timestamp).toLocaleTimeString()} | ${cap.platform} | ${(cap.size / 1024).toFixed(1)}KB | ${cap.width}x${cap.height}`
}

function isDaemonRunning(): boolean { return daemonRunning }

function getDaemonStatus(): { running: boolean; interval: number; latest: string | null; size: number } {
  return { running: daemonRunning, interval: CAPTURE_INTERVAL_MS, latest: latestCapture?.timestamp ? new Date(latestCapture.timestamp).toISOString() : null, size: latestCapture?.size || 0 }
}

// Auto-start on module load
startAutoCapture()

export const autoScreenVision = {
  captureNowSync,
  getLatestCapture,
  describeScreen,
  isDaemonRunning,
  getDaemonStatus,
  startAutoCapture,
  stopAutoCapture,
}
