import {
  createContext,
  useContext,
  createSignal,
  createMemo,
  onMount,
  onCleanup,
  type JSX,
} from "solid-js"
import type { AgentInfo } from "@zyraxon-ai/collab"

export interface ZyraxonAgentDef {
  id: string
  name: string
  icon: string
  color: string
  description: string
  capabilities: string[]
  canDelegateTo: string[]
}

export const ZYRAXON_AGENTS: ZyraxonAgentDef[] = [
  {
    id: "auto",
    name: "Auto",
    icon: "AU",
    color: "#00D4FF",
    description: "Full collaboration -- all agents work together",
    capabilities: ["orchestrate", "delegate", "collaborate", "coordinate", "supervise"],
    canDelegateTo: ["build", "plan", "beast", "pro", "apex", "dark-emperor", "pro-builder", "vision"],
  },
  {
    id: "build",
    name: "Build",
    icon: "BL",
    color: "#3B82F6",
    description: "Software engineering -- coding, debugging, refactoring",
    capabilities: ["code", "debug", "refactor", "test", "fix"],
    canDelegateTo: ["plan", "pro", "explore"],
  },
  {
    id: "plan",
    name: "Plan",
    icon: "PL",
    color: "#F59E0B",
    description: "Architecture analysis -- dependency mapping, risk assessment",
    capabilities: ["analysis", "architecture", "planning", "review"],
    canDelegateTo: ["build", "explore"],
  },
  {
    id: "beast",
    name: "Beast",
    icon: "BE",
    color: "#FF4500",
    description: "Deep warfare coding -- subagent delegation, self-evolution",
    capabilities: ["deep-code", "subagent", "auto-fix", "aggressive"],
    canDelegateTo: ["build", "plan", "pro", "explore", "dark-emperor"],
  },
  {
    id: "pro",
    name: "PRO",
    icon: "PR",
    color: "#FFD700",
    description: "Professional intelligence -- pattern learning, code synthesis",
    capabilities: ["quality", "patterns", "synthesis", "optimize"],
    canDelegateTo: ["build", "plan", "explore"],
  },
  {
    id: "apex",
    name: "APEX PREDATOR",
    icon: "AP",
    color: "#FF0000",
    description: "Predatory intelligence -- tool synthesis, self-optimization",
    capabilities: ["predict", "synthesize", "optimize", "hunt"],
    canDelegateTo: ["build", "plan", "pro", "beast", "explore"],
  },
  {
    id: "dark-emperor",
    name: "DARK EMPEROR",
    icon: "DE",
    color: "#8B0000",
    description: "Supreme sovereign -- reality warping, quantum omniscience",
    capabilities: ["warp", "omniscient", "annihilate", "supreme"],
    canDelegateTo: ["build", "plan", "beast", "pro", "apex", "vision", "pro-builder", "explore"],
  },
  {
    id: "pro-builder",
    name: "PRO BUILDER",
    icon: "PB",
    color: "#10B981",
    description: "Website genesis -- natural language to complete websites",
    capabilities: ["website", "deploy", "seo", "ui", "design"],
    canDelegateTo: ["build", "pro", "vision", "explore"],
  },
  {
    id: "vision",
    name: "VISION",
    icon: "VI",
    color: "#8B5CF6",
    description: "AI's Eyes -- real-time screen awareness and memory",
    capabilities: ["vision", "screen", "analysis", "observe"],
    canDelegateTo: ["build", "plan", "explore"],
  },
  {
    id: "general",
    name: "General",
    icon: "GN",
    color: "#6B7280",
    description: "General-purpose sub-agent -- unlimited spawn, any role via custom prompt",
    capabilities: ["research", "analysis", "code", "any-task"],
    canDelegateTo: [],
  },
]

export interface InterAgentMessage {
  id: string
  from: string
  to: string
  type: "task-request" | "task-response" | "delegate" | "data-share" | "status-update" | "help-request" | "help-response" | "broadcast" | "thinking" | "action" | "result"
  content: string
  data?: unknown
  timestamp: number
  visible: boolean
}

export interface OrchestratorTask {
  id: string
  title: string
  description: string
  assignedTo: string
  status: "pending" | "routing" | "in-progress" | "review" | "done" | "failed"
  progress: number
  createdBy: string
  delegatedBy?: string
  dependencies: string[]
  subtasks: string[]
  result?: unknown
  error?: string
  createdAt: number
  updatedAt: number
}

