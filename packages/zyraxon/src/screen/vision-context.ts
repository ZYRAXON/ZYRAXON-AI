// ZYRAXON Vision System — Vision Context Manager
// Singleton that holds latest frame IMAGE + analysis for automatic injection
// "AI sees screen as IMAGE — not text description"

import fs from "fs/promises"
import { VisionMode, type VisionModeConfig, type VisionState } from "./vision-mode"
import type { ProcessedFrame } from "./frame-processor"
import type { AnalysisResult } from "./vision-analyzer"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VisionContextData {
  isActive: boolean
  currentFrame: ProcessedFrame | null
  lastAnalysis: AnalysisResult | null
  frameCount: number
  keyFrameCount: number
  recentChanges: string[]
  screenSummary: string
  lastUpdate: number
}

export interface VisionImageFrame {
  imageBuffer: Buffer       // Raw JPEG image binary
  mimeType: string          // "image/jpeg"
  timestamp: number         // When captured
  width: number
  height: number
  analysis: string          // Text description of what's in the image
}

// ─── Vision Context Manager ──────────────────────────────────────────────────

class VisionContextManagerClass {
  private vision: VisionMode | null = null
  private data: VisionContextData = {
    isActive: false,
    currentFrame: null,
    lastAnalysis: null,
    frameCount: 0,
    keyFrameCount: 0,
    recentChanges: [],
    screenSummary: "No screen data available.",
    lastUpdate: 0,
  }
  private latestImage: VisionImageFrame | null = null
  private updateInterval: NodeJS.Timeout | null = null
  private recentChangesMax = 20

  // ── Start Vision Mode ──────────────────────────────────────────────────────

  async start(config?: Partial<VisionModeConfig>): Promise<void> {
    if (this.data.isActive) return

    this.vision = new VisionMode(config)
    await this.vision.start()
    this.data.isActive = true

    // Setup event forwarding — captures IMAGE binary
    this.setupEventForwarding()

    // Start periodic context updates
    this.startPeriodicUpdates()

    this.addChange("Vision Mode started — AI now sees your screen in real-time")
  }

  // ── Stop Vision Mode ───────────────────────────────────────────────────────

