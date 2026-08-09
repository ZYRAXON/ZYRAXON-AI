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
  const [ready, setReady] = createSignal(false)

  onMount(async () => {
    if (!containerRef) return

    loadMonacoCss()
    configureMonacoWorkers()
    const monacoModule = await import("monaco-editor")
    monaco = monacoModule

    editor = monaco.editor.create(containerRef, {
      value: props.value,
      language: props.language || "plaintext",
      theme: props.theme || "vs-dark",
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
      const value = editor?.getValue() || ""
      props.onChange?.(value)
    })

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor?.getValue() || ""
      props.onSave?.(value)
    })

    setReady(true)
  })

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
    const currentValue = editor.getValue()
    if (props.value !== currentValue) {
      editor.setValue(props.value)
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
