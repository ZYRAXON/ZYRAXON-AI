import { createSignal } from "solid-js"

export const [editorMode, setEditorModeSignal] = createSignal(false)

export function setEditorMode(active: boolean, directory?: string) {
  setEditorModeSignal(active)
  window.api?.setEditorMode?.(active, directory)
}
