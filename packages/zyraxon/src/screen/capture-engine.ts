// ZYRAXON Vision System — Capture Engine
// 24/7 continuous screen capture daemon
// Non-blocking, memory-efficient, auto-recovering

import { EventEmitter } from "events"
import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { Global } from "@zyraxon-ai/core/global"

const execAsync = promisify(exec)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CaptureConfig {
  fps: number               // Frames per second (0.5 - 5)
  quality: number           // JPEG quality (1-100)
  maxResolution: number     // Max width/height in pixels
  compressionEnabled: boolean
  autoCleanupHours: number  // Auto-delete frames older than N hours
}

export interface Frame {
  id: string
  timestamp: number
  sequence: number
  filepath: string
  thumbnailPath: string
  width: number
  height: number
  sizeBytes: number
  hash: string              // Perceptual hash for dedup
  changePercent: number     // % changed from previous frame
  isKeyFrame: boolean       // Significant change detected
  platform: string
  captureMethod: string
}

export type CaptureEvents = {
  "frame": (frame: Frame) => void
  "keyframe": (frame: Frame) => void
  "error": (error: Error) => void
  "start": () => void
  "stop": () => void
}

// ─── Default Config ──────────────────────────────────────────────────────────

export const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  fps: 1,
  quality: 75,
  maxResolution: 1920,
  compressionEnabled: true,
  autoCleanupHours: 24,
}

// ─── Directories ─────────────────────────────────────────────────────────────

const BASE_DIR = path.join(Global.Path.data, "vision")
const FRAMES_DIR = path.join(BASE_DIR, "frames")
const THUMBNAILS_DIR = path.join(BASE_DIR, "thumbnails")
const INDEX_FILE = path.join(BASE_DIR, "frame-index.json")

// ─── Capture Engine ──────────────────────────────────────────────────────────

export class CaptureEngine extends EventEmitter {
  private config: CaptureConfig
  private intervalId: NodeJS.Timeout | null = null
  private sequence = 0
  private lastFrameHash = ""
  private isRunning = false
  private frameCount = 0
  private errorCount = 0

  constructor(config: Partial<CaptureConfig> = {}) {
    super()
    this.config = { ...DEFAULT_CAPTURE_CONFIG, ...config }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.isRunning) return

    await this.ensureDirectories()
    this.isRunning = true
    this.emit("start")

    const intervalMs = Math.max(200, Math.floor(1000 / this.config.fps))

    this.intervalId = setInterval(async () => {
      try {
        const frame = await this.captureFrame()
        if (frame) {
          this.frameCount++
          this.emit("frame", frame)
          if (frame.isKeyFrame) {
            this.emit("keyframe", frame)
          }
        }
      } catch (err) {
        this.errorCount++
        this.emit("error", err instanceof Error ? err : new Error(String(err)))
        // Auto-recover: don't stop on single errors
      }
    }, intervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    this.emit("stop")
  }

  // ── Single Frame Capture ───────────────────────────────────────────────────

  async captureFrame(): Promise<Frame | null> {
    const timestamp = Date.now()
    const filename = `frame_${timestamp}_${++this.sequence}.jpg`
    const filepath = path.join(FRAMES_DIR, filename)
    const thumbnailFilename = `thumb_${timestamp}_${this.sequence}.jpg`
    const thumbnailPath = path.join(THUMBNAILS_DIR, thumbnailFilename)

    let captureResult: { filepath: string; method: string; width: number; height: number }

    if (process.platform === "win32") {
      captureResult = await this.captureWindows(filepath)
    } else if (process.platform === "darwin") {
      captureResult = await this.captureMacOS(filepath)
    } else {
      captureResult = await this.captureLinux(filepath)
    }

    // Get file stats
    const stats = await fs.stat(filepath)
    const sizeBytes = stats.size

    // Generate perceptual hash for dedup
    const hash = await this.generateHash(filepath)
    const changePercent = this.calculateChange(this.lastFrameHash, hash)
    const isKeyFrame = changePercent > 5 || this.frameCount === 0

    // Update last frame hash
    this.lastFrameHash = hash

    // Generate thumbnail if compression enabled
    if (this.config.compressionEnabled) {
      await this.generateThumbnail(filepath, thumbnailPath)
    }

    const frame: Frame = {
      id: `frame_${timestamp}_${this.sequence}`,
      timestamp,
      sequence: this.sequence,
      filepath,
      thumbnailPath,
      width: captureResult.width,
      height: captureResult.height,
      sizeBytes,
      hash,
      changePercent,
      isKeyFrame,
      platform: process.platform,
      captureMethod: captureResult.method,
    }

    // Update frame index
    await this.updateFrameIndex(frame)

    return frame
  }

