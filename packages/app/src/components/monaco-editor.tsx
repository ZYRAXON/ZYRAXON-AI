import { createEffect, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import type * as Monaco from "monaco-editor"
// Monaco editor CSS loaded at runtime via link tag
let monacoCssLoaded = false
function loadMonacoCss() {
  if (monacoCssLoaded) return
  monacoCssLoaded = true
  const link = document.createElement("link")
  link.rel = "stylesheet"
  link.href = new URL("monaco-editor/min/vs/editor/editor.main.css", import.meta.url).href
  document.head.appendChild(link)
}

let workersConfigured = false
function configureMonacoWorkers() {
  if (workersConfigured) return
  workersConfigured = true

  ;(window as any).MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      const getWorkerModule = (moduleUrl: string) => {
        return new Worker(new URL(moduleUrl, import.meta.url), { type: "module" })
      }
      switch (label) {
        case "json":
          return getWorkerModule("monaco-editor/esm/vs/language/json/json.worker?worker")
        case "css":
        case "scss":
        case "less":
          return getWorkerModule("monaco-editor/esm/vs/language/css/css.worker?worker")
        case "html":
        case "handlebars":
        case "razor":
          return getWorkerModule("monaco-editor/esm/vs/language/html/html.worker?worker")
        case "typescript":
        case "javascript":
          return getWorkerModule("monaco-editor/esm/vs/language/typescript/ts.worker?worker")
        default:
          return getWorkerModule("monaco-editor/esm/vs/editor/editor.worker?worker")
      }
    },
  }
}

export interface MonacoEditorProps {
  value: string
  language?: string
  theme?: string
  readOnly?: boolean
  onChange?: (value: string) => void
  onSave?: (value: string) => void
  path?: string
  height?: string
  class?: string
}

export function MonacoEditor(props: MonacoEditorProps) {
  let containerRef: HTMLDivElement | undefined
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined
  let monaco: typeof import("monaco-editor") | undefined
  let isSyncing = false
  let lastSyncedValue: string | undefined
  let userHasEdited = false
  const [ready, setReady] = createSignal(false)

  // Detect theme from CSS custom property
  const getTheme = () => {
    if (props.theme) return props.theme
    if (typeof document !== "undefined") {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--v2-surface-base").trim()
      // If background is dark-ish, use dark theme
      if (bg && (bg.includes("0.1") || bg.includes("0.2") || bg.includes("0.3") || bg.includes("#1") || bg.includes("#2") || bg.includes("#0"))) {
        return "vs-dark"
      }
    }
    return "vs"
  }

  onMount(async () => {
    if (!containerRef) return

    loadMonacoCss()
    configureMonacoWorkers()
    const monacoModule = await import("monaco-editor")
    monaco = monacoModule

    // Only stop non-editor keyboard events (like global shortcuts), but let paste/cut/undo work
    containerRef.addEventListener("keydown", (e) => {
      // Allow Ctrl/Cmd+Z (undo), Ctrl/Cmd+Y (redo), Ctrl/Cmd+X (cut), Ctrl/Cmd+V (paste)
      const isEditorShortcut = (e.ctrlKey || e.metaKey) && ["z", "y", "x", "v", "c", "a"].includes(e.key.toLowerCase())
      // Allow Ctrl/Cmd+S for save
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s"
      // Allow Delete, Backspace, Enter, Tab, Arrow keys
      const isEditorKey = ["Delete", "Backspace", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)
      // Allow Ctrl+Shift+Z (redo alternative)
      const isRedoAlt = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z"
      
      // Let Monaco handle all editor keys, only stop global app shortcuts
      if (isEditorShortcut || isSave || isEditorKey || isRedoAlt || e.key.length > 1) {
        return // Let it pass through to Monaco
      }
      // Stop character keys from reaching chat input (Monaco handles them)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        return // Monaco will handle typing
      }
      e.stopPropagation()
    }, true)

    editor = monaco.editor.create(containerRef, {
      value: props.value,
      language: props.language || "plaintext",
      theme: getTheme(),
      readOnly: props.readOnly ?? false,
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on",
      smoothScrolling: true,
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      renderLineHighlight: "all",
      bracketPairColorization: { enabled: true },
      padding: { top: 12, bottom: 12 },
      folding: true,
      formatOnPaste: true,
      formatOnType: true,
      // Enable clipboard shortcuts
      copyWithSyntaxHighlighting: true,
      multiCursorModifier: "ctrlCmd",
      // Enable word-based suggestions
      wordBasedSuggestions: "allDocuments",
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
      },
    })

    editor.onDidChangeModelContent(() => {
      if (isSyncing) return
      userHasEdited = true
      const value = editor?.getValue() || ""
      props.onChange?.(value)
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor?.getValue() || ""
      props.onSave?.(value)
    })

    // Auto-focus editor
    editor.focus()
    setReady(true)
  })

  // Click on container focuses the editor (prevents chat from stealing focus)
  const handleClick = () => {
    editor?.focus()
  }

  createEffect(() => {
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (model) {
      if (props.language) {
        monaco.editor.setModelLanguage(model, props.language)
      }
    }
  })

  createEffect(() => {
    if (!editor) return
    const newValue = props.value
    // Skip sync if user has edited since last sync (prevents overwriting user edits)
    if (userHasEdited) {
      // Only sync if the server value is genuinely different from what we last synced
      // (meaning an external change happened, not just our own auto-save bouncing back)
      if (newValue === lastSyncedValue) return
      // Server has a truly different value (external edit) — sync it
      userHasEdited = false
    }
    const currentValue = editor.getValue()
    if (newValue !== currentValue) {
      isSyncing = true
      lastSyncedValue = newValue
      editor.setValue(newValue)
      isSyncing = false
    }
  })

  onCleanup(() => {
    editor?.dispose()
  })

  return (
    <div
      ref={containerRef}
      class={props.class}
      style={{ height: props.height || "100%", width: "100%", "min-height": "300px" }}
      onClick={handleClick}
    />
  )
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    php: "php",
    swift: "swift",
    kt: "kotlin",
    scala: "scala",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    less: "less",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    xml: "xml",
    md: "markdown",
    sql: "sql",
    sh: "shell",
    bash: "shell",
    ps1: "powershell",
    bat: "batch",
    dockerfile: "dockerfile",
    toml: "ini",
    ini: "ini",
    cfg: "ini",
    conf: "ini",
    txt: "plaintext",
    csv: "plaintext",
  }
  return langMap[ext] || "plaintext"
}
