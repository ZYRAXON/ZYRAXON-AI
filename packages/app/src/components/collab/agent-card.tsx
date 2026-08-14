import { type Component, Show } from "solid-js"
import type { AgentInfo } from "@zyraxon-ai/collab"

interface AgentCardProps {
  agent: AgentInfo
}

export const AgentCard: Component<AgentCardProps> = (props) => {
  const getStatusColor = () => {
    switch (props.agent.status) {
      case "working":
        return "text-green-400 bg-green-400/10"
      case "idle":
        return "text-zinc-400 bg-zinc-400/10"
      case "waiting":
        return "text-yellow-400 bg-yellow-400/10"
      case "failed":
        return "text-red-400 bg-red-400/10"
      case "offline":
        return "text-zinc-500 bg-zinc-500/10"
      default:
        return "text-zinc-400 bg-zinc-400/10"
    }
  }

  const getStatusIcon = () => {
    switch (props.agent.status) {
      case "working":
        return "🔄"
      case "idle":
        return "⏸️"
      case "waiting":
        return "⏳"
      case "failed":
        return "❌"
      case "offline":
        return "⚫"
      default:
        return "❓"
    }
  }

  const getProgressColor = () => {
    if (props.agent.progress >= 100) return "bg-green-500"
    if (props.agent.progress >= 60) return "bg-blue-500"
    if (props.agent.progress >= 30) return "bg-yellow-500"
    return "bg-zinc-500"
  }

  return (
    <div class="agent-card p-4 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600/50 transition-colors">
      {/* Header */}
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <div
            class="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
            style={{ "background-color": props.agent.color ?? "#6366f1" }}
          >
            <Show when={props.agent.icon} fallback={props.agent.name.charAt(0)}>
              {props.agent.icon}
            </Show>
          </div>
          <div>
            <div class="font-medium text-white">{props.agent.name}</div>
            <div class="text-xs text-zinc-400">{props.agent.id}</div>
          </div>
        </div>
        <div class={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor()}`}>
          {getStatusIcon()} {props.agent.status}
        </div>
      </div>

      {/* Progress Bar */}
      <div class="mb-3">
        <div class="flex justify-between text-xs text-zinc-400 mb-1">
          <span>Progress</span>
          <span>{props.agent.progress}%</span>
        </div>
        <div class="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            class={`h-full ${getProgressColor()} transition-all duration-300`}
            style={{ width: `${props.agent.progress}%` }}
          />
        </div>
      </div>

      {/* Current Task */}
      <Show when={props.agent.currentTask}>
        <div class="text-xs text-zinc-400 mb-2">
          <span class="text-zinc-500">Current Task:</span>{" "}
          <span class="text-zinc-300">{props.agent.currentTask}</span>
        </div>
      </Show>

      {/* Stats */}
      <div class="flex justify-between text-xs text-zinc-500">
        <span>✅ {props.agent.completedTasks} completed</span>
        <Show when={props.agent.failedTasks > 0}>
          <span class="text-red-400">❌ {props.agent.failedTasks} failed</span>
        </Show>
      </div>
    </div>
  )
}
