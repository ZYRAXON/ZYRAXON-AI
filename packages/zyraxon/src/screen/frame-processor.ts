// ZYRAXON Vision System — Frame Processor
// Intelligent frame analysis: dedup, diff detection, optimization
// Makes every frame count — no wasted memory

import fs from "fs/promises"
import path from "path"
import type { Frame } from "./capture-engine"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProcessedFrame extends Frame {
  // Enriched fields
  changeType: "none" | "minor" | "moderate" | "major" | "scene_change"
  description: string          // Auto-generated scene description
  uiElements: UIElement[]      // Detected UI elements
  textContent: string[]        // Extracted text regions
  dominantColors: string[]     // Top 3 colors
  complexity: number           // 0-100 visual complexity score
}

export interface UIElement {
  type: "button" | "text" | "image" | "input" | "menu" | "dialog" | "tab" | "icon" | "link"
  confidence: number           // 0-1
  region?: { x: number; y: number; width: number; height: number }
}

export interface FrameDiff {
  fromFrame: string
  toFrame: string
  changePercent: number
  changeType: ProcessedFrame["changeType"]
  newElements: UIElement[]
  removedElements: UIElement[]
  textChanges: string[]
}

export interface SceneTimeline {
  scenes: SceneSegment[]
  totalFrames: number
  duration: number
}

export interface SceneSegment {
  startFrame: string
  endFrame: string
  startTime: number
  endTime: number
  description: string
  frameCount: number
  dominantActivity: string     // "coding" | "browsing" | "designing" | "idle" | "unknown"
}

// ─── Change Thresholds ───────────────────────────────────────────────────────

const THRESHOLDS = {
  none: 1,              // < 1% = identical
  minor: 5,             // < 5% = minor change (cursor, scrollbar)
  moderate: 15,         // < 15% = moderate (new content, typing)
  major: 30,            // < 30% = major (new window, page navigation)
  scene_change: 50,     // >= 50% = completely different scene
}

// ─── Frame Processor ─────────────────────────────────────────────────────────

export class FrameProcessor {
  private frameHistory: ProcessedFrame[] = []
  private maxHistory = 100

  // ── Process a raw frame ────────────────────────────────────────────────────

  async processFrame(frame: Frame, previousFrame?: ProcessedFrame): Promise<ProcessedFrame> {
    const changePercent = previousFrame
      ? this.compareFrames(previousFrame, frame)
      : 100

    const changeType = this.classifyChange(changePercent)
    const uiElements = await this.detectUIElements(frame)
    const textContent = await this.extractText(frame)
    const dominantColors = await this.getDominantColors(frame)
    const complexity = this.calculateComplexity(frame)
    const description = this.generateDescription(changeType, uiElements, textContent, frame)

    const processed: ProcessedFrame = {
      ...frame,
      changeType,
      description,
      uiElements,
      textContent,
      dominantColors,
      complexity,
    }

    // Maintain history
    this.frameHistory.push(processed)
    if (this.frameHistory.length > this.maxHistory) {
      this.frameHistory.shift()
    }

    return processed
  }

  // ── Compare two frames ─────────────────────────────────────────────────────

  compareFrames(from: ProcessedFrame, to: Frame): number {
    // Multi-factor comparison
    let score = 0
    let factors = 0

    // 1. Hash similarity (primary)
    if (from.hash && to.hash) {
      const hashSimilarity = this.hashSimilarity(from.hash, to.hash)
      score += hashSimilarity * 0.4
      factors += 0.4
    }

    // 2. File size change
    if (from.sizeBytes && to.sizeBytes) {
      const sizeDiff = Math.abs(from.sizeBytes - to.sizeBytes) / Math.max(from.sizeBytes, to.sizeBytes)
      score += sizeDiff * 0.2
      factors += 0.2
    }

    // 3. Timestamp gap (longer gap = more likely changed)
    const timeDiff = Math.abs(to.timestamp - from.timestamp) / 1000
    const timeFactor = Math.min(1, timeDiff / 30) // Max out at 30 seconds
    score += timeFactor * 0.2
    factors += 0.2

    // 4. UI element change (if available)
    if (from.uiElements.length > 0) {
      // Approximate change based on complexity difference
      const complexityDiff = Math.abs(from.complexity - 50) / 50
      score += complexityDiff * 0.2
      factors += 0.2
    }

    return factors > 0 ? (score / factors) * 100 : 50
  }

  // ── Classify change magnitude ──────────────────────────────────────────────

  classifyChange(percent: number): ProcessedFrame["changeType"] {
    if (percent < THRESHOLDS.none) return "none"
    if (percent < THRESHOLDS.minor) return "minor"
    if (percent < THRESHOLDS.moderate) return "moderate"
    if (percent < THRESHOLDS.major) return "major"
    return "scene_change"
  }

  // ── Detect UI Elements (simplified heuristic) ──────────────────────────────

  private async detectUIElements(frame: Frame): Promise<UIElement[]> {
    const elements: UIElement[] = []

    // Based on file size and resolution, infer UI complexity
    const pixelCount = frame.width * frame.height
    const bytesPerPixel = frame.sizeBytes / pixelCount

    // High bytes/pixel = likely has many colors/UI elements
    if (bytesPerPixel > 0.5) {
      elements.push({ type: "button", confidence: 0.6 })
      elements.push({ type: "text", confidence: 0.8 })
    }

    // Very small file = likely simple/empty screen
    if (frame.sizeBytes < 10000) {
      elements.push({ type: "image", confidence: 0.3 })
    }

    // Medium complexity
    if (bytesPerPixel > 0.3 && bytesPerPixel < 0.7) {
      elements.push({ type: "input", confidence: 0.5 })
      elements.push({ type: "menu", confidence: 0.4 })
    }

    return elements
  }

