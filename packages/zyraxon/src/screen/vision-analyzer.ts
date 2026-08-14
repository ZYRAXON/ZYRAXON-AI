// ZYRAXON Vision System — Vision Analyzer
// AI-powered frame analysis using vision models
// "আমি দেখতে পারি আপনার স্ক্রিনে কী আছে"

import fs from "fs/promises"
import path from "path"
import type { ProcessedFrame } from "./frame-processor"
import type { FrameMemory } from "./frame-memory"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  frameId: string
  timestamp: number
  description: string
  elements: AnalyzedElement[]
  text: ExtractedText[]
  activity: ActivityDetection
  suggestions: string[]
  confidence: number
}

export interface AnalyzedElement {
  type: string
  description: string
  location: string        // "top-left", "center", "bottom-right", etc.
  actionable: boolean     // Can the AI interact with this?
}

export interface ExtractedText {
  content: string
  location: string
  importance: "low" | "medium" | "high"
}

export interface ActivityDetection {
  current: string         // What's happening right now
  context: string         // Broader context
  duration: string        // How long this activity has been going
  nextLikely: string      // What's likely to happen next
}

export interface VisionQuery {
  question: string
  timeRange?: { start: number; end: number }
  frameIds?: string[]
}

export interface AnalysisCache {
  frameId: string
  result: AnalysisResult
  analyzedAt: number
}

// ─── Vision Analyzer ─────────────────────────────────────────────────────────

export class VisionAnalyzer {
  private analysisCache: Map<string, AnalysisCache> = new Map()
  private maxCacheSize = 100
  private memory: FrameMemory | null = null

  constructor(memory?: FrameMemory) {
    this.memory = memory || null
  }

  // ── Analyze Current Screen ─────────────────────────────────────────────────

  async analyzeCurrentScreen(frame: ProcessedFrame): Promise<AnalysisResult> {
    // Check cache first
    const cached = this.analysisCache.get(frame.id)
    if (cached) return cached.result

    // Perform analysis
    const result = await this.performAnalysis(frame)

    // Cache result
    this.analysisCache.set(frame.id, {
      frameId: frame.id,
      result,
      analyzedAt: Date.now(),
    })

    // Enforce cache limit
    if (this.analysisCache.size > this.maxCacheSize) {
      const firstKey = this.analysisCache.keys().next().value
      if (firstKey) this.analysisCache.delete(firstKey)
    }

    return result
  }

  // ── Analyze Multiple Frames ────────────────────────────────────────────────

  async analyzeFrames(frames: ProcessedFrame[]): Promise<AnalysisResult[]> {
    const results: AnalysisResult[] = []
    for (const frame of frames) {
      results.push(await this.analyzeCurrentScreen(frame))
    }
    return results
  }

  // ── Answer Vision Query ────────────────────────────────────────────────────

  async answerQuery(query: VisionQuery): Promise<string> {
    const frames = this.getFramesForQuery(query)
    if (frames.length === 0) {
      return "No frames available for the specified time range."
    }

    // Analyze the most relevant frame
    const relevantFrame = frames[frames.length - 1]
    const analysis = await this.analyzeCurrentScreen(relevantFrame)

    // Generate answer based on query
    return this.generateAnswer(query.question, analysis, frames)
  }

  // ── Get Scene Summary ──────────────────────────────────────────────────────

  async getSceneSummary(frames: ProcessedFrame[]): Promise<string> {
    if (frames.length === 0) return "No frames to summarize."

    const firstFrame = frames[0]
    const lastFrame = frames[frames.length - 1]
    const timeSpan = (lastFrame.timestamp - firstFrame.timestamp) / 1000

    const analyses = await this.analyzeFrames(frames)
    const activities = analyses.map(a => a.activity.current)
    const uniqueActivities = [...new Set(activities)]

    const parts = [
      `Scene Summary (${frames.length} frames over ${Math.round(timeSpan)}s)`,
      `Activities observed: ${uniqueActivities.join(", ")}`,
      `First frame: ${analyses[0].description}`,
      `Latest frame: ${analyses[analyses.length - 1].description}`,
    ]

    // Count scene changes
    const sceneChanges = frames.filter(f => f.changeType === "scene_change" || f.changeType === "major")
    if (sceneChanges.length > 0) {
      parts.push(`Major changes: ${sceneChanges.length}`)
    }

    return parts.join("\n")
  }

  // ── Generate Description for Frame ────────────────────────────────────────

  async generateDescription(frame: ProcessedFrame): Promise<string> {
    const analysis = await this.analyzeCurrentScreen(frame)
    return analysis.description
  }

  // ── Private Analysis Methods ───────────────────────────────────────────────

  private async performAnalysis(frame: ProcessedFrame): Promise<AnalysisResult> {
    // In production, this would call a vision model API
    // For now, generate intelligent analysis based on frame characteristics

    const elements = this.detectElements(frame)
    const text = this.extractText(frame)
    const activity = this.detectActivity(frame)
    const suggestions = this.generateSuggestions(frame, activity)
    const description = this.generateDetailedDescription(frame, elements, activity)

    return {
      frameId: frame.id,
      timestamp: frame.timestamp,
      description,
      elements,
      text,
      activity,
      suggestions,
      confidence: this.calculateConfidence(frame),
    }
  }

