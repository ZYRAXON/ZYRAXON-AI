import { createContext, useContext, type JSX } from "solid-js"
import { createStore, produce } from "solid-js/store"

export interface FileEdit {
  path: string
  content: string
  timestamp: number
}

export interface TerminalCommand {
  command: string
  timestamp: number
}

export interface EditorAgentBridgeState {
  /** Files edited in Agent mode that need to be synced to Editor */
  pendingFileEdits: FileEdit[]
  /** Commands run in Agent terminal that should be available in Editor */
  terminalHistory: TerminalCommand[]
  /** Currently open file in Agent mode */
  activeFile: string | undefined
  /** Workspace directory */
  workspaceDir: string | undefined
}

interface EditorAgentBridgeActions {
  /** Add a file edit from Agent mode */
  addFileEdit: (path: string, content: string) => void
  /** Clear pending file edits after they've been synced */
  clearPendingEdits: (paths: string[]) => void
  /** Update active file */
  setActiveFile: (path: string | undefined) => void
  /** Update workspace directory */
  setWorkspaceDir: (dir: string | undefined) => void
  /** Add terminal command to history */
  addTerminalCommand: (command: string) => void
  /** Clear terminal history */
  clearTerminalHistory: () => void
}

export type EditorAgentBridge = EditorAgentBridgeState & EditorAgentBridgeActions

const EditorAgentBridgeContext = createContext<EditorAgentBridge>()

export function EditorAgentBridgeProvider(props: { children: JSX.Element }) {
  const [state, setState] = createStore<EditorAgentBridgeState>({
    pendingFileEdits: [],
    terminalHistory: [],
    activeFile: undefined,
    workspaceDir: undefined,
  })

  const actions: EditorAgentBridgeActions = {
    addFileEdit: (path: string, content: string) => {
      setState(
        produce((draft) => {
          // Remove existing edit for same path
          draft.pendingFileEdits = draft.pendingFileEdits.filter((e) => e.path !== path)
          // Add new edit
          draft.pendingFileEdits.push({
            path,
            content,
            timestamp: Date.now(),
          })
        }),
      )
    },

    clearPendingEdits: (paths: string[]) => {
      setState(
        produce((draft) => {
          draft.pendingFileEdits = draft.pendingFileEdits.filter((e) => !paths.includes(e.path))
        }),
      )
    },

    setActiveFile: (path: string | undefined) => {
      setState("activeFile", path)
    },

    setWorkspaceDir: (dir: string | undefined) => {
      setState("workspaceDir", dir)
    },

    addTerminalCommand: (command: string) => {
      setState(
        produce((draft) => {
          draft.terminalHistory.push({
            command,
            timestamp: Date.now(),
          })
          // Keep only last 100 commands
          if (draft.terminalHistory.length > 100) {
            draft.terminalHistory = draft.terminalHistory.slice(-100)
          }
        }),
      )
    },

    clearTerminalHistory: () => {
      setState("terminalHistory", [])
    },
  }

  const bridge: EditorAgentBridge = {
    ...state,
    ...actions,
  }

  return (
    <EditorAgentBridgeContext.Provider value={bridge}>
      {props.children}
    </EditorAgentBridgeContext.Provider>
  )
}

export function useEditorAgentBridge(): EditorAgentBridge {
  const ctx = useContext(EditorAgentBridgeContext)
  if (!ctx) {
    throw new Error("useEditorAgentBridge must be used within EditorAgentBridgeProvider")
  }
  return ctx
}
