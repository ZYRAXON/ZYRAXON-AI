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
}

// ─── State ───────────────────────────────────────────────────────────────────

const activatedExtensions = new Set<string>()
let extensionMap = new Map<string, ExtensionInfo>()

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
      }

      extensions.set(ext.id, ext)
      console.log(`[ExtHost] Found: ${ext.displayName || ext.name} v${ext.version}`)
    } catch {
      // Skip invalid extensions
    }
  }

  return extensions
}

// ─── VS Code API Provider ────────────────────────────────────────────────────
// Creates a VS Code-compatible API for extensions to use.
// Tries to load the full shim from vscode-host/dist/bootstrap.js first,
// falls back to the vscode-api-shim.ts, then to a minimal stub.

function getVSCodeAPI() {
  const vscodeHostPath = getVscodeHostPath()

  // Try 1: Load compiled bootstrap from vscode-host/dist/
  try {
    const bootstrap = require(join(vscodeHostPath, "dist", "bootstrap.js"))
    if (bootstrap?.window) return bootstrap
  } catch {}

  // Try 2: Load the VS Code API shim directly
  try {
    const shim = require(join(vscodeHostPath, "vscode-api-shim.js"))
    return shim?.default || shim
  } catch {}

  // Try 3: Use the vscode-shim from the vscode-host directory
  try {
    const shimPath = join(vscodeHostPath, "vscode-api-shim.ts")
    if (existsSync(shimPath)) {
      console.log("[ExtHost] VS Code API shim found at:", shimPath)
    }
  } catch {}

  // Fallback: Minimal API stub
  console.warn("[ExtHost] Using minimal VS Code API stub")
  return createMinimalVSCodeAPI()
}

function createMinimalVSCodeAPI() {
  return {
    window: {
      showInformationMessage: async (message: string, ...items: string[]) => {
        console.log(`[ZYRAXON] Info: ${message}`)
        return items[0]
      },
      showWarningMessage: async (message: string, ...items: string[]) => {
        console.log(`[ZYRAXON] Warning: ${message}`)
        return items[0]
      },
      showErrorMessage: async (message: string, ...items: string[]) => {
        console.error(`[ZYRAXON] Error: ${message}`)
        return items[0]
      },
      showInputBox: async () => undefined,
      showQuickPick: async () => undefined,
      createStatusBarItem: () => ({
        text: "", tooltip: "", show: () => {}, hide: () => {}, dispose: () => {},
      }),
      createOutputChannel: (name: string) => ({
        appendLine: (line: string) => console.log(`[${name}] ${line}`),
        append: (text: string) => process.stdout.write(text),
        show: () => {}, hide: () => {}, dispose: () => {}, clear: () => {}, name,
      }),
      createTerminal: (options?: any) => ({
        sendText: (text: string) => console.log(`[Terminal] ${text}`),
        show: () => {}, hide: () => {}, dispose: () => {},
        name: options?.name || "Terminal",
      }),
      withProgress: async (options: any, task: any) => task({ report: () => {} }),
      registerTreeDataProvider: () => ({ dispose: () => {} }),
      createWebviewPanel: () => ({
        webview: { html: "" }, reveal: () => {}, dispose: () => {},
      }),
    },
    workspace: {
      getConfiguration: () => ({
        get: () => undefined,
        has: () => false,
        inspect: () => undefined,
        update: async () => {},
      }),
      onDidChangeConfiguration: () => ({ dispose: () => {} }),
      workspaceFolders: [],
      asRelativePath: (pathOrUri: any) =>
        typeof pathOrUri === "string" ? pathOrUri : pathOrUri?.fsPath || "",
      findFiles: async () => [],
      openTextDocument: async () => ({
        getText: () => "",
        lineAt: () => ({ text: "" }),
        lineCount: 0,
        uri: { fsPath: "" },
      }),
    },
    commands: {
      registerCommand: (command: string) => {
        console.log(`[ZYRAXON] Command registered: ${command}`)
        return { dispose: () => {} }
      },
      executeCommand: async (command: string) => {
        console.log(`[ZYRAXON] Command executed: ${command}`)
        return undefined
      },
    },
    languages: {
      registerCompletionItemProvider: () => ({ dispose: () => {} }),
      registerHoverProvider: () => ({ dispose: () => {} }),
      registerDefinitionProvider: () => ({ dispose: () => {} }),
      registerReferenceProvider: () => ({ dispose: () => {} }),
      registerDocumentFormattingEditProvider: () => ({ dispose: () => {} }),
      registerSignatureHelpProvider: () => ({ dispose: () => {} }),
    },
    extensions: {
      getExtension: (extensionId: string) => {
        const found = extensionMap.get(extensionId)
        if (found) {
          return {
            id: found.id,
            extensionPath: found.extensionPath,
            packageJSON: found,
            isActive: activatedExtensions.has(found.id),
          }
        }
        return undefined
      },
      all: Array.from(extensionMap.values()).map((e) => ({
        id: e.id,
        extensionPath: e.extensionPath,
        packageJSON: e,
        isActive: activatedExtensions.has(e.id),
      })),
    },
    env: {
      appName: "ZYRAXON",
      appRoot: process.cwd(),
      language: process.env.LANG || "en",
      machineId: "zyraxon-machine",
      sessionId: `zyraxon-${Date.now()}`,
      uriScheme: "zyraxon",
    },
  }
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
    const vscodeAPI = getVSCodeAPI()
    const module = await import(mainPath)

    if (module.activate) {
      await module.activate(vscodeAPI)
      console.log(`[ExtHost] Activated: ${ext.displayName || ext.id}`)
      return true
    }

    console.log(`[ExtHost] No activate() function for ${ext.id}`)
    return true
  } catch (error: any) {
    console.error(`[ExtHost] Failed to activate ${ext.id}: ${error.message}`)
    return false
  }
}

