// ZYRAXON Vision System — Vision Mode
// The "AI's Eyes" — continuous screen awareness with memory
// "আমি সবকিছু দেখতে পারি, সবকিছু মনে রাখি"

import { CaptureEngine, type Frame, type CaptureConfig } from "./capture-engine"
import { FrameProcessor, type ProcessedFrame } from "./frame-processor"
import { FrameMemory, type MemoryConfig } from "./frame-memory"
import { VisionAnalyzer, type AnalysisResult } from "./vision-analyzer"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VisionModeConfig {
  capture: Partial<CaptureConfig>
  memory: Partial<MemoryConfig>
  autoAnalyze: boolean        // Auto-analyze key frames
  lowLatency: boolean         // Optimize for speed
  persistentMemory: boolean   // Keep memory across sessions
}

export interface VisionState {
  isActive: boolean
  currentFrame: ProcessedFrame | null
  lastAnalysis: AnalysisResult | null
  frameCount: number
  keyFrameCount: number
  memoryUsageMB: number
  uptime: number
}

export interface VisionEvent {
  type: "frame" | "keyframe" | "analysis" | "error" | "start" | "stop"
  timestamp: number
  data: any
}

// ─── Vision Mode ─────────────────────────────────────────────────────────────

export class VisionMode {
  private captureEngine: CaptureEngine
  private processor: FrameProcessor
  private memory: FrameMemory
  private analyzer: VisionAnalyzer

  private config: VisionModeConfig
  private state: VisionState
  private events: VisionEvent[] = []
  private maxEvents = 1000
  private startTime = 0

  constructor(config: Partial<VisionModeConfig> = {}) {
    this.config = {
      capture: {},
      memory: {},
      autoAnalyze: true,
      lowLatency: true,
      persistentMemory: true,
      ...config,
    }

    // Initialize components
    this.captureEngine = new CaptureEngine(this.config.capture)
    this.processor = new FrameProcessor()
    this.memory = new FrameMemory(this.config.memory)
    this.analyzer = new VisionAnalyzer(this.memory)

    // Initialize state
    this.state = {
      isActive: false,
      currentFrame: null,
      lastAnalysis: null,
      frameCount: 0,
      keyFrameCount: 0,
      memoryUsageMB: 0,
      uptime: 0,
    }

    // Setup event handlers
    this.setupEventHandlers()
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.state.isActive) return

    this.startTime = Date.now()
    await this.memory.init()

    // Start capture engine
    this.captureEngine.start()
    this.state.isActive = true

