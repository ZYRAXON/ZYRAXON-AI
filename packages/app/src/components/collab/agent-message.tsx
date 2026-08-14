import { type Component, For, Show, createSignal, onMount, onCleanup } from "solid-js"
import type { AgentMessage, AgentInfo } from "@zyraxon-ai/collab"

interface AgentMessageProps {
  message: AgentMessage
  agents: Map<string, AgentInfo>
}

export const AgentMessageBubble: Component<AgentMessageProps> = (props) => {
  const getAgentInfo = () => props.agents.get(props.message.from)

  const getMessageIcon = () => {
    switch (props.message.type) {
      case "task-assign":
        return "📋"
      case "task-update":
        return "🔄"
      case "task-complete":
        return "✅"
      case "task-failed":
        return "❌"
      case "plan-share":
        return "📐"
      case "status-request":
        return "❓"
      case "status-response":
        return "📊"
      case "alert":
        return "⚠️"
      case "broadcast":
        return "📢"
      default:
        return "💬"
    }
  }

  const getAgentColor = () => {
    const agent = getAgentInfo()
    return agent?.color ?? "#6366f1"
  }

  return (
    <div class="agent-message flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
      {/* Agent Avatar */}
      <div
        class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium"
        style={{ "background-color": getAgentColor() }}
      >
        <Show when={getAgentInfo()?.icon} fallback={props.message.from.charAt(0).toUpperCase()}>
          {getAgentInfo()?.icon}
        </Show>
      </div>

      {/* Message Content */}
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-medium text-white text-sm">
            {getAgentInfo()?.name ?? props.message.from}
          </span>
          <span class="text-xs text-zinc-400">{getMessageIcon()}</span>
          <span class="text-xs text-zinc-500">
            {new Date(props.message.timestamp).toLocaleTimeString()}
          </span>
        </div>

        <div class="text-sm text-zinc-300">
          {typeof props.message.payload === "string"
            ? props.message.payload
            : JSON.stringify(props.message.payload)}
        </div>
      </div>
    </div>
  )
}

// Chat message list with agent messages
interface AgentChatProps {
  messages: AgentMessage[]
  agents: Map<string, AgentInfo>
}

export const AgentChat: Component<AgentChatProps> = (props) => {
  let chatRef: HTMLDivElement | undefined

  onMount(() => {
    if (chatRef) {
      chatRef.scrollTop = chatRef.scrollHeight
    }
  })

  return (
    <div ref={chatRef} class="agent-chat flex flex-col gap-2 p-4 overflow-y-auto max-h-[400px]">
      <Show when={props.messages.length > 0}>
        <div class="text-xs text-zinc-500 mb-2">Agent Communications</div>
        <For each={props.messages}>
          {(message) => <AgentMessageBubble message={message} agents={props.agents} />}
        </For>
      </Show>
      <Show when={props.messages.length === 0}>
        <div class="text-center text-zinc-500 text-sm py-8">
          No agent communications yet
        </div>
      </Show>
    </div>
  )
}