  stop(): void {
    if (!this.data.isActive) return

    if (this.vision) {
      this.vision.stop()
      this.vision = null
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    this.data.isActive = false
    this.data.currentFrame = null
    this.data.lastAnalysis = null
    this.latestImage = null
    this.data.screenSummary = "Vision Mode stopped."
  }

  // ── Get Latest IMAGE for AI Injection ──────────────────────────────────────
  // This returns the actual screenshot binary — AI sees it as an image

  getLatestImage(): VisionImageFrame | null {
    if (!this.data.isActive) return null
    return this.latestImage
  }

  // ── Get Context String (supplementary text) ────────────────────────────────

  getContextString(): string {
    if (!this.data.isActive) return ""

    const parts: string[] = []

    // Current screen state
    if (this.data.lastAnalysis) {
      const analysis = this.data.lastAnalysis
      parts.push(`CURRENT SCREEN: ${analysis.description}`)
      parts.push(`Activity: ${analysis.activity.current} (${analysis.activity.context})`)
      parts.push(`Confidence: ${(analysis.confidence * 100).toFixed(0)}%`)

      // Elements detected
      if (analysis.elements.length > 0) {
        const elementTypes = analysis.elements.map(e => `${e.type}: ${e.description}`)
        parts.push(`UI Elements: ${elementTypes.join(", ")}`)
      }

      // Actionable elements
      const actionable = analysis.elements.filter(e => e.actionable)
      if (actionable.length > 0) {
        parts.push(`Actionable: ${actionable.map(e => `${e.type} at ${e.location}`).join(", ")}`)
      }
    } else if (this.data.currentFrame) {
      const frame = this.data.currentFrame
      parts.push(`SCREEN CAPTURED: ${frame.width}x${frame.height}, ${frame.description}`)
      parts.push(`Change: ${frame.changeType} (${frame.changePercent.toFixed(1)}%)`)
      parts.push(`Complexity: ${frame.complexity}/100`)
    }

    // Recent changes
    if (this.data.recentChanges.length > 0) {
      const recent = this.data.recentChanges.slice(-5)
      parts.push(`Recent changes: ${recent.join(" > ")}`)
    }

    // Stats
    parts.push(`Frames captured: ${this.data.frameCount} (${this.data.keyFrameCount} key frames)`)

    if (parts.length === 0) return ""

    return `[ZYRAXON VISION — REAL-TIME SCREEN AWARENESS]\n${parts.join("\n")}\n[/ZYRAXON VISION]\n\n`
  }

  // ── Get Raw Data ───────────────────────────────────────────────────────────

  getData(): VisionContextData {
    return { ...this.data }
  }

  // ── Query Methods ──────────────────────────────────────────────────────────

  getWhatIsHappening(): string {
    if (!this.data.lastAnalysis) return "No screen data available yet."
    const a = this.data.lastAnalysis
    return `${a.description}\nActivity: ${a.activity.current}\nContext: ${a.activity.context}\nLikely next: ${a.activity.nextLikely}`
  }

  getScreenSummary(): string {
    return this.data.screenSummary
  }

  isRunning(): boolean {
    return this.data.isActive
  }

  // ── Private Methods ────────────────────────────────────────────────────────

  private setupEventForwarding(): void {
    if (!this.vision) return

    // Hook into capture engine — get RAW IMAGE binary
    const captureEngine = (this.vision as any).captureEngine
    if (captureEngine) {
      captureEngine.on("frame", async (frame: any) => {
        try {
          // Read the actual JPEG file into a Buffer
          const imageBuffer = await fs.readFile(frame.filepath)

          // Build analysis text for supplementary context
          const state = this.vision!.getState()
          const analysisText = state.lastAnalysis
            ? `${state.lastAnalysis.description} | ${state.lastAnalysis.activity.current}`
            : frame.description || "Screen captured"

          // Store the IMAGE frame — this is what AI will see
          this.latestImage = {
            imageBuffer,
            mimeType: "image/jpeg",
            timestamp: frame.timestamp,
            width: frame.width,
            height: frame.height,
            analysis: analysisText,
          }
        } catch {}
      })
    }

    // Forward analysis events
    const originalHandleKeyFrame = (this.vision as any).handleKeyFrame.bind(this.vision)
    ;(this.vision as any).handleKeyFrame = async (frame: any) => {
      await originalHandleKeyFrame(frame)

      // Update context data from vision state
      const state = this.vision!.getState()
      this.data.currentFrame = state.currentFrame
      this.data.lastAnalysis = state.lastAnalysis
      this.data.frameCount = state.frameCount
      this.data.keyFrameCount = state.keyFrameCount
      this.data.lastUpdate = Date.now()

      // Track changes
      if (state.lastAnalysis) {
        const desc = state.lastAnalysis.description
        if (desc && !this.data.recentChanges.includes(desc)) {
          this.addChange(desc)
        }
      }
    }

    // Forward frame events
    const originalHandleNewFrame = (this.vision as any).handleNewFrame.bind(this.vision)
    ;(this.vision as any).handleNewFrame = async (frame: any) => {
      await originalHandleNewFrame(frame)

      const state = this.vision!.getState()
      this.data.currentFrame = state.currentFrame
      this.data.frameCount = state.frameCount
      this.data.lastUpdate = Date.now()
    }
  }

  private startPeriodicUpdates(): void {
    this.updateInterval = setInterval(() => {
      if (!this.data.isActive || !this.vision) return

      const state = this.vision.getState()
      this.data.currentFrame = state.currentFrame
      this.data.lastAnalysis = state.lastAnalysis
      this.data.frameCount = state.frameCount
      this.data.keyFrameCount = state.keyFrameCount
      this.data.lastUpdate = Date.now()

      // Build screen summary
      if (state.lastAnalysis) {
        this.data.screenSummary = `${state.lastAnalysis.description} | ${state.lastAnalysis.activity.current}`
      }
    }, 2000) // Update every 2 seconds
  }

  private addChange(description: string): void {
    this.data.recentChanges.push(description)
    if (this.data.recentChanges.length > this.recentChangesMax) {
      this.data.recentChanges = this.data.recentChanges.slice(-this.recentChangesMax)
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────

export const VisionContext = new VisionContextManagerClass()