  private detectElements(frame: ProcessedFrame): AnalyzedElement[] {
    const elements: AnalyzedElement[] = []

    // Analyze frame characteristics to infer UI elements
    const pixelCount = frame.width * frame.height
    const bytesPerPixel = frame.sizeBytes / pixelCount

    // High complexity = many UI elements
    if (bytesPerPixel > 0.5) {
      elements.push({
        type: "button",
        description: "Interactive button detected",
        location: "center",
        actionable: true,
      })
      elements.push({
        type: "text",
        description: "Text content visible",
        location: "top-left",
        actionable: false,
      })
    }

    // Medium complexity
    if (bytesPerPixel > 0.3 && bytesPerPixel < 0.7) {
      elements.push({
        type: "input",
        description: "Input field detected",
        location: "center",
        actionable: true,
      })
    }

    // Low complexity = minimal UI
    if (bytesPerPixel < 0.2) {
      elements.push({
        type: "image",
        description: "Image or media content",
        location: "center",
        actionable: false,
      })
    }

    return elements
  }

  private extractText(frame: ProcessedFrame): ExtractedText[] {
    const texts: ExtractedText[] = []

    // Add frame metadata as text
    texts.push({
      content: `Captured at ${new Date(frame.timestamp).toLocaleTimeString()}`,
      location: "metadata",
      importance: "low",
    })

    // Add change information
    if (frame.changeType !== "none") {
      texts.push({
        content: `Change detected: ${frame.changeType}`,
        location: "metadata",
        importance: "medium",
      })
    }

    return texts
  }

  private detectActivity(frame: ProcessedFrame): ActivityDetection {
    let current = "unknown"
    let context = " screen interaction"
    let duration = "just started"
    let nextLikely = "continued interaction"

    // Infer activity from frame characteristics
    if (frame.complexity < 20) {
      current = "idle"
      context = " minimal screen activity"
      duration = "possibly away"
      nextLikely = "resumed activity"
    } else if (frame.complexity > 70) {
      current = "active work"
      context = " complex screen content"
      duration = "in progress"
      nextLikely = "continued work"
    } else if (frame.isKeyFrame) {
      current = "scene transition"
      context = " new content loaded"
      duration = "just changed"
      nextLikely = "settling"
    }

    return { current, context, duration, nextLikely }
  }

  private generateSuggestions(frame: ProcessedFrame, activity: ActivityDetection): string[] {
    const suggestions: string[] = []

    if (activity.current === "idle") {
      suggestions.push("User may be away — consider pausing analysis")
      suggestions.push("Wait for user activity before next analysis")
    } else if (activity.current === "active work") {
      suggestions.push("User is actively working — monitor for changes")
      suggestions.push("Consider capturing more frames for detailed analysis")
    }

    if (frame.changeType === "scene_change") {
      suggestions.push("Major scene change — analyze new content")
      suggestions.push("Update context for new screen state")
    }

    return suggestions
  }

  private generateDetailedDescription(
    frame: ProcessedFrame,
    elements: AnalyzedElement[],
    activity: ActivityDetection
  ): string {
    const parts: string[] = []

    parts.push(`Screen analysis at ${new Date(frame.timestamp).toLocaleTimeString()}`)

    // Activity
    parts.push(`Activity: ${activity.current} (${activity.context})`)

    // Elements
    if (elements.length > 0) {
      const elementTypes = elements.map(e => e.type)
      parts.push(`UI elements: ${elementTypes.join(", ")}`)
    }

    // Frame info
    parts.push(`Resolution: ${frame.width}x${frame.height}`)
    parts.push(`Complexity: ${frame.complexity}/100`)
    parts.push(`Change: ${frame.changeType} (${frame.changePercent.toFixed(1)}%)`)

    return parts.join(" | ")
  }

  private calculateConfidence(frame: ProcessedFrame): number {
    // Higher confidence for key frames with clear changes
    let confidence = 0.5

    if (frame.isKeyFrame) confidence += 0.2
    if (frame.changePercent > 10) confidence += 0.1
    if (frame.complexity > 30) confidence += 0.1
    if (frame.sizeBytes > 50000) confidence += 0.1

    return Math.min(1, confidence)
  }

  private getFramesForQuery(query: VisionQuery): ProcessedFrame[] {
    if (!this.memory) return []

    if (query.frameIds) {
      return query.frameIds
        .map(id => this.memory!.getFrameById(id))
        .filter((f): f is ProcessedFrame => f !== undefined)
    }

    if (query.timeRange) {
      return this.memory.queryFrames({
        startTime: query.timeRange.start,
        endTime: query.timeRange.end,
      })
    }

    // Default: recent frames
    return this.memory.recallByTime(5) // Last 5 minutes
  }

  private generateAnswer(question: string, analysis: AnalysisResult, frames: ProcessedFrame[]): string {
    const lower = question.toLowerCase()

    // Answer different types of questions
    if (lower.includes("what") && lower.includes("screen")) {
      return `Currently on screen: ${analysis.description}. Activity: ${analysis.activity.current}.`
    }

    if (lower.includes("what") && lower.includes("happen")) {
      return `Recent activity: ${analysis.activity.context}. Likely next: ${analysis.activity.nextLikely}.`
    }

    if (lower.includes("how long")) {
      const timeSpan = frames.length > 1
        ? (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000
        : 0
      return `Monitoring for ${Math.round(timeSpan)} seconds. ${frames.length} frames captured.`
    }

    if (lower.includes("change")) {
      const changes = frames.filter(f => f.changeType !== "none")
      return `Detected ${changes.length} changes. Latest: ${analysis.description}`
    }

    // Default answer
    return `Analysis: ${analysis.description}. Confidence: ${(analysis.confidence * 100).toFixed(0)}%.`
  }
}