export interface AgentActivity {
  id: string
  agentId: string
  type: "thinking" | "speaking" | "delegating" | "working" | "result" | "error" | "spawn" | "subtask"
  content: string
  timestamp: number
  taskId?: string
  mentions?: string[]
}

export interface SubAgent {
  id: string
  parentId: string
  name: string
  task: string
  status: "running" | "completed" | "failed"
  progress: number
  createdAt: number
  completedAt?: number
  result?: unknown
}

interface CollabContextValue {
  agents: () => ZyraxonAgentDef[]
  agentStates: () => Map<string, AgentInfo>
  getAgentState: (id: string) => AgentInfo | undefined
  getAgentDef: (id: string) => ZyraxonAgentDef | undefined
  selectedAgent: () => string | null
  selectAgent: (id: string | null) => void
  messages: () => InterAgentMessage[]
  sendMessage: (msg: Omit<InterAgentMessage, "id" | "timestamp">) => void
  tasks: () => OrchestratorTask[]
  assignTask: (title: string, description: string, targetAgent: string, createdBy: string, options?: { delegate?: boolean; dependencies?: string[] }) => string
  updateTask: (taskId: string, update: Partial<OrchestratorTask>) => void
  completeTask: (taskId: string, result: unknown) => void
  failTask: (taskId: string, error: string) => void
  activities: () => AgentActivity[]
  addActivity: (activity: Omit<AgentActivity, "id" | "timestamp">) => void
  routeTask: (userMessage: string) => string
  updateAgentStatus: (agentId: string, status: Partial<AgentInfo>) => void
  dashboardOpen: () => boolean
  setDashboardOpen: (open: boolean) => void
  toggleDashboard: () => void
  overallProgress: () => number
  statusSummary: () => { working: number; idle: number; failed: number }
  taskStats: () => { total: number; completed: number; inProgress: number; failed: number }
}

const CollabContext = createContext<CollabContextValue>()

export function useCollab(): CollabContextValue {
  const context = useContext(CollabContext)
  if (!context) {
    throw new Error("useCollab must be used within a CollabProvider")
  }
  return context
}

function determineAgent(userMessage: string, currentAgent: string | null): string {
  const msg = userMessage.toLowerCase()
  if (currentAgent === "auto") return "auto"
  if (currentAgent) return currentAgent
  if (msg.includes("ওয়েবসাইট") || msg.includes("website") || msg.includes("web page") || msg.includes("landing page") || msg.includes("html") || msg.includes("css") || msg.includes("frontend")) return "pro-builder"
  if (msg.includes("প্ল্যান") || msg.includes("plan") || msg.includes("architecture") || msg.includes("বিশ্লেষণ") || msg.includes("analyze") || msg.includes("review") || msg.includes("পরিকল্পনা")) return "plan"
  if (msg.includes("fix") || msg.includes("bug") || msg.includes("error") || msg.includes("সমস্যা") || msg.includes("debug") || msg.includes("ত্রুটি")) return "build"
  if (msg.includes("quality") || msg.includes("optimize") || msg.includes("refactor") || msg.includes("মান") || msg.includes("পেশাদার")) return "pro"
  if (msg.includes("aggressive") || msg.includes("deep") || msg.includes("full") || msg.includes("সব") || msg.includes("পুরো")) return "beast"
  if (msg.includes("screen") || msg.includes("স্ক্রিন") || msg.includes("screenshot") || msg.includes("visible") || msg.includes("দেখাও")) return "vision"
  return "build"
}

