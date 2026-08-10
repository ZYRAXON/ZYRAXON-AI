/**
 * ZYRAXON Extension Host IPC Handler
 *
 * Bridges Electron main process with the VS Code extension host.
 * Uses extension-manager for installation data + vscode-host for VS Code API shim.
 *
 * Architecture:
 * ┌──────────────────────┐         ┌──────────────────────────────┐
 * │   ZYRAXON Main       │   IPC   │   Extension Host             │
 * │   (Electron Main)    │◄───────►│   (Main Process)             │
 * │                      │         │                              │
 * │  - Extension Manager │         │  - VS Code API shim          │
 * │  - UI / Marketplace  │         │  - Extension activation      │
 * │  - Install/Uninstall │         │  - Language features         │
 * └──────────────────────┘         └──────────────────────────────┘
 */

import { ipcMain } from "electron"
import { join } from "node:path"
import { app } from "electron"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import Module from "node:module"

// ─── VS Code Host Path ──────────────────────────────────────────────────────
// Resolve vscode-host relative to the app root.
// In dev: packages/desktop/vscode-host/
// In packaged app: the build copies vscode-host/ alongside the app.
function getVscodeHostPath(): string {
  // Dev mode: relative to __dirname (out/main/)
  const devPath = join(__dirname, "..", "..", "vscode-host")
  if (existsSync(devPath)) return devPath
  // Packaged: relative to app root
  const packedPath = join(process.resourcesPath, "vscode-host")
  if (existsSync(packedPath)) return packedPath
  // Fallback: try __dirname directly (if bundled alongside)
  return devPath
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExtensionInfo {
  id: string
  name: string
  displayName?: string
  description?: string
  version: string
  publisher: string
  main?: string
  activationEvents?: string[]
  contributes?: any
  extensionPath: string
  isActive: boolean
  icon?: string
}

// ─── State ───────────────────────────────────────────────────────────────────

const activatedExtensions = new Set<string>()
let extensionMap = new Map<string, ExtensionInfo>()

// ─── Extension-Registered Models (Provider Extensions) ──────────────────────
// Provider extensions (OpenRouter, etc.) register their models here.
// These get merged into the renderer's model selector via IPC.

interface RegisteredModel {
  providerID: string
  modelID: string
  name: string
  description?: string
  contextLength?: number
  cost?: { input: number; output: number }
}

const registeredModels = new Map<string, RegisteredModel[]>()

function getRegisteredModelsPath(): string {
  return join(app.getPath("userData"), "extensions", "registered-models.json")
}

function loadRegisteredModels(): void {
  try {
    const modelsPath = getRegisteredModelsPath()
    if (existsSync(modelsPath)) {
      const data = JSON.parse(readFileSync(modelsPath, "utf-8"))
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (entry.providerID && Array.isArray(entry.models)) {
            registeredModels.set(entry.providerID, entry.models)
          }
        }
      }
      console.log(`[ExtHost] Loaded ${registeredModels.size} provider model registrations`)
    }
  } catch (e: any) {
    console.warn(`[ExtHost] Failed to load registered models: ${e.message}`)
  }
}

function saveRegisteredModels(): void {
  try {
    const modelsPath = getRegisteredModelsPath()
    const data = Array.from(registeredModels.entries()).map(([providerID, models]) => ({
      providerID,
      models,
    }))
    const { writeFileSync, mkdirSync } = require("node:fs")
    const dir = join(app.getPath("userData"), "extensions")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(modelsPath, JSON.stringify(data, null, 2))
  } catch (e: any) {
    console.warn(`[ExtHost] Failed to save registered models: ${e.message}`)
  }
}

export function getExtensionRegisteredModels(): Array<{ providerID: string; models: RegisteredModel[] }> {
  return Array.from(registeredModels.entries()).map(([providerID, models]) => ({
    providerID,
    models,
  }))
}

function getActivationStatePath(): string {
  return join(app.getPath("userData"), "extensions", "activation-state.json")
}

function loadActivationState(): void {
  try {
    const statePath = getActivationStatePath()
    if (existsSync(statePath)) {
      const data = JSON.parse(readFileSync(statePath, "utf-8"))
      if (Array.isArray(data.activated)) {
        for (const id of data.activated) {
          if (extensionMap.has(id)) activatedExtensions.add(id)
        }
      }
      console.log(`[ExtHost] Loaded activation state: ${activatedExtensions.size} extensions`)
    }
  } catch (e: any) {
    console.warn(`[ExtHost] Failed to load activation state: ${e.message}`)
  }
}

