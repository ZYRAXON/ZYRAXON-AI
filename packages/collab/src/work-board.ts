import { Effect, Ref, Context } from "effect"
import type { Task, AgentInfo, LiveStatus, TaskStatus, AgentStatus, PipelineStatus } from "./types"

export interface WorkBoardInterface {
  // Add a new task
  readonly addTask: (task: Task) => Effect.Effect<void>

  // Update task status
  readonly updateTask: (taskId: string, update: Partial<Task>) => Effect.Effect<void>

  // Get a specific task
  readonly getTask: (taskId: string) => Effect.Effect<Task | undefined>

  // Get all tasks
  readonly getTasks: () => Effect.Effect<Task[]>

  // Update agent status
  readonly updateAgent: (agentId: string, status: Partial<AgentInfo>) => Effect.Effect<void>

  // Get agent status
  readonly getAgent: (agentId: string) => Effect.Effect<AgentInfo | undefined>

  // Get all agents
  readonly getAgents: () => Effect.Effect<AgentInfo[]>

  // Update pipeline status
  readonly updatePipeline: (status: Partial<PipelineStatus>) => Effect.Effect<void>

  // Get pipeline status
  readonly getPipeline: () => Effect.Effect<PipelineStatus | undefined>

  // Get complete live status
  readonly getLiveStatus: () => Effect.Effect<LiveStatus>

  // Get tasks by agent
  readonly getTasksByAgent: (agentId: string) => Effect.Effect<Task[]>

  // Get completed tasks count
  readonly getCompletedCount: () => Effect.Effect<number>

  // Get failed tasks count
  readonly getFailedCount: () => Effect.Effect<number>
}

export class WorkBoard extends Context.Service<WorkBoard, WorkBoardInterface>()("@zyraxon/WorkBoard") {}

export const make = Effect.gen(function* () {
  const tasksRef = yield* Ref.make<Map<string, Task>>(new Map())
  const agentsRef = yield* Ref.make<Map<string, AgentInfo>>(new Map())
  const pipelineRef = yield* Ref.make<PipelineStatus | undefined>(undefined)

  const addTask = (task: Task) =>
    Ref.update(tasksRef, (tasks) => {
      const newTasks = new Map(tasks)
      newTasks.set(task.id, task)
      return newTasks
    })

  const updateTask = (taskId: string, update: Partial<Task>) =>
    Ref.update(tasksRef, (tasks) => {
      const newTasks = new Map(tasks)
      const existing = newTasks.get(taskId)
      if (existing) {
        newTasks.set(taskId, { ...existing, ...update, updatedAt: Date.now() })
      }
      return newTasks
    })

  const getTask = (taskId: string) => Ref.get(tasksRef).pipe(Effect.map((tasks) => tasks.get(taskId)))

  const getTasks = () => Ref.get(tasksRef).pipe(Effect.map((tasks) => [...tasks.values()]))

  const updateAgent = (agentId: string, status: Partial<AgentInfo>) =>
    Ref.update(agentsRef, (agents) => {
      const newAgents = new Map(agents)
      const existing = newAgents.get(agentId)
      if (existing) {
        newAgents.set(agentId, { ...existing, ...status, lastActive: Date.now() })
      } else {
        // Create new agent entry
        newAgents.set(agentId, {
          id: agentId,
          name: agentId,
          status: "idle" as AgentStatus,
          progress: 0,
          completedTasks: 0,
          failedTasks: 0,
          lastActive: Date.now(),
          ...status,
        })
      }
      return newAgents
    })

  const getAgent = (agentId: string) => Ref.get(agentsRef).pipe(Effect.map((agents) => agents.get(agentId)))

  const getAgents = () => Ref.get(agentsRef).pipe(Effect.map((agents) => [...agents.values()]))

  const updatePipeline = (status: Partial<PipelineStatus>) =>
    Ref.update(pipelineRef, (existing) => ({
      ...(existing ?? {
        phase: "plan" as const,
        status: "pending" as const,
        progress: 0,
        startedAt: Date.now(),
      }),
      ...status,
    }))

  const getPipeline = () => Ref.get(pipelineRef)

  const getLiveStatus = () =>
    Effect.gen(function* () {
      const tasks = yield* getTasks()
      const agents = yield* getAgents()
      const pipeline = yield* getPipeline()

      return {
        agents,
        tasks,
        pipeline,
        lastUpdated: Date.now(),
      }
    })

  const getTasksByAgent = (agentId: string) =>
    getTasks().pipe(Effect.map((tasks) => tasks.filter((t) => t.assignedTo === agentId)))

  const getCompletedCount = () =>
    getTasks().pipe(Effect.map((tasks) => tasks.filter((t) => t.status === "done").length))

  const getFailedCount = () =>
    getTasks().pipe(Effect.map((tasks) => tasks.filter((t) => t.status === "failed").length))

  return WorkBoard.of({
    addTask,
    updateTask,
    getTask,
    getTasks,
    updateAgent,
    getAgent,
    getAgents,
    updatePipeline,
    getPipeline,
    getLiveStatus,
    getTasksByAgent,
    getCompletedCount,
    getFailedCount,
  })
})