// ─── Initialize ──────────────────────────────────────────────────────────────

function initializeExtensionHost(): void {
  const vscodeHostPath = getVscodeHostPath()

  console.log("[ExtHost] Initializing VS Code Extension Host...")
  console.log(`[ExtHost] Extensions: ${join(app.getPath("userData"), "extensions")}`)
  console.log(`[ExtHost] VS Code Host: ${vscodeHostPath}`)

  extensionMap = scanExtensions()
  console.log(`[ExtHost] Found ${extensionMap.size} extensions`)
  console.log("[ExtHost] Extension Host initialized")
}

// ─── Register IPC Handlers ───────────────────────────────────────────────────

export function registerExtensionHostIPC(): void {
  initializeExtensionHost()

  ipcMain.handle("extension-host:get-extensions", () => {
    return Array.from(extensionMap.values()).map((ext) => ({
      id: ext.id,
      name: ext.name,
      displayName: ext.displayName || ext.name,
      description: ext.description || "",
      version: ext.version,
      publisher: ext.publisher,
      isActive: activatedExtensions.has(ext.id),
    }))
  })

  ipcMain.handle("extension-host:activate-extension", async (_, extensionId: string) => {
    const ext = extensionMap.get(extensionId)
    if (!ext) return false
    if (activatedExtensions.has(extensionId)) return true

    const success = await activateExtension(ext)
    if (success) activatedExtensions.add(extensionId)
    return success
  })

  ipcMain.handle("extension-host:deactivate-extension", (_, extensionId: string) => {
    if (!activatedExtensions.has(extensionId)) return false
    activatedExtensions.delete(extensionId)
    console.log(`[ExtHost] Deactivated: ${extensionId}`)
    return true
  })

  ipcMain.handle("extension-host:is-active", (_, extensionId: string) => {
    return activatedExtensions.has(extensionId)
  })

  ipcMain.handle("extension-host:check-updates", () => {
    return { hasUpdates: false, updates: [], checkedAt: new Date().toISOString() }
  })

  ipcMain.handle("extension-host:get-last-check", () => null)

  ipcMain.handle("extension-host:refresh", () => {
    extensionMap = scanExtensions()
    return extensionMap.size
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
  }))
}

export async function activateExtensionById(extensionId: string): Promise<boolean> {
  const ext = extensionMap.get(extensionId)
  if (!ext) return false
  if (activatedExtensions.has(extensionId)) return true

  const success = await activateExtension(ext)
  if (success) activatedExtensions.add(extensionId)
  return success
}

export function deactivateExtensionById(extensionId: string): boolean {
  if (!activatedExtensions.has(extensionId)) return false
  activatedExtensions.delete(extensionId)
  console.log(`[ExtHost] Deactivated: ${extensionId}`)
  return true
}

export function isExtensionActive(extensionId: string): boolean {
  return activatedExtensions.has(extensionId)
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