function saveActivationState(): void {
  try {
    const statePath = getActivationStatePath()
    const data = { activated: Array.from(activatedExtensions) }
    const { writeFileSync, mkdirSync } = require("node:fs")
    const dir = join(app.getPath("userData"), "extensions")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(statePath, JSON.stringify(data, null, 2))
  } catch (e: any) {
    console.warn(`[ExtHost] Failed to save activation state: ${e.message}`)
  }
}

function getManifestStatusPath(): string {
  return join(app.getPath("userData"), "extensions", "installed.json")
}

function loadManifestActiveExtensions(): string[] {
  try {
    const manifestPath = getManifestStatusPath()
    if (existsSync(manifestPath)) {
      const raw = JSON.parse(readFileSync(manifestPath, "utf-8"))
      // installed.json may be {value: [...], Count: N} or a plain array
      const data = Array.isArray(raw) ? raw : (raw?.value ?? (Array.isArray(raw) ? raw : []))
      if (Array.isArray(data)) {
        return data.filter((e: any) => e.status === "active").map((e: any) => e.id)
      }
    }
  } catch {}
  return []
}

// ─── Extension Scanner ───────────────────────────────────────────────────────
// Scans installed extensions from the extensions directory.
// Reads package.json like VS Code does.

function scanExtensions(): Map<string, ExtensionInfo> {
  const extensions = new Map<string, ExtensionInfo>()
  const extensionsDir = join(app.getPath("userData"), "extensions")

  if (!existsSync(extensionsDir)) {
    console.log("[ExtHost] Extensions directory not found:", extensionsDir)
    return extensions
  }

  const items = readdirSync(extensionsDir)

  for (const item of items) {
    if (item === "installed.json") continue
    const extensionPath = join(extensionsDir, item)
    const packageJsonPath = join(extensionPath, "package.json")

    if (!existsSync(packageJsonPath)) continue

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))

      if (!packageJson.engines?.vscode) {
        // Still include extensions without engines.vscode — they may be ZYRAXON-native
        // Only skip if there's truly no useful info
        if (!packageJson.displayName && !packageJson.name) continue
      }

      let icon = packageJson.icon || packageJson.contributes?.icon || ""
      // Convert relative icon path to data URI
      if (icon && !icon.startsWith("data:") && !icon.startsWith("http")) {
        const iconPath = join(extensionPath, icon)
        if (existsSync(iconPath)) {
          try {
            const iconBuffer = readFileSync(iconPath)
            const ext = icon.split(".").pop()?.toLowerCase() || "png"
            const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"
            icon = `data:${mime};base64,${iconBuffer.toString("base64")}`
          } catch {}
        }
      }
      // If no icon from package.json, scan for common icon files
      if (!icon) {
        const iconCandidates = [
          "icon.png", "icon.svg", "icon.jpg", "icon.jpeg", "icon.ico",
          "assets/icon.png", "assets/icon.svg", "images/icon.png",
          "resources/icon.png", "media/icon.png",
          "resource/icon.png", "resource/images/icon.png",
        ]
        for (const candidate of iconCandidates) {
          const iconPath = join(extensionPath, candidate)
          if (existsSync(iconPath)) {
            try {
              const { readFileSync: readFs } = require("node:fs")
              const iconBuffer = readFs(iconPath)
              const ext = candidate.split(".").pop()?.toLowerCase() || "png"
              const mime = ext === "svg" ? "image/svg+xml" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png"
              icon = `data:${mime};base64,${iconBuffer.toString("base64")}`
            } catch {}
            break
          }
        }
      }

      const ext: ExtensionInfo = {
        id: `${packageJson.publisher}.${packageJson.name}`,
        name: packageJson.name,
        displayName: packageJson.displayName,
        description: packageJson.description,
        version: packageJson.version,
        publisher: packageJson.publisher || "unknown",
        main: packageJson.main,
        activationEvents: packageJson.activationEvents || [],
        contributes: packageJson.contributes || {},
        extensionPath,
        isActive: false,
        icon,
      }

      extensions.set(ext.id, ext)
      console.log(`[ExtHost] Found: ${ext.displayName || ext.name} v${ext.version}`)
    } catch {
      // Skip invalid extensions
    }
  }

  return extensions
}

