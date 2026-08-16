import { createSignal, Show, type ParentProps } from "solid-js"
import { ResizeHandle } from "@zyraxon-ai/ui/resize-handle"
import { editorMode } from "@/context/editor-mode"

interface SplitEditorLayoutProps {
  /** Left panel - Agent Mode content */
  agentContent: () => any
  /** Right panel - Editor Mode (ZYRAXON Code) */
  editorContent: () => any
  /** Initial editor panel width percentage */
  initialEditorWidth?: number
  /** Minimum editor width percentage */
  minEditorWidth?: number
  /** Maximum editor width percentage */
  maxEditorWidth?: number
}

export function SplitEditorLayout(props: SplitEditorLayoutProps) {
  const [editorWidth, setEditorWidth] = createSignal(props.initialEditorWidth ?? 50)
  const minWidth = props.minEditorWidth ?? 20
  const maxWidth = props.maxEditorWidth ?? 80

  const handleEditorResize = (width: number) => {
    setEditorWidth(width)
  }

  return (
    <div class="flex size-full">
      {/* 
        Layout Structure:
        ┌─────────────────────────────────────────────────────┐
        │                    Main App                          │
        │  ┌──────────┬───────────────────┬───────────────┐ │
        │  │ Sidebar │   Agent Mode      │    Editor     │ │
        │  │          │  (Chat, Prompt)   │   Mode       │ │
        │  │          │                   │  (ZYRAXON    │ │
        │  │          │                   │   Code)       │ │
        │  └──────────┴───────────────────┴───────────────┘ │
        └─────────────────────────────────────────────────────┘
      */}
      
      {/* Agent Mode - Left Panel */}
      <div
        class="flex flex-col overflow-hidden h-full"
        style={{ width: editorMode() ? `${100 - editorWidth()}%` : "100%" }}
      >
        {props.agentContent()}
      </div>

      {/* Editor Mode - Right Panel (ZYRAXON Code) */}
      <Show when={editorMode()}>
        {/* Resize Handle - Drag to resize panels */}
        <ResizeHandle
          direction="horizontal"
          edge="start"
          size={editorWidth()}
          min={minWidth}
          max={maxWidth}
          onResize={handleEditorResize}
          class="shrink-0 w-1 bg-transparent hover:bg-[var(--border-accent-base)] cursor-col-resize transition-colors"
        />

        {/* Editor Panel - ZYRAXON Code (VS Code) embedded */}
        <div
          class="flex flex-col overflow-hidden h-full"
          style={{ width: `${editorWidth()}%` }}
        >
          {props.editorContent()}
        </div>
      </Show>
    </div>
  )
}
