import { Effect, Ref, Context } from "effect"
import type { AgentID, Task, PipelineStatus, CollabEvent } from "./types"

export interface OrchestratorInterface {
  // Start a project with the orchestrator
  readonly startProject: (projectSpec: ProjectSpec) => Effect.Effect<void>

  // Assign a task to an agent
  readonly assignTask: (agentId: AgentID, task: Omit<Task, "id" | "createdAt" | "updatedAt">) => Effect.Effect<string>

  // Report task completion
  readonly completeTask: (taskId: string, result: unknown) => Effect.Effect<void>

  // Report task failure
  readonly failTask: (taskId: string, error: string) => Effect.Effect<void>

  // Request agent status
  readonly requestStatus: (agentId: AgentID) => Effect.Effect<void>

  // Handle agent failure with recovery
  readonly handleFailure: (agentId: AgentID, taskId: string, error: string) => Effect.Effect<void>

  // Get orchestrator status
  readonly getStatus: () => Effect.Effect<OrchestratorStatus>

  // Subscribe to orchestrator events
  readonly onEvent: (callback: (event: CollabEvent) => void) => Effect.Effect<void>
}

export interface ProjectSpec {
  name: string
  description: string
  agents: AgentID[]
  tasks: TaskSpec[]
}

export interface TaskSpec {
  title: string
  description: string
  assignedTo: AgentID
  dependencies?: string[]
}

export interface OrchestratorStatus {
  isRunning: boolean
  projectName: string | undefined
  totalTasks: number
  completedTasks: number
  failedTasks: number
  activeAgents: number
}

export class Orchestrator extends Context.Service<Orchestrator, OrchestratorInterface>()("@zyraxon/Orchestrator") {}

export const make = Effect.gen(function* () {
  const isRunning = yield* Ref.make(false)
  const projectName = yield* Ref.make<string | undefined>(undefined)
  const taskCounter = yield* Ref.make(0)
  const eventCallbacks = yield* Ref.make<Set<(event: CollabEvent) => void>>(new Set())

  const emitEvent = (event: CollabEvent) =>
    Effect.gen(function* () {
      const callbacks = yield* Ref.get(eventCallbacks)
      for (const callback of callbacks) {
        callback(event)
      }
    })

  const startProject = (projectSpec: ProjectSpec) =>
    Effect.gen(function* () {
      yield* Ref.set(isRunning, true)
      yield* Ref.set(projectName, projectSpec.name)
      yield* Ref.set(taskCounter, 0)

      yield* emitEvent({
        type: "plan-shared",
        data: projectSpec,
        timestamp: Date.now(),
      })

      yield* Effect.logInfo(`Orchestrator started project: ${projectSpec.name}`)
    })

  const assignTask = (agentId: AgentID, task: Omit<Task, "id" | "createdAt" | "updatedAt">) =>
    Effect.gen(function* () {
      const id = yield* Ref.modify(taskCounter, (count) => [`task-${count + 1}`, count + 1])
      const now = Date.now()

      const fullTask: Task = {
        ...task,
        id,
        createdAt: now,
        updatedAt: now,
      }

      yield* emitEvent({
        type: "task-created",
        data: fullTask,
        timestamp: now,
        agentId,
        taskId: id,
      })

      yield* emitEvent({
        type: "task-updated",
        data: { ...fullTask, status: "in-progress" },
        timestamp: Date.now(),
        agentId,
        taskId: id,
      })

      yield* Effect.logInfo(`Task ${id} assigned to ${agentId}`)

      return id
    })

  const completeTask = (taskId: string, result: unknown) =>
    Effect.gen(function* () {
      yield* emitEvent({
        type: "task-completed",
        data: { taskId, result },
        timestamp: Date.now(),
        taskId,
      })

      yield* Effect.logInfo(`Task ${taskId} completed`)
    })

  const failTask = (taskId: string, error: string) =>
    Effect.gen(function* () {
      yield* emitEvent({
        type: "task-failed",
        data: { taskId, error },
        timestamp: Date.now(),
        taskId,
      })

      yield* Effect.logWarning(`Task ${taskId} failed: ${error}`)
    })

  const requestStatus = (agentId: AgentID) =>
    emitEvent({
      type: "status-request",
      data: { agentId },
      timestamp: Date.now(),
      agentId,
    })

  const handleFailure = (agentId: AgentID, taskId: string, error: string) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`Handling failure for agent ${agentId} on task ${taskId}`)

      // Emit failure event
      yield* failTask(taskId, error)

      // TODO: Implement recovery logic
      // 1. Find another agent that can handle the task
      // 2. Reassign the task
      // 3. Update the work board
    })

  const getStatus = () =>
    Effect.gen(function* () {
      const running = yield* Ref.get(isRunning)
      const name = yield* Ref.get(projectName)
      const tasks = yield* Ref.get(taskCounter)

      return {
        isRunning: running,
        projectName: name,
        totalTasks: tasks,
        completedTasks: 0, // TODO: Get from WorkBoard
        failedTasks: 0, // TODO: Get from WorkBoard
        activeAgents: 0, // TODO: Get from WorkBoard
      }
    })

  const onEvent = (callback: (event: CollabEvent) => void) =>
    Ref.update(eventCallbacks, (callbacks) => {
      const newCallbacks = new Set(callbacks)
      newCallbacks.add(callback)
      return newCallbacks
    })

  return Orchestrator.of({
    startProject,
    assignTask,
    completeTask,
    failTask,
    requestStatus,
    handleFailure,
    getStatus,
    onEvent,
  })
})