// ─── Robust Extension Lookup ─────────────────────────────────────────────────
// Extension IDs may be "chatgpt-ai" (installed.json) or "YaleHuang.chatgpt-ai"
// (scanner). Try exact match, then name-only fallback.
function findExtension(extensionId: string): ExtensionInfo | undefined {
  const exact = extensionMap.get(extensionId)
  if (exact) return exact
  for (const [, ext] of extensionMap) {
    if (ext.name === extensionId || ext.id.endsWith(`.${extensionId}`)) return ext
  }
  return undefined
}

// ─── VS Code API Shim Injection ───────────────────────────────────────────────
// Extensions call require("vscode") internally. We must intercept this via
// Module._load so the shim is available without the extension knowing.

let vscodeShimInjected = false

function createVSCodeShim(): any {
  const shim = {
    window: {
      showInformationMessage: async (message: string, ...items: any[]) => {
        console.log(`[ExtHost] Info: ${message}`)
        return items[0]
      },
      showWarningMessage: async (message: string, ...items: any[]) => {
        console.log(`[ExtHost] Warning: ${message}`)
        return items[0]
      },
      showErrorMessage: async (message: string, ...items: any[]) => {
        console.error(`[ExtHost] Error: ${message}`)
        return items[0]
      },
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      createStatusBarItem: () => ({
        text: "", tooltip: "", show() {}, hide() {}, dispose() {},
        backgroundColor: undefined, color: undefined, alignment: 1, priority: 0, command: undefined,
      }),
      createOutputChannel: (name: string) => ({
        appendLine() {}, append() {}, show() {}, hide() {}, dispose() {}, clear() {}, name,
      }),
      createTerminal: (options?: any) => ({
        sendText() {}, show() {}, hide() {}, dispose() {}, name: options?.name || "Terminal",
        creationOptions: {}, processReady: Promise.resolve(), exitStatus: undefined,
        state: { isInteractedWith: false },
      }),
      withProgress: async (options: any, task: any) => task({ report() {} }),
      registerTreeDataProvider: () => ({ dispose() {} }),
      createWebviewPanel: (viewType: string, title: string, _showOptions: any, _options?: any) => ({
        webview: {
          html: "", options: {}, cspSource: "",
          asWebviewUri: (uri: any) => uri,
          onDidReceiveMessage: () => ({ dispose() {} }),
          postMessage: async () => true,
        },
        reveal() {}, dispose() {}, onDidDispose: () => ({ dispose() {} }),
        title, viewType,
      }),
      onDidChangeActiveTextEditor: () => ({ dispose() {} }),
      onDidChangeVisibleTextEditors: () => ({ dispose() {} }),
      onDidChangeTextEditorSelection: () => ({ dispose() {} }),
      onDidChangeTextEditorVisibleRanges: () => ({ dispose() {} }),
      onDidChangeTextEditorOptions: () => ({ dispose() {} }),
      onDidChangeTextEditorDocument: () => ({ dispose() {} }),
      onDidChangeWindowState: () => ({ dispose() {} }),
      activeTextEditor: undefined,
      visibleTextEditors: [],
      tabGroups: {
        groups: [],
        activeTabGroup: undefined,
        onDidChangeTabGroups: () => ({ dispose() {} }),
        onDidChangeTabGroup: () => ({ dispose() {} }),
      },
      state: { focused: true },
      registerCommand: (command: string, callback?: Function) => {
        console.log(`[ExtHost] Command registered: ${command}`)
        return { dispose() {} }
      },
      registerTextEditorCommand: () => ({ dispose() {} }),
      createTreeView: () => ({ dispose() {}, reveal() {} }),
      registerWebviewViewProvider: (_id: string, _provider: any, _options?: any) => ({ dispose() {} }),
      registerCustomEditorProvider: (_id: string, _provider: any, _options?: any) => ({ dispose() {} }),
      process: { platform: process.platform, arch: process.arch, versions: { node: process.versions.node } },
    },
    workspace: {
      getConfiguration: (section?: string) => ({
        get: (key: string, defaultValue?: any) => defaultValue,
        has: () => false,
        inspect: () => undefined,
        update: async () => {},
      }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
      workspaceFolders: [],
      asRelativePath: (pathOrUri: any, includeWorkspaceFolder?: boolean) =>
        typeof pathOrUri === "string" ? pathOrUri : pathOrUri?.fsPath || "",
      findFiles: async () => [],
      createFileSystemWatcher: () => ({ dispose() {}, onDidCreate: () => ({ dispose() {} }), onDidChange: () => ({ dispose() {} }), onDidDelete: () => ({ dispose() {} }) }),
      openTextDocument: async () => ({
        getText() { return "" },
        lineAt() { return { text: "", range: {}, rangeIncludingLineBreak: {}, firstNonWhitespaceCharacterIndex: 0, isEmptyOrWhitespace: true } },
        lineCount: 0, uri: { fsPath: "", scheme: "file" },
        save: async () => true, eol: 1, fileName: "", isDirty: false, isUntitled: false, languageId: "", version: 0,
        getWordRangeAtPosition: () => undefined, getPositionAt: () => ({}), offsetAt: () => 0, positionAt: () => ({}),
      }),
      fs: {
        readFile: async () => Buffer.alloc(0),
        writeFile: async () => {},
        stat: async () => ({ type: 0, ctime: 0, mtime: 0, size: 0, permissions: 0 }),
        readDirectory: async () => [],
        createDirectory: async () => {},
        delete: async () => {},
        rename: async () => {},
        copy: async () => {},
        access: async () => {},
      },
      onDidSaveTextDocument: () => ({ dispose() {} }),
      onDidCreateFiles: () => ({ dispose() {} }),
      onDidDeleteFiles: () => ({ dispose() {} }),
      onDidRenameFiles: () => ({ dispose() {} }),
      onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
      applyEdit: async () => true,
      textDocuments: [],
      onDidOpenTextDocument: () => ({ dispose() {} }),
      onDidCloseTextDocument: () => ({ dispose() {} }),
      onDidChangeTextDocument: () => ({ dispose() {} }),
      onWillSaveTextDocument: () => ({ dispose() {} }),
      onWillSaveTextDocumentWaitUntil: () => ({ dispose() {} }),
      getWorkspaceFolder: () => undefined,
      onDidGrantWorkspaceTrust: () => ({ dispose() {} }),
    },
    commands: {
      registerCommand: (command: string, callback?: Function) => {
        console.log(`[ExtHost] Command registered: ${command}`)
        return { dispose() {} }
      },
      registerTextEditorCommand: () => ({ dispose() {} }),
      executeCommand: async (command: string, ...args: any[]) => {
        console.log(`[ExtHost] Command executed: ${command}`)
        return undefined
      },
      getCommands: async () => [],
    },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      registerHoverProvider: () => ({ dispose() {} }),
      registerDefinitionProvider: () => ({ dispose() {} }),
      registerReferenceProvider: () => ({ dispose() {} }),
      registerDocumentFormattingEditProvider: () => ({ dispose() {} }),
      registerDocumentRangeFormattingEditProvider: () => ({ dispose() {} }),
      registerSignatureHelpProvider: () => ({ dispose() {} }),
      registerCodeActionsProvider: () => ({ dispose() {} }),
      registerCodeLensProvider: () => ({ dispose() {} }),
      registerDocumentSemanticTokensProvider: () => ({ dispose() {} }),
      registerInlayHintsProvider: () => ({ dispose() {} }),
      registerTypeDefinitionProvider: () => ({ dispose() {} }),
      registerDeclarationProvider: () => ({ dispose() {} }),
      registerImplementationProvider: () => ({ dispose() {} }),
      registerDocumentHighlightProvider: () => ({ dispose() {} }),
      registerDocumentSymbolProvider: () => ({ dispose() {} }),
      registerWorkspaceSymbolProvider: () => ({ dispose() {} }),
      registerRenameProvider: () => ({ dispose() {} }),
      registerSelectionRangeProvider: () => ({ dispose() {} }),
      registerCallHierarchyProvider: () => ({ dispose() {} }),
      registerTypeHierarchyProvider: () => ({ dispose() {} }),
      registerLinkedEditingRangeProvider: () => ({ dispose() {} }),
      registerOnTypeFormattingEditProvider: () => ({ dispose() {} }),
      registerDocumentDropEditProvider: () => ({ dispose() {} }),
      registerDocumentDropEdit: () => ({ dispose() {} }),
      match: () => 0,
      getLanguages: () => [],
      getDiagnostics: () => [],
      onDidChangeDiagnostics: () => ({ dispose() {} }),
      onDidChangeDiagnosticLanguage: () => ({ dispose() {} }),
      createDiagnosticCollection: () => ({ set() {}, delete() {}, clear() {}, dispose() {}, entries: () => [], get: () => [], has: () => false, size: 0, name: "" }),
      registerCodeLensSupport: () => ({ dispose() {} }),
    },
    extensions: {
      getExtension: (extensionId: string) => {
        const found = findExtension(extensionId)
        if (found) {
          return {
            id: found.id,
            extensionPath: found.extensionPath,
            packageJSON: { ...found, main: found.main, activationEvents: found.activationEvents, contributes: found.contributes },
            isActive: activatedExtensions.has(found.id),
            exports: undefined,
          }
        }
        return undefined
      },
      get all() {
        return Array.from(extensionMap.values()).map((e) => ({
          id: e.id,
          extensionPath: e.extensionPath,
          packageJSON: { ...e, main: e.main },
          isActive: activatedExtensions.has(e.id),
          exports: undefined,
        }))
      },
    },
    env: {
      appName: "ZYRAXON",
      appRoot: process.cwd(),
      language: process.env.LANG || "en",
      machineId: "zyraxon-machine",
      sessionId: `zyraxon-${Date.now()}`,
      uriScheme: "zyraxon",
      openExternal: async () => {},
      clipboard: { writeText: async () => {}, readText: async () => "" },
      asExternalUri: async (uri: any) => uri,
      remoteName: undefined,
    },
    Uri: {
      file: (f: string) => ({ fsPath: f, scheme: "file", authority: "", path: f, query: "", fragment: "", with: () => ({}), toString() { return f } }),
      parse: (s: string) => ({ fsPath: s, scheme: "file", authority: "", path: s, query: "", fragment: "", with: () => ({}), toString() { return s } }),
      joinPath: (...parts: any[]) => {
        const paths = parts.map((p) => (p && p.fsPath) || String(p))
        const joined = paths.join("/")
        return { fsPath: joined, scheme: "file", authority: "", path: joined, query: "", fragment: "", toString() { return joined } }
      },
      from: (components: any) => ({ fsPath: components.path || "", scheme: components.scheme || "file", authority: components.authority || "", query: components.query || "", fragment: components.fragment || "", toString() { return components.path || "" } }),
    },
    Position: function (this: any, line: number, character: number) { this.line = line; this.character = character } as any,
    Range: function (this: any, ...args: any[]) {} as any,
    Selection: function (this: any, ...args: any[]) {} as any,
    Location: function (this: any, uri: any, rangeOrPosition: any) {} as any,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItemKind: { Text: 1, Method: 2, Function: 3, Constructor: 4, Field: 5, Variable: 6, Class: 7, Interface: 8, Module: 9, Property: 10, Unit: 11, Value: 12, Enum: 13, Keyword: 14, Snippet: 15, Color: 16, File: 17, Reference: 18 },
    SymbolKind: { File: 1, Module: 2, Namespace: 3, Package: 4, Class: 5, Method: 6, Property: 7, Field: 8, Constructor: 9, Enum: 10, Interface: 11, Function: 12, Variable: 13, Constant: 14 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    Disposable: function (this: any, callOnDispose?: Function) { this._callOnDispose = callOnDispose; this.dispose = () => { callOnDispose && callOnDispose() } } as any,
    EventEmitter: function (this: any) {
      const listeners: Function[] = []
      this._listeners = listeners
      this.event = (listener: Function) => { listeners.push(listener); return { dispose() { const idx = listeners.indexOf(listener); if (idx >= 0) listeners.splice(idx, 1) } } }
      this.fire = (e: any) => { listeners.forEach((l) => l(e)) }
      this.dispose = () => { listeners.length = 0 }
    } as any,
    MarkdownString: function (this: any, value?: string) { this.value = value || ""; this.appendMarkdown = (s: string) => { this.value += s; return this }; this.appendCodeblock = (s: string) => { this.value += s; return this }; this.appendText = (s: string) => { this.value += s; return this } } as any,
    SnippetString: function (this: any, value?: string) { this.value = value || "" } as any,
    ConfigurationTarget: { Global: 1, Workspace: 2, Folder: 3, Memory: 4 },
    ExtensionMode: { Production: 1, Development: 2, Test: 3 },
    OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 },
    ProgressLocation: { Notification: 10, Window: 15, Explorer: 20 },
    InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
    QuickPickItemKind: { Separator: -1, Default: 0 },
    SecretStorageChangeEvent: function (this: any) {} as any,
    WorkspaceTrustRequestOptions: {},
  }

  return shim
}