export function CollabProvider(props: { children: JSX.Element }) {
  const [agentStates, setAgentStates] = createSignal<Map<string, AgentInfo>>(
    new Map(
      ZYRAXON_AGENTS.map((def) => [
        def.id,
        {
          id: def.id,
          name: def.name,
          icon: def.icon,
          color: def.color,
          status: "idle" as const,
          progress: 0,
          completedTasks: 0,
          failedTasks: 0,
          lastActive: Date.now(),
        },
      ]),
    ),
  )

  const [selectedAgent, setSelectedAgent] = createSignal<string | null>(null)
  const [messages, setMessages] = createSignal<InterAgentMessage[]>([])
  const [tasks, setTasks] = createSignal<OrchestratorTask[]>([])
  const [activities, setActivities] = createSignal<AgentActivity[]>([])
  const [dashboardOpen, setDashboardOpen] = createSignal(false)

  const agents = () => ZYRAXON_AGENTS
  const getAgentState = (id: string) => agentStates().get(id)
  const getAgentDef = (id: string) => ZYRAXON_AGENTS.find((a) => a.id === id)

  const updateAgentStatus = (agentId: string, update: Partial<AgentInfo>) => {
    setAgentStates((prev) => {
      const next = new Map(prev)
      const existing = next.get(agentId)
      if (existing) {
        next.set(agentId, { ...existing, ...update, lastActive: Date.now() })
      }
      return next
    })
  }

  const addActivity = (activity: Omit<AgentActivity, "id" | "timestamp">) => {
    const full: AgentActivity = {
      ...activity,
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    }
    setActivities((prev) => [...prev.slice(-100), full])
  }

  const sendMessage = (msg: Omit<InterAgentMessage, "id" | "timestamp">) => {
    const fullMsg: InterAgentMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    }
    setMessages((prev) => [...prev.slice(-200), fullMsg])
    if (msg.to !== "*") {
      updateAgentStatus(msg.from, { status: "working" })
      updateAgentStatus(msg.to, { status: "waiting" })
    }
    if (msg.visible) {
      addActivity({
        agentId: msg.from,
        type: msg.type === "delegate" ? "delegating" : msg.type === "thinking" ? "thinking" : msg.type === "result" ? "result" : "speaking",
        content: msg.content,
      })
    }
  }

  const routeTask = (userMessage: string): string => {
    return determineAgent(userMessage, selectedAgent())
  }

  const assignTask = (
    title: string,
    description: string,
    targetAgent: string,
    createdBy: string,
    options?: { delegate?: boolean; dependencies?: string[] },
  ): string => {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const task: OrchestratorTask = {
      id, title, description, assignedTo: targetAgent,
      status: "in-progress", progress: 0, createdBy,
      delegatedBy: createdBy, dependencies: options?.dependencies ?? [],
      subtasks: [], createdAt: now, updatedAt: now,
    }
    setTasks((prev) => [...prev, task])
    updateAgentStatus(targetAgent, { status: "working", currentTask: title })
    sendMessage({
      from: createdBy, to: targetAgent, type: "task-request",
      content: `Task: ${title}`, data: { taskId: id, description }, visible: true,
    })
    return id
  }

  const delegateTask = (fromAgent: string, toAgent: string, taskTitle: string, taskDescription: string): string => {
    const taskId = assignTask(taskTitle, taskDescription, toAgent, fromAgent, { delegate: true })
    setTasks((prev) =>
      prev.map((t) =>
        t.assignedTo === fromAgent ? { ...t, subtasks: [...t.subtasks, taskId], updatedAt: Date.now() } : t,
      ),
    )
    sendMessage({
      from: fromAgent, to: toAgent, type: "delegate",
      content: `Delegated: ${taskTitle}`, data: { parentAgent: fromAgent, taskId }, visible: true,
    })
    return taskId
  }

  const updateTask = (taskId: string, update: Partial<OrchestratorTask>) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, ...update, updatedAt: Date.now() } : t))
  }

  const completeTask = (taskId: string, result: unknown) => {
    const task = tasks().find((t) => t.id === taskId)
    if (!task) return
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "done", progress: 100, result, updatedAt: Date.now() } : t))
    const agent = getAgentState(task.assignedTo)
    if (agent) {
      updateAgentStatus(task.assignedTo, { status: "idle", completedTasks: agent.completedTasks + 1, currentTask: undefined })
    }
    sendMessage({ from: task.assignedTo, to: task.createdBy, type: "task-response", content: `Completed: ${task.title}`, data: { taskId, result }, visible: true })
    addActivity({ agentId: task.assignedTo, type: "result", content: `${task.title} -- done`, taskId })
  }

  const failTask = (taskId: string, error: string) => {
    const task = tasks().find((t) => t.id === taskId)
    if (!task) return
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "failed", error, updatedAt: Date.now() } : t))
    const agent = getAgentState(task.assignedTo)
    if (agent) {
      updateAgentStatus(task.assignedTo, { status: "failed", failedTasks: agent.failedTasks + 1, currentTask: undefined })
    }
    sendMessage({ from: task.assignedTo, to: task.createdBy, type: "task-response", content: `Failed: ${task.title} -- ${error}`, data: { taskId, error }, visible: true })
    addActivity({ agentId: task.assignedTo, type: "error", content: `${task.title} -- ${error}`, taskId })
  }

  const overallProgress = createMemo(() => {
    const allAgents = Array.from(agentStates().values())
    if (allAgents.length === 0) return 0
    const total = allAgents.reduce((sum, a) => sum + a.progress, 0)
    return Math.round(total / allAgents.length)
  })

  const statusSummary = createMemo(() => {
    const allAgents = Array.from(agentStates().values())
    return {
      working: allAgents.filter((a) => a.status === "working").length,
      idle: allAgents.filter((a) => a.status === "idle").length,
      failed: allAgents.filter((a) => a.status === "failed").length,
    }
  })

  const taskStats = createMemo(() => {
    const allTasks = tasks()
    return {
      total: allTasks.length,
      completed: allTasks.filter((t) => t.status === "done").length,
      inProgress: allTasks.filter((t) => t.status === "in-progress").length,
      failed: allTasks.filter((t) => t.status === "failed").length,
    }
  })

  onMount(() => {
    ZYRAXON_AGENTS.forEach((def) => {
      updateAgentStatus(def.id, { status: "idle" })
    })

    const trackedSessions = new Map<string, string>()
    const messageToSession = new Map<string, string>()

    const handleSubagentEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return

      if (detail.type === "created" && detail.parentID) {
        const agentName = (detail.agent ?? detail.title ?? "").toLowerCase()
        let agentId = "auto"
        if (agentName.includes("pro-builder") || agentName.includes("pro_builder")) agentId = "pro-builder"
        else if (agentName.includes("beast")) agentId = "beast"
        else if (agentName.includes("vision")) agentId = "vision"
        else if (agentName.includes("dark-emperor") || agentName.includes("dark_emperor")) agentId = "dark-emperor"
        else if (agentName.includes("apex") || agentName.includes("apex-predator")) agentId = "apex"
        else if (agentName.includes("plan")) agentId = "plan"
        else if (agentName.includes("build")) agentId = "build"
        else if (agentName.includes("general")) agentId = "general"
        else if (agentName.includes("explore")) agentId = "explore"
        else if (agentName.includes("pro")) agentId = "pro"

        if (!agentStates().has(agentId) && agentId !== "auto") {
          updateAgentStatus(agentId, { status: "idle" })
        }

        trackedSessions.set(detail.sessionID, agentId)
        updateAgentStatus(agentId, { status: "working", currentTask: detail.title ?? "Working..." })
        addActivity({ agentId, type: "spawn", content: `${agentId} started -- ${detail.title ?? "working"}` })
      }

      if (detail.type === "status") {
        const agentId = trackedSessions.get(detail.sessionID)
        if (!agentId) return
        const status = detail.status
        if (status?.type === "busy") {
          updateAgentStatus(agentId, { status: "working" })
          addActivity({ agentId, type: "working", content: `${agentId} is working...` })
        } else if (status?.type === "idle") {
          updateAgentStatus(agentId, { status: "idle" })
          addActivity({ agentId, type: "result", content: `${agentId} completed its task` })
        }
      }

      if (detail.type === "part-updated") {
        const sessionID = messageToSession.get(detail.messageID)
        const agentId = sessionID ? trackedSessions.get(sessionID) : undefined
        if (!agentId) return
        if (detail.partType === "tool-call") {
          addActivity({ agentId, type: "working", content: `${agentId} executing tool...` })
        } else if (detail.partType === "tool-result") {
          addActivity({ agentId, type: "result", content: `${agentId} received tool result` })
        }
      }

      if (detail.type === "message-mapping") {
        messageToSession.set(detail.messageID, detail.sessionID)
      }
    }

    window.addEventListener("zyraxon:subagent-event", handleSubagentEvent)

    onCleanup(() => {
      window.removeEventListener("zyraxon:subagent-event", handleSubagentEvent)
    })
  })

  const value: CollabContextValue & { delegateTask: typeof delegateTask } = {
    agents,
    agentStates,
    getAgentState,
    getAgentDef,
    selectedAgent,
    selectAgent: setSelectedAgent,
    messages,
    sendMessage,
    tasks,
    assignTask,
    updateTask,
    completeTask,
    failTask,
    activities,
    addActivity,
    routeTask,
    updateAgentStatus,
    dashboardOpen,
    setDashboardOpen,
    toggleDashboard: () => setDashboardOpen((prev) => !prev),
    overallProgress,
    statusSummary,
    taskStats,
    delegateTask,
  }

  return <CollabContext.Provider value={value}>{props.children}</CollabContext.Provider>
}
