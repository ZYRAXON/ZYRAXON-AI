import { Effect, Ref, Context } from "effect"
import type { AgentID, AgentInfo, Task, CollabEvent } from "./types"

export interface MonitorInterface {
  // Start monitoring
  readonly start: () => Effect.Effect<void>

  // Stop monitoring
  readonly stop: () => Effect.Effect<void>

  // Record agent activity
  readonly recordActivity: (agentId: AgentID, activity: ActivityRecord) => Effect.Effect<void>

  // Get agent performance stats
  readonly getStats: (agentId: AgentID) => Effect.Effect<AgentStats>

  // Get all stats
  readonly getAllStats: () => Effect.Effect<Map<AgentID, AgentStats>>

  // Get activity log
  readonly getActivityLog: (limit?: number) => Effect.Effect<ActivityLogEntry[]>

  // Get real-time status
  readonly getRealTimeStatus: () => Effect.Effect<RealTimeStatus>
}

export interface ActivityRecord {
  type: "task-started" | "task-completed" | "task-failed" | "message-sent" | "status-changed"
  taskId?: string
  message?: string
  duration?: number
  error?: string
}

export interface AgentStats {
  agentId: AgentID
  totalTasks: number
  completedTasks: number
  failedTasks: number
  averageDuration: number
  lastActive: number
  uptime: number
}

export interface ActivityLogEntry {
  timestamp: number
  agentId: AgentID
  activity: ActivityRecord
}

export interface RealTimeStatus {
  activeAgents: number
  totalTasks: number
  completedTasks: number
  failedTasks: number
  averageProgress: number
  lastEvent: CollabEvent | undefined
}

export class Monitor extends Context.Service<Monitor, MonitorInterface>()("@zyraxon/Monitor") {}

export const make = Effect.gen(function* () {
  const isRunning = yield* Ref.make(false)
  const activityLog = yield* Ref.make<ActivityLogEntry[]>([])
  const agentStats = yield* Ref.make<Map<AgentID, AgentStats>>(new Map())
  const lastEvent = yield* Ref.make<CollabEvent | undefined>(undefined)
  const startTime = yield* Ref.make(Date.now())

  const start = () => Ref.set(isRunning, true)

  const stop = () => Ref.set(isRunning, false)

  const recordActivity = (agentId: AgentID, activity: ActivityRecord) =>
    Effect.gen(function* () {
      const entry: ActivityLogEntry = {
        timestamp: Date.now(),
        agentId,
        activity,
      }

      // Add to activity log (keep last 1000 entries)
      yield* Ref.update(activityLog, (log) => {
        const newLog = [...log, entry]
        return newLog.slice(-1000)
      })

      // Update agent stats
      const now = Date.now()
      const startedAt = yield* Ref.get(startTime)
      yield* Ref.update(agentStats, (stats) => {
        const newStats = new Map(stats)
        const existing = newStats.get(agentId) ?? {
          agentId,
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          averageDuration: 0,
          lastActive: now,
          uptime: 0,
        }

        const updated: AgentStats = {
          ...existing,
          totalTasks: activity.type === "task-started" ? existing.totalTasks + 1 : existing.totalTasks,
          completedTasks: activity.type === "task-completed" ? existing.completedTasks + 1 : existing.completedTasks,
          failedTasks: activity.type === "task-failed" ? existing.failedTasks + 1 : existing.failedTasks,
          lastActive: now,
          uptime: now - startedAt,
        }

        // Update average duration
        if (activity.duration) {
          const totalDuration = existing.averageDuration * existing.totalTasks + activity.duration
          updated.averageDuration = totalDuration / updated.totalTasks
        }

        newStats.set(agentId, updated)
        return newStats
      })

      yield* Effect.logDebug(`Activity recorded for ${agentId}: ${activity.type}`)
    })

  const getStats = (agentId: AgentID) =>
    Ref.get(agentStats).pipe(
      Effect.map((stats) => stats.get(agentId) ?? {
        agentId,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageDuration: 0,
        lastActive: 0,
        uptime: 0,
      }),
    )

  const getAllStats = () => Ref.get(agentStats)

  const getActivityLog = (limit: number = 100) =>
    Ref.get(activityLog).pipe(Effect.map((log) => log.slice(-limit)))

  const getRealTimeStatus = () =>
    Effect.gen(function* () {
      const stats = yield* Ref.get(agentStats)
      const log = yield* Ref.get(activityLog)
      const event = yield* Ref.get(lastEvent)

      let activeAgents = 0
      let totalTasks = 0
      let completedTasks = 0
      let failedTasks = 0
      let totalProgress = 0

      for (const stat of stats.values()) {
        if (Date.now() - stat.lastActive < 60000) {
          activeAgents++
        }
        totalTasks += stat.totalTasks
        completedTasks += stat.completedTasks
        failedTasks += stat.failedTasks
      }

      return {
        activeAgents,
        totalTasks,
        completedTasks,
        failedTasks,
        averageProgress: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        lastEvent: event,
      }
    })

  return Monitor.of({
    start,
    stop,
    recordActivity,
    getStats,
    getAllStats,
    getActivityLog,
    getRealTimeStatus,
  })
})