function injectVSCodeModule(): void {
  if (vscodeShimInjected) return
  vscodeShimInjected = true

  const shim = createVSCodeShim()

  const originalResolve = (Module as any)._resolveFilename
  const originalLoad = (Module as any)._load

  ;(Module as any)._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
    if (request === "vscode") return "vscode"
    return originalResolve.call(this, request, parent, isMain, options)
  }

  ;(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
    if (request === "vscode") return shim
    return originalLoad.call(this, request, parent, isMain)
  }

  console.log("[ExtHost] vscode module injected via Module._load")
}

function getVSCodeAPI() {
  return createVSCodeShim()
}

// ─── Extension Activation ────────────────────────────────────────────────────

async function activateExtension(ext: ExtensionInfo): Promise<boolean> {
  if (!ext.main) {
    console.log(`[ExtHost] No main entry for ${ext.id}, marking as active`)
    return true
  }

  const mainPath = join(ext.extensionPath, ext.main)

  if (!existsSync(mainPath)) {
    console.error(`[ExtHost] Main entry not found: ${mainPath}`)
    return false
  }

  try {
    injectVSCodeModule()

    const extensionUri = {
      fsPath: ext.extensionPath,
      scheme: "file",
      authority: "",
      path: ext.extensionPath,
      query: "",
      fragment: "",
      with() { return {} },
      toString() { return ext.extensionPath },
    }

    const subscriptions: any[] = []

    const extensionContext = {
      extensionPath: ext.extensionPath,
      extensionUri,
      subscriptions,
      globalState: {
        get(_key: string) { return undefined },
        async update(_key: string, _value: any) { return true },
        keys() { return [] as string[] },
        setKeysForSync(_keys: string[]) {},
      },
      workspaceState: {
        get(_key: string) { return undefined },
        async update(_key: string, _value: any) { return true },
        keys() { return [] as string[] },
      },
      extensionMode: 1,
      extension: {
        id: ext.id,
        extensionUri,
        extensionPath: ext.extensionPath,
        isActive: true,
        packageJSON: { name: ext.name, displayName: ext.displayName, publisher: ext.publisher, version: ext.version },
        exports: undefined,
      },
      storagePath: join(ext.extensionPath, "storage"),
      globalStoragePath: join(ext.extensionPath, "global"),
      logPath: join(ext.extensionPath, "log"),
      asAbsolutePath(relativePath: string) { return join(ext.extensionPath, relativePath) },
      secrets: {
        async get(_key: string) { return undefined },
        async store(_key: string, _value: string) {},
        async delete(_key: string) {},
        onDidChange: () => ({ dispose() {} }),
      },
      languageModelAccessInformation: {
        onDidChange: () => ({ dispose() {} }),
        canSendRequest(_model: string) { return undefined },
      },
    }

    const mod = require(mainPath)

    if (mod.activate) {
      await mod.activate(extensionContext)
      console.log(`[ExtHost] Activated: ${ext.displayName || ext.id} (${subscriptions.length} subscriptions)`)
      return true
    }

    console.log(`[ExtHost] No activate() function for ${ext.id}`)
    return true
  } catch (error: any) {
    console.error(`[ExtHost] Failed to activate ${ext.id}: ${error.message}`)
    console.error(`[ExtHost] Stack: ${error.stack?.split("\n").slice(0, 3).join(" | ")}`)
    return false
  }
}

