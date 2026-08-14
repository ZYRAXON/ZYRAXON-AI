// ZYRAXON Vision System — Frame Memory
// Ring buffer + key frame storage + intelligent recall
// "আমি আপনার স্ক্রিন ৫ মিনিট আগে দেখতে পারি"

import fs from "fs/promises"
import path from "path"
import { Global } from "@zyraxon-ai/core/global"
import type { ProcessedFrame, SceneTimeline } from "./frame-processor"

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MemoryConfig {
  maxFrames: number           // Max frames in ring buffer
  maxKeyFrames: number        // Max key frames to keep
  retentionHours: number      // How long to keep frames
  autoCompress: boolean       // Compress old frames
}

export interface FrameQuery {
  startTime?: number
  endTime?: number
  changeType?: ProcessedFrame["changeType"]
  minComplexity?: number
  maxComplexity?: number
  limit?: number
}

export interface MemoryStats {
  totalFrames: number
  keyFrames: number
  diskUsageMB: number
  oldestFrame: number | null
  newestFrame: number | null
  avgFrameSize: number
}

// ─── Directories ─────────────────────────────────────────────────────────────

const BASE_DIR = path.join(Global.Path.data, "vision")
const FRAMES_DIR = path.join(BASE_DIR, "frames")
const KEYFRAMES_DIR = path.join(BASE_DIR, "keyframes")
const TIMELINE_DIR = path.join(BASE_DIR, "timelines")
const MEMORY_INDEX = path.join(BASE_DIR, "memory-index.json")

// ─── Default Config ──────────────────────────────────────────────────────────

const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  maxFrames: 500,
  maxKeyFrames: 100,
  retentionHours: 24,
  autoCompress: true,
}

// ─── Frame Memory ────────────────────────────────────────────────────────────

export class FrameMemory {
  private config: MemoryConfig
  private frames: ProcessedFrame[] = []
  private keyFrames: ProcessedFrame[] = []
  private timeline: SceneTimeline | null = null