    this.addEvent("start", { timestamp: this.startTime })
  }

  stop(): void {
    if (!this.state.isActive) return

    this.captureEngine.stop()
    this.state.isActive = false
    this.addEvent("stop", { timestamp: Date.now() })
  }

  // ── Event Handlers ─────────────────────────────────────────────────────────

  private setupEventHandlers(): void {
    // Handle new frames
    this.captureEngine.on("frame", async (frame: Frame) => {
      await this.handleNewFrame(frame)
    })

    // Handle key frames
    this.captureEngine.on("keyframe", async (frame: Frame) => {
      await this.handleKeyFrame(frame)
    })

    // Handle errors
    this.captureEngine.on("error", (error: Error) => {
      this.addEvent("error", { message: error.message })
    })
  }

  private async handleNewFrame(frame: Frame): Promise<void> {
    // Process the frame
    const previousFrame = this.state.currentFrame
    const processed = await this.processor.processFrame(frame, previousFrame)

    // Store in memory
    await this.memory.storeFrame(processed)

    // Update state
    this.state.currentFrame = processed
    this.state.frameCount++

    // Update memory usage
    const stats = await this.memory.getStats()
    this.state.memoryUsageMB = stats.diskUsageMB

    // Add event
    this.addEvent("frame", {
      frameId: processed.id,
      changeType: processed.changeType,
      isKeyFrame: processed.isKeyFrame,
    })
  }

  private async handleKeyFrame(frame: Frame): Promise<void> {
    this.state.keyFrameCount++

    // Auto-analyze if enabled
    if (this.config.autoAnalyze) {
      const processed = this.state.currentFrame
      if (processed) {
        const analysis = await this.analyzer.analyzeCurrentScreen(processed)
        this.state.lastAnalysis = analysis

        this.addEvent("analysis", {
          frameId: processed.id,
          analysis: analysis.description,
          confidence: analysis.confidence,
        })
      }
    }

    this.addEvent("keyframe", { frameId: frame.id })
  }

  // ── Query Methods ──────────────────────────────────────────────────────────

  // "আমাকে বলো এখন কী হচ্ছে"
  async whatIsHappening(): Promise<string> {
    const current = this.state.currentFrame
    if (!current) return "No screen data available."

    const analysis = await this.analyzer.analyzeCurrentScreen(current)
    return analysis.description
  }

  // "৫ মিনিট আগে কী ছিল?"
  async whatWasThere(minutesAgo: number): Promise<string> {
    const frames = this.memory.recallByTime(minutesAgo)
    if (frames.length === 0) return `No frames from ${minutesAgo} minutes ago.`

    return await this.analyzer.getSceneSummary(frames)
  }

  // "সবচেয়ে গুরুত্বপূর্ণ পরিবর্তনগুলো দাও"
  async getImportantChanges(): Promise<string> {
    const keyFrames = this.memory.recallKeyFrames(10)
    if (keyFrames.length === 0) return "No key frames recorded yet."

    return await this.analyzer.getSceneSummary(keyFrames)
  }

  // "এই স্ক্রিনে কী কী আছে?"
  async analyzeScreen(): Promise<AnalysisResult | null> {
    const current = this.state.currentFrame
    if (!current) return null

    return await this.analyzer.analyzeCurrentScreen(current)
  }

  // "আমাকে টাইমলাইন দাও"
  async getTimeline(): Promise<string> {
    const timeline = await this.memory.buildTimeline(this.processor)
    if (timeline.scenes.length === 0) return "No timeline data yet."

    const parts = [
      `Timeline: ${timeline.scenes.length} scenes over ${Math.round(timeline.duration / 1000)}s`,
      "",
      ...timeline.scenes.map(scene => {
        const duration = Math.round((scene.endTime - scene.startTime) / 1000)
        return `[${scene.dominantActivity}] ${duration}s (${scene.frameCount} frames) — ${scene.description}`
      })
    ]

    return parts.join("\n")
  }

  // "সব মেমোরি সারসংক্ষেপ দাও"
  async getMemorySummary(): Promise<string> {
    const stats = await this.memory.getStats()
    const summary = await this.memory.exportSummary()

    return [
      "Vision Memory Summary:",
      `- Total frames: ${stats.totalFrames}`,
      `- Key frames: ${stats.keyFrames}`,
      `- Disk usage: ${stats.diskUsageMB} MB`,
      `- Uptime: ${Math.round((Date.now() - this.startTime) / 1000)}s`,
      "",
      summary,
    ].join("\n")
  }

  // ── Status Methods ─────────────────────────────────────────────────────────

  getState(): VisionState {
    return { ...this.state }
  }

  getEvents(limit: number = 50): VisionEvent[] {
    return this.events.slice(-limit)
  }

  isRunning(): boolean {
    return this.state.isActive
  }

  // ── Configuration ──────────────────────────────────────────────────────────

  updateConfig(config: Partial<VisionModeConfig>): void {
    this.config = { ...this.config, ...config }

    if (config.capture) {
      this.captureEngine.updateConfig(config.capture)
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  async cleanup(): Promise<number> {
    return await this.memory.cleanup()
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private addEvent(type: VisionEvent["type"], data: any): void {
    this.events.push({
      type,
      timestamp: Date.now(),
      data,
    })

    // Enforce limit
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let visionInstance: VisionMode | null = null

export function getVisionMode(config?: Partial<VisionModeConfig>): VisionMode {
  if (!visionInstance) {
    visionInstance = new VisionMode(config)
  }
  return visionInstance
}

export async function startVisionMode(config?: Partial<VisionModeConfig>): Promise<VisionMode> {
  const vision = getVisionMode(config)
  await vision.start()
  return vision
}

export function stopVisionMode(): void {
  if (visionInstance) {
    visionInstance.stop()
  }
}