// ─── Initialize ──────────────────────────────────────────────────────────────

function initializeExtensionHost(): void {
  const vscodeHostPath = getVscodeHostPath()

  console.log("[ExtHost] Initializing VS Code Extension Host...")
  console.log(`[ExtHost] Extensions: ${join(app.getPath("userData"), "extensions")}`)
  console.log(`[ExtHost] VS Code Host: ${vscodeHostPath}`)

  injectVSCodeModule()

  extensionMap = scanExtensions()
  console.log(`[ExtHost] Found ${extensionMap.size} extensions`)

  loadActivationState()
  loadRegisteredModels()

  const manifestActive = loadManifestActiveExtensions()
  for (const id of manifestActive) {
    if (activatedExtensions.has(id)) continue
    // Try exact match first
    if (extensionMap.has(id)) {
      activatedExtensions.add(id)
      console.log(`[ExtHost] Restored active from manifest: ${id}`)
      continue
    }
    // Fallback: match by name alone (installed.json may use short ID without publisher prefix)
    for (const [extId, ext] of extensionMap) {
      if (ext.name === id || extId.endsWith(`.${id}`)) {
        activatedExtensions.add(extId)
        console.log(`[ExtHost] Restored active from manifest (name match): ${id} → ${extId}`)
        break
      }
    }
  }

  saveActivationState()
  console.log("[ExtHost] Extension Host initialized")
}