  constructor(config: Partial<MemoryConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config }
  }

  // ── Initialize ─────────────────────────────────────────────────────────────

  async init(): Promise<void> {
    await this.ensureDirectories()
    await this.loadFromDisk()
  }

  // ── Store Frame ────────────────────────────────────────────────────────────

  async storeFrame(frame: ProcessedFrame): Promise<void> {
    // Add to ring buffer
    this.frames.push(frame)

    // If it's a key frame, store separately
    if (frame.isKeyFrame) {
      this.keyFrames.push(frame)
      await this.saveKeyFrame(frame)
    }

    // Enforce limits
    await this.enforceLimits()

    // Update index
    await this.updateIndex()
  }

  // ── Query Frames ───────────────────────────────────────────────────────────

  queryFrames(query: FrameQuery = {}): ProcessedFrame[] {
    let results = [...this.frames]

    // Time range filter
    if (query.startTime) {
      results = results.filter(f => f.timestamp >= query.startTime!)
    }
    if (query.endTime) {
      results = results.filter(f => f.timestamp <= query.endTime!)
    }

    // Change type filter
    if (query.changeType) {
      results = results.filter(f => f.changeType === query.changeType)
    }

    // Complexity filter
    if (query.minComplexity !== undefined) {
      results = results.filter(f => f.complexity >= query.minComplexity!)
    }
    if (query.maxComplexity !== undefined) {
      results = results.filter(f => f.complexity <= query.maxComplexity!)
    }

    // Limit
    if (query.limit) {
      results = results.slice(-query.limit)
    }

    return results
  }

  // ── Recall by Time ─────────────────────────────────────────────────────────

  recallByTime(minutesAgo: number): ProcessedFrame[] {
    const cutoff = Date.now() - (minutesAgo * 60 * 1000)
    return this.frames.filter(f => f.timestamp >= cutoff)
  }

  // ── Recall Key Frames ──────────────────────────────────────────────────────

  recallKeyFrames(limit: number = 10): ProcessedFrame[] {
    return this.keyFrames.slice(-limit)
  }

  // ── Recall Scene Changes ───────────────────────────────────────────────────

  recallSceneChanges(): ProcessedFrame[] {
    return this.frames.filter(f =>
      f.changeType === "scene_change" || f.changeType === "major"
    )
  }

  // ── Get Latest Frame ───────────────────────────────────────────────────────

  getLatestFrame(): ProcessedFrame | undefined {
    return this.frames[this.frames.length - 1]
  }

  // ── Get Frame by ID ────────────────────────────────────────────────────────

  getFrameById(id: string): ProcessedFrame | undefined {
    return this.frames.find(f => f.id === id)
  }

  // ── Search Frames by Description ───────────────────────────────────────────

  searchFrames(keyword: string): ProcessedFrame[] {
    const lower = keyword.toLowerCase()
    return this.frames.filter(f =>
      f.description.toLowerCase().includes(lower) ||
      f.textContent.some(t => t.toLowerCase().includes(lower))
    )
  }

  // ── Get Scene Timeline ─────────────────────────────────────────────────────

  getTimeline(): SceneTimeline | null {
    return this.timeline
  }

  async buildTimeline(processor: { generateTimeline: (frames: ProcessedFrame[]) => SceneTimeline }): Promise<SceneTimeline> {
    this.timeline = processor.generateTimeline(this.frames)
    await this.saveTimeline(this.timeline)
    return this.timeline
  }

  // ── Get Memory Stats ───────────────────────────────────────────────────────

  async getStats(): Promise<MemoryStats> {
    let diskUsageMB = 0
    let oldestFrame: number | null = null
    let newestFrame: number | null = null
    let totalSize = 0

    try {
      // Calculate disk usage
      const files = await fs.readdir(FRAMES_DIR)
      for (const file of files) {
        try {
          const stats = await fs.stat(path.join(FRAMES_DIR, file))
          diskUsageMB += stats.size
          if (!oldestFrame || stats.mtimeMs < oldestFrame) {
            oldestFrame = stats.mtimeMs
          }
          if (!newestFrame || stats.mtimeMs > newestFrame) {
            newestFrame = stats.mtimeMs
          }
          totalSize += stats.size
        } catch {}
      }
      diskUsageMB = diskUsageMB / (1024 * 1024)
    } catch {}

    return {
      totalFrames: this.frames.length,
      keyFrames: this.keyFrames.length,
      diskUsageMB: Math.round(diskUsageMB * 100) / 100,
      oldestFrame,
      newestFrame,
      avgFrameSize: this.frames.length > 0 ? totalSize / this.frames.length : 0,
    }
  }

  // ── Cleanup Old Frames ─────────────────────────────────────────────────────

  async cleanup(): Promise<number> {
    const cutoff = Date.now() - (this.config.retentionHours * 60 * 60 * 1000)
    let removed = 0

    // Remove old frames from memory
    const beforeCount = this.frames.length
    this.frames = this.frames.filter(f => f.timestamp >= cutoff)
    removed += beforeCount - this.frames.length

    // Remove old key frames
    const beforeKeyCount = this.keyFrames.length
    this.keyFrames = this.keyFrames.filter(f => f.timestamp >= cutoff)
    removed += beforeKeyCount - this.keyFrames.length

    // Remove old files from disk
    try {
      const files = await fs.readdir(FRAMES_DIR)
      for (const file of files) {
        try {
          const stats = await fs.stat(path.join(FRAMES_DIR, file))
          if (stats.mtimeMs < cutoff) {
            await fs.unlink(path.join(FRAMES_DIR, file))
            removed++
          }
        } catch {}
      }
    } catch {}

    // Remove old key frame files
    try {
      const files = await fs.readdir(KEYFRAMES_DIR)
      for (const file of files) {
        try {
          const stats = await fs.stat(path.join(KEYFRAMES_DIR, file))
          if (stats.mtimeMs < cutoff) {
            await fs.unlink(path.join(KEYFRAMES_DIR, file))
            removed++
          }
        } catch {}
      }
    } catch {}

    await this.updateIndex()
    return removed
  }

  // ── Export Memory Summary ──────────────────────────────────────────────────

  async exportSummary(): Promise<string> {
    const stats = await this.getStats()
    const recentFrames = this.frames.slice(-10)
    const keyFrameSummaries = this.keyFrames.slice(-5).map(f => ({
      id: f.id,
      time: new Date(f.timestamp).toISOString(),
      description: f.description,
      changeType: f.changeType,
    }))

    return JSON.stringify({
      stats,
      recentFrames: recentFrames.map(f => ({
        id: f.id,
        time: new Date(f.timestamp).toISOString(),
        changeType: f.changeType,
        complexity: f.complexity,
      })),
      keyFrameSummaries,
      timeline: this.timeline?.scenes.map(s => ({
        description: s.description,
        startTime: new Date(s.startTime).toISOString(),
        endTime: new Date(s.endTime).toISOString(),
        frameCount: s.frameCount,
        activity: s.dominantActivity,
      })),
    }, null, 2)
  }

  // ── Private Helpers ────────────────────────────────────────────────────────

  private async ensureDirectories(): Promise<void> {
    for (const dir of [BASE_DIR, FRAMES_DIR, KEYFRAMES_DIR, TIMELINE_DIR]) {
      try { await fs.access(dir) } catch { await fs.mkdir(dir, { recursive: true }) }
    }
  }

  private async enforceLimits(): Promise<void> {
    // Enforce ring buffer limit
    while (this.frames.length > this.config.maxFrames) {
      const removed = this.frames.shift()
      if (removed && !removed.isKeyFrame) {
        await fs.unlink(removed.filepath).catch(() => {})
        await fs.unlink(removed.thumbnailPath).catch(() => {})
      }
    }

    // Enforce key frame limit
    while (this.keyFrames.length > this.config.maxKeyFrames) {
      const removed = this.keyFrames.shift()
      if (removed) {
        // Keep key frame files longer, but remove from memory
      }
    }
  }

  private async saveKeyFrame(frame: ProcessedFrame): Promise<void> {
    const filename = `keyframe_${frame.id}.json`
    const filepath = path.join(KEYFRAMES_DIR, filename)
    await fs.writeFile(filepath, JSON.stringify(frame, null, 2))
  }

  private async saveTimeline(timeline: SceneTimeline): Promise<void> {
    const filename = `timeline_${Date.now()}.json`
    const filepath = path.join(TIMELINE_DIR, filename)
    await fs.writeFile(filepath, JSON.stringify(timeline, null, 2))
  }

  private async updateIndex(): Promise<void> {
    const index = {
      lastUpdated: Date.now(),
      frameCount: this.frames.length,
      keyFrameCount: this.keyFrames.length,
      latestFrameId: this.frames[this.frames.length - 1]?.id,
      oldestFrameId: this.frames[0]?.id,
    }
    await fs.writeFile(MEMORY_INDEX, JSON.stringify(index, null, 2))
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const data = await fs.readFile(MEMORY_INDEX, "utf-8")
      const index = JSON.parse(data)
      // In production, would reload frames from disk
      // For now, start fresh
    } catch {}
  }
}