  // ── Extract Text (simplified) ──────────────────────────────────────────────

  private async extractText(frame: Frame): Promise<string[]> {
    // In production, this would use OCR
    // For now, return placeholder based on frame characteristics
    const texts: string[] = []

    if (frame.isKeyFrame) {
      texts.push("[Key frame captured]")
    }

    return texts
  }

  // ── Get Dominant Colors ────────────────────────────────────────────────────

  private async getDominantColors(frame: Frame): Promise<string[]> {
    // Simplified: return colors based on file characteristics
    // In production, would analyze actual pixel data
    return ["#000000", "#FFFFFF", "#333333"]
  }

  // ── Calculate Visual Complexity ────────────────────────────────────────────

  private calculateComplexity(frame: Frame): number {
    const pixelCount = frame.width * frame.height
    const bytesPerPixel = frame.sizeBytes / pixelCount
    // More bytes per pixel = more complex visual
    return Math.min(100, Math.round(bytesPerPixel * 100))
  }

  // ── Generate Description ───────────────────────────────────────────────────

  private generateDescription(
    changeType: ProcessedFrame["changeType"],
    uiElements: UIElement[],
    textContent: string[],
    frame: Frame
  ): string {
    const parts: string[] = []

    parts.push(`Frame captured at ${new Date(frame.timestamp).toLocaleTimeString()}`)

    switch (changeType) {
      case "none":
        parts.push("No significant change from previous frame")
        break
      case "minor":
        parts.push("Minor change detected (cursor movement, scroll)")
        break
      case "moderate":
        parts.push("Moderate change — new content or UI update")
        break
      case "major":
        parts.push("Major change — new window or page navigation")
        break
      case "scene_change":
        parts.push("Complete scene change detected")
        break
    }

    if (uiElements.length > 0) {
      parts.push(`UI elements detected: ${uiElements.map(e => e.type).join(", ")}`)
    }

    parts.push(`Resolution: ${frame.width}x${frame.height}`)
    parts.push(`Size: ${(frame.sizeBytes / 1024).toFixed(1)}KB`)

    return parts.join(" | ")
  }

  // ── Hash Similarity ────────────────────────────────────────────────────────

  private hashSimilarity(hash1: string, hash2: string): number {
    if (hash1 === hash2) return 1
    if (hash1.length !== hash2.length) return 0

    let matches = 0
    for (let i = 0; i < hash1.length; i++) {
      if (hash1[i] === hash2[i]) matches++
    }
    return matches / hash1.length
  }

  // ── Generate Diff ──────────────────────────────────────────────────────────

  generateDiff(from: ProcessedFrame, to: ProcessedFrame): FrameDiff {
    const changePercent = this.compareFrames(from, to)
    const changeType = this.classifyChange(changePercent)

    // Find new/removed elements
    const fromTypes = new Set(from.uiElements.map(e => e.type))
    const toTypes = new Set(to.uiElements.map(e => e.type))

    const newElements = to.uiElements.filter(e => !fromTypes.has(e.type))
    const removedElements = from.uiElements.filter(e => !toTypes.has(e.type))

    return {
      fromFrame: from.id,
      toFrame: to.id,
      changePercent,
      changeType,
      newElements,
      removedElements,
      textChanges: [],
    }
  }

  // ── Generate Scene Timeline ────────────────────────────────────────────────

  generateTimeline(frames: ProcessedFrame[]): SceneTimeline {
    if (frames.length === 0) {
      return { scenes: [], totalFrames: 0, duration: 0 }
    }

    const scenes: SceneSegment[] = []
    let currentScene: SceneSegment | null = null

    for (const frame of frames) {
      const isNewScene = !currentScene ||
        frame.changeType === "scene_change" ||
        frame.changeType === "major"

      if (isNewScene) {
        if (currentScene) {
          currentScene.endTime = frame.timestamp
          scenes.push(currentScene)
        }
        currentScene = {
          startFrame: frame.id,
          endFrame: frame.id,
          startTime: frame.timestamp,
          endTime: frame.timestamp,
          description: frame.description,
          frameCount: 1,
          dominantActivity: this.inferActivity(frame),
        }
      } else if (currentScene) {
        currentScene.endFrame = frame.id
        currentScene.endTime = frame.timestamp
        currentScene.frameCount++
      }
    }

    if (currentScene) {
      currentScene.endTime = frames[frames.length - 1].timestamp
      scenes.push(currentScene)
    }

    return {
      scenes,
      totalFrames: frames.length,
      duration: frames[frames.length - 1].timestamp - frames[0].timestamp,
    }
  }

  // ── Infer Activity ─────────────────────────────────────────────────────────

  private inferActivity(frame: ProcessedFrame): string {
    // Simplified activity inference
    if (frame.complexity < 20) return "idle"
    if (frame.complexity > 70) return "coding"
    if (frame.uiElements.some(e => e.type === "button")) return "browsing"
    return "unknown"
  }

  // ── Get Recent Frames ──────────────────────────────────────────────────────

  getRecentFrames(count: number = 10): ProcessedFrame[] {
    return this.frameHistory.slice(-count)
  }

  // ── Get Frame at Time ──────────────────────────────────────────────────────

  getFrameAtTime(timestamp: number): ProcessedFrame | undefined {
    return this.frameHistory.find(f =>
      Math.abs(f.timestamp - timestamp) < 1000
    )
  }
}