// ─── Register IPC Handlers ───────────────────────────────────────────────────

export function registerExtensionHostIPC(): void {
  initializeExtensionHost()

  ipcMain.handle("extension-host:get-extensions", () => {
    return Array.from(extensionMap.values()).map((ext) => ({
      id: ext.id,
      shortId: ext.name,
      name: ext.name,
      displayName: ext.displayName || ext.name,
      description: ext.description || "",
      version: ext.version,
      publisher: ext.publisher,
      isActive: activatedExtensions.has(ext.id) || activatedExtensions.has(ext.name),
      icon: ext.icon || "",
    }))
  })

  ipcMain.handle("extension-host:activate-extension", async (_, extensionId: string) => {
    const ext = findExtension(extensionId)
    if (!ext) return false
    if (activatedExtensions.has(ext.id) || activatedExtensions.has(extensionId)) return true

    const success = await activateExtension(ext)
    if (success) {
      activatedExtensions.add(ext.id)
      saveActivationState()
    }
    return success
  })

  ipcMain.handle("extension-host:deactivate-extension", (_, extensionId: string) => {
    const ext = findExtension(extensionId)
    const realId = ext?.id || extensionId
    if (!activatedExtensions.has(realId) && !activatedExtensions.has(extensionId)) return false
    activatedExtensions.delete(realId)
    activatedExtensions.delete(extensionId)
    saveActivationState()
    console.log(`[ExtHost] Deactivated: ${extensionId}`)
    return true
  })

  ipcMain.handle("extension-host:is-active", (_, extensionId: string) => {
    const ext = findExtension(extensionId)
    return activatedExtensions.has(extensionId) || (ext ? activatedExtensions.has(ext.id) : false)
  })

  ipcMain.handle("extension-host:check-updates", () => {
    return { hasUpdates: false, updates: [], checkedAt: new Date().toISOString() }
  })

  ipcMain.handle("extension-host:get-last-check", () => null)

  ipcMain.handle("extension-host:refresh", () => {
    extensionMap = scanExtensions()
    return extensionMap.size
  })

  ipcMain.handle("extension-host:get-registered-models", () => {
    return getExtensionRegisteredModels()
  })

  console.log("[ExtHost] Extension Host IPC handlers registered")
}

