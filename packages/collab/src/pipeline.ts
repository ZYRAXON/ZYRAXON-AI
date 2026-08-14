import { Effect, Ref, Context } from "effect"
import type { PipelinePhase, PipelineStatus, Task, AgentID } from "./types"

export interface PipelineInterface {
  // Start a new pipeline
  readonly start: (spec: PipelineSpec) => Effect.Effect<void>

  // Move to next phase
  readonly nextPhase: () => Effect.Effect<void>

  // Update current phase progress
  readonly updateProgress: (progress: number) => Effect.Effect<void>

  // Complete current phase
  readonly completePhase: (result: unknown) => Effect.Effect<void>

  // Fail current phase
  readonly failPhase: (error: string) => Effect.Effect<void>

  // Get current status
  readonly getStatus: () => Effect.Effect<PipelineStatus>

  // Get phase history
  readonly getHistory: () => Effect.Effect<PipelinePhase[]>
}

export interface PipelineSpec {
  name: string
  phases: PipelinePhase[]
  agents: Record<PipelinePhase, AgentID>
}

export class Pipeline extends Context.Service<Pipeline, PipelineInterface>()("@zyraxon/Pipeline") {}

const PHASE_ORDER: PipelinePhase[] = ["plan", "execute", "verify", "deploy"]

export const make = Effect.gen(function* () {
  const statusRef = yield* Ref.make<PipelineStatus | undefined>(undefined)
  const historyRef = yield* Ref.make<PipelinePhase[]>([])
  const specRef = yield* Ref.make<PipelineSpec | undefined>(undefined)

  const start = (spec: PipelineSpec) =>
    Effect.gen(function* () {
      yield* Ref.set(specRef, spec)
      yield* Ref.set(historyRef, [])
      yield* Ref.set(statusRef, {
        phase: spec.phases[0] ?? "plan",
        status: "in-progress",
        progress: 0,
        startedAt: Date.now(),
      })

      yield* Effect.logInfo(`Pipeline started: ${spec.name}`)
    })

  const nextPhase = () =>
    Effect.gen(function* () {
      const current = yield* Ref.get(statusRef)
      if (!current) return

      const currentIndex = PHASE_ORDER.indexOf(current.phase)
      if (currentIndex === -1 || currentIndex >= PHASE_ORDER.length - 1) return

      // Record current phase in history
      yield* Ref.update(historyRef, (history) => [...history, current.phase])

      // Move to next phase
      const nextPhase = PHASE_ORDER[currentIndex + 1]
      yield* Ref.set(statusRef, {
        phase: nextPhase,
        status: "in-progress",
        progress: 0,
        startedAt: Date.now(),
      })

      yield* Effect.logInfo(`Pipeline moved to phase: ${nextPhase}`)
    })

  const updateProgress = (progress: number) =>
    Ref.update(statusRef, (status) => {
      if (!status) return status
      return { ...status, progress: Math.min(100, Math.max(0, progress)) }
    })

  const completePhase = (result: unknown) =>
    Ref.update(statusRef, (status) => {
      if (!status) return status
      return {
        ...status,
        status: "done" as const,
        progress: 100,
        completedAt: Date.now(),
      }
    })

  const failPhase = (error: string) =>
    Ref.update(statusRef, (status) => {
      if (!status) return status
      return {
        ...status,
        status: "failed" as const,
      }
    })

  const getStatus = () => Ref.get(statusRef).pipe(Effect.map((status) => status ?? {
    phase: "plan" as PipelinePhase,
    status: "pending" as const,
    progress: 0,
    startedAt: Date.now(),
  }))

  const getHistory = () => Ref.get(historyRef)

  return Pipeline.of({
    start,
    nextPhase,
    updateProgress,
    completePhase,
    failPhase,
    getStatus,
    getHistory,
  })
})