  // ── Platform Capture Methods ───────────────────────────────────────────────

  private async captureWindows(filepath: string): Promise<{
    filepath: string
    method: string
    width: number
    height: number
  }> {
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      Add-Type -AssemblyName System.Drawing
      try {
        $screens = [System.Windows.Forms.Screen]::AllScreens
        $totalWidth = 0
        $totalHeight = 0
        foreach ($screen in $screens) {
          if ($screen.Bounds.Right -gt $totalWidth) { $totalWidth = $screen.Bounds.Right }
          if ($screen.Bounds.Bottom -gt $totalHeight) { $totalHeight = $screen.Bounds.Bottom }
        }
        $bitmap = New-Object System.Drawing.Bitmap($totalWidth, $totalHeight)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.CopyFromScreen(0, 0, 0, [System.Drawing.Size]::new($totalWidth, $totalHeight))
        
        $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
        $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
        $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, ${this.config.quality})
        $bitmap.Save('${filepath.replace(/\\/g, "\\\\")}', $encoder, $encoderParams)
        
        $graphics.Dispose()
        $bitmap.Dispose()
        
        Write-Output "$totalWidth|$totalHeight"
      } catch {
        Write-Error $_.Exception.Message
        exit 1
      }
    `

    const tempScript = path.join(os.tmpdir(), `zyraxon_capture_${Date.now()}.ps1`)
    await fs.writeFile(tempScript, psScript, "utf-8")

    try {
      const { stdout } = await execAsync(
        `powershell -ExecutionPolicy Bypass -NoProfile -File "${tempScript}"`,
        { timeout: 15000, windowsHide: true }
      )
      const [width, height] = (stdout.trim() || "1920|1080").split("|").map(Number)
      return { filepath, method: "powershell-jpeg", width: width || 1920, height: height || 1080 }
    } finally {
      await fs.unlink(tempScript).catch(() => {})
    }
  }

  private async captureMacOS(filepath: string): Promise<{
    filepath: string
    method: string
    width: number
    height: number
  }> {
    await execAsync(`screencapture -x -C -t jpeg -q ${this.config.quality} "${filepath}"`, { timeout: 10000 })
    const { width, height } = await this.getImageDimensions(filepath)
    return { filepath, method: "screencapture", width, height }
  }

  private async captureLinux(filepath: string): Promise<{
    filepath: string
    method: string
    width: number
    height: number
  }> {
    const methods = [
      `gnome-screenshot -f "${filepath}"`,
      `scrot -q ${this.config.quality} "${filepath}"`,
      `import -window root "${filepath}"`,
      `maim "${filepath}"`,
    ]

    for (const cmd of methods) {
      try {
        await execAsync(cmd, { timeout: 10000 })
        try {
          await fs.access(filepath)
          const { width, height } = await this.getImageDimensions(filepath)
          return { filepath, method: cmd.split(" ")[0], width, height }
        } catch { continue }
      } catch { continue }
    }

    throw new Error("No screen capture tool available on Linux")
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  private async getImageDimensions(filepath: string): Promise<{ width: number; height: number }> {
    try {
      // Use PowerShell or file header to get dimensions
      if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Drawing
          $img = [System.Drawing.Image]::FromFile('${filepath.replace(/\\/g, "\\\\")}')
          Write-Output "$($img.Width)|$($img.Height)"
          $img.Dispose()
        `
        const tempScript = path.join(os.tmpdir(), `dims_${Date.now()}.ps1`)
        await fs.writeFile(tempScript, psScript, "utf-8")
        try {
          const { stdout } = await execAsync(`powershell -ExecutionPolicy Bypass -NoProfile -File "${tempScript}"`, { timeout: 5000 })
          const [width, height] = stdout.trim().split("|").map(Number)
          return { width: width || 1920, height: height || 1080 }
        } finally {
          await fs.unlink(tempScript).catch(() => {})
        }
      }
    } catch {}
    return { width: 1920, height: 1080 }
  }

  private async generateHash(filepath: string): Promise<string> {
    // Simple perceptual hash: sample pixels and create fingerprint
    try {
      const stats = await fs.stat(filepath)
      // Use file size + first/last bytes as simple hash
      const buffer = Buffer.alloc(32)
      const fh = await fs.open(filepath, "r")
      try {
        await fh.read(buffer, 0, 16, 0)
        await fh.read(buffer, 16, 16, Math.max(0, stats.size - 16))
      } finally {
        await fh.close()
      }
      return buffer.toString("hex")
    } catch {
      return Date.now().toString(36)
    }
  }

  private calculateChange(prevHash: string, currHash: string): number {
    if (!prevHash || prevHash.length !== currHash.length) return 100
    let diff = 0
    for (let i = 0; i < prevHash.length; i++) {
      if (prevHash[i] !== currHash[i]) diff++
    }
    return (diff / prevHash.length) * 100
  }

  private async generateThumbnail(source: string, target: string): Promise<void> {
    try {
      if (process.platform === "win32") {
        const psScript = `
          Add-Type -AssemblyName System.Drawing
          $img = [System.Drawing.Image]::FromFile('${source.replace(/\\/g, "\\\\")}')
          $thumb = $img.GetThumbnailImage(320, [int]($img.Height * 320 / $img.Width), $null, [IntPtr]::Zero)
          $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
          $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
          $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 50)
          $thumb.Save('${target.replace(/\\/g, "\\\\")}', $encoder, $encoderParams)
          $thumb.Dispose()
          $img.Dispose()
        `
        const tempScript = path.join(os.tmpdir(), `thumb_${Date.now()}.ps1`)
        await fs.writeFile(tempScript, psScript, "utf-8")
        try {
          await execAsync(`powershell -ExecutionPolicy Bypass -NoProfile -File "${tempScript}"`, { timeout: 10000 })
        } finally {
          await fs.unlink(tempScript).catch(() => {})
        }
      }
    } catch {}
  }

  // ── Frame Index ────────────────────────────────────────────────────────────

  private async ensureDirectories(): Promise<void> {
    for (const dir of [BASE_DIR, FRAMES_DIR, THUMBNAILS_DIR]) {
      try { await fs.access(dir) } catch { await fs.mkdir(dir, { recursive: true }) }
    }
  }

  private async updateFrameIndex(frame: Frame): Promise<void> {
    try {
      let index: Frame[] = []
      try {
        const data = await fs.readFile(INDEX_FILE, "utf-8")
        index = JSON.parse(data)
      } catch {}

      index.push(frame)

      // Keep last 500 frames in index
      if (index.length > 500) {
        const removed = index.splice(0, index.length - 500)
        // Clean up old files
        for (const f of removed) {
          await fs.unlink(f.filepath).catch(() => {})
          await fs.unlink(f.thumbnailPath).catch(() => {})
        }
      }

      await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2))
    } catch {}
  }

  // ── Public Getters ─────────────────────────────────────────────────────────

  getStatus() {
    return {
      isRunning: this.isRunning,
      frameCount: this.frameCount,
      errorCount: this.errorCount,
      fps: this.config.fps,
      sequence: this.sequence,
    }
  }

  getConfig(): CaptureConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<CaptureConfig>): void {
    this.config = { ...this.config, ...config }
    if (this.isRunning) {
      this.stop()
      this.start()
    }
  }
}