// ─── Export Functions for lazy IPC imports from ipc.ts ───────────────────────

export function getExtensionHostExtensions() {
  return Array.from(extensionMap.values()).map((ext) => ({
    id: ext.id,
    name: ext.name,
    displayName: ext.displayName || ext.name,
    description: ext.description || "",
    version: ext.version,
    publisher: ext.publisher,
    isActive: activatedExtensions.has(ext.id),
    icon: ext.icon || "",
  }))
}

export async function activateExtensionById(extensionId: string): Promise<boolean> {
  const ext = extensionMap.get(extensionId)
  if (!ext) return false
  if (activatedExtensions.has(extensionId)) return true

  const success = await activateExtension(ext)
  if (success) {
    activatedExtensions.add(extensionId)
    saveActivationState()
  }
  return success
}

export function deactivateExtensionById(extensionId: string): boolean {
  const ext = findExtension(extensionId)
  const realId = ext?.id || extensionId
  if (!activatedExtensions.has(realId) && !activatedExtensions.has(extensionId)) return false
  activatedExtensions.delete(realId)
  activatedExtensions.delete(extensionId)
  saveActivationState()
  console.log(`[ExtHost] Deactivated: ${extensionId}`)
  return true
}

export function isExtensionActive(extensionId: string): boolean {
  const ext = findExtension(extensionId)
  return activatedExtensions.has(extensionId) || (ext ? activatedExtensions.has(ext.id) : false)
}

export function refreshExtensions(): number {
  extensionMap = scanExtensions()
  return extensionMap.size
}

// ─── Shutdown ────────────────────────────────────────────────────────────────

export function shutdownExtensionHost(): void {
  console.log("[ExtHost] Shutting down Extension Host...")
  activatedExtensions.clear()
  extensionMap.clear()
  console.log("[ExtHost] Extension Host shut down")
}
