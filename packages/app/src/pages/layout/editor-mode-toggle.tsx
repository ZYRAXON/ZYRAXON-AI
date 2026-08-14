import { type Accessor } from "solid-js"
import { editorMode, setEditorMode } from "@/context/editor-mode"

export function EditorModeToggle(props: { directory?: Accessor<string> }) {
  return (
    <div
      class="flex items-center rounded-lg bg-(--background-panel) p-0.5 text-12-regular"
      role="tablist"
      aria-label="Mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!editorMode()}
        class="flex flex-1 items-center justify-center rounded-md px-3 py-1 transition-colors"
        classList={{
          "bg-(--background-primary) text-(--text-primary) shadow-sm": !editorMode(),
          "text-(--text-secondary) hover:text-(--text-primary)": editorMode(),
        }}
        onClick={() => setEditorMode(false)}
      >
        Agent
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={editorMode()}
        class="flex flex-1 items-center justify-center rounded-md px-3 py-1 transition-colors"
        classList={{
          "bg-(--background-primary) text-(--text-primary) shadow-sm": editorMode(),
          "text-(--text-secondary) hover:text-(--text-primary)": !editorMode(),
        }}
        onClick={() => setEditorMode(true, props.directory?.())}
      >
        Editor
      </button>
    </div>
  )
}
