import { Schema } from "effect"

// Agent identifiers
export type AgentID = string

// Task status
export const TaskStatus = Schema.Literals(["pending", "planning", "in-progress", "review", "done", "failed", "blocked"])
export type TaskStatus = typeof TaskStatus.Type

// Agent status
export const AgentStatus = Schema.Literals(["idle", "working", "waiting", "failed", "offline"])
export type AgentStatus = typeof AgentStatus.Type

// Message types for agent communication
export const MessageType = Schema.Literals([
  "task-assign",
  "task-update",
  "task-complete",
  "task-failed",
  "plan-share",
  "status-request",
  "status-response",
  "alert",
  "broadcast",
])
export type MessageType = typeof MessageType.Type

// Agent message schema
export const AgentMessage = Schema.Struct({
  id: Schema.String,
  from: Schema.String,
  to: Schema.Union([Schema.String, Schema.Literal("*")]),
  type: MessageType,
  payload: Schema.Unknown,
  timestamp: Schema.Number,
  sessionId: Schema.optional(Schema.String),
})
export type AgentMessage = typeof AgentMessage.Type

// Task schema
export const Task = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  assignedTo: Schema.String,
  status: TaskStatus,
  progress: Schema.Number,
  dependencies: Schema.Array(Schema.String),
  result: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
})
export type Task = typeof Task.Type

// Agent status info
export const AgentInfo = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  icon: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
  status: AgentStatus,
  currentTask: Schema.optional(Schema.String),
  progress: Schema.Number,
  completedTasks: Schema.Number,
  failedTasks: Schema.Number,
  lastActive: Schema.Number,
})
export type AgentInfo = typeof AgentInfo.Type

// Pipeline phase
export const PipelinePhase = Schema.Literals(["plan", "execute", "verify", "deploy"])
export type PipelinePhase = typeof PipelinePhase.Type

// Pipeline status
export const PipelineStatus = Schema.Struct({
  phase: PipelinePhase,
  status: TaskStatus,
  progress: Schema.Number,
  startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
})
export type PipelineStatus = typeof PipelineStatus.Type

// Live status for dashboard
export const LiveStatus = Schema.Struct({
  agents: Schema.Array(AgentInfo),
  tasks: Schema.Array(Task),
  pipeline: Schema.optional(PipelineStatus),
  lastUpdated: Schema.Number,
})
export type LiveStatus = typeof LiveStatus.Type

// Event types for real-time updates
export const CollabEventType = Schema.Literals([
  "agent-status-changed",
  "task-created",
  "task-updated",
  "task-completed",
  "task-failed",
  "message-sent",
  "pipeline-updated",
  "plan-shared",
  "status-request",
])
export type CollabEventType = typeof CollabEventType.Type

// Collaboration event
export const CollabEvent = Schema.Struct({
  type: CollabEventType,
  data: Schema.Unknown,
  timestamp: Schema.Number,
  agentId: Schema.optional(Schema.String),
  taskId: Schema.optional(Schema.String),
})
export type CollabEvent = typeof CollabEvent.Type
