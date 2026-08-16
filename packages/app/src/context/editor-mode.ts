import { createSignal, onMount } from "solid-js"

export const [editorMode, setEditorModeSignal] = createSignal(false)

// Auto-open editor on app start (can be disabled by user)
export function setEditorMode(active: boolean, directory?: string) {
  setEditorModeSignal(active)
  window.api?.setEditorMode?.(active, directory)
}

// Auto-enable editor mode on startup
export function enableEditorOnStartup() {
  onMount(() => {
    // Small delay to ensure app is loaded
    setTimeout(() => {
      setEditorMode(true)
    }, 100)
  })
}
