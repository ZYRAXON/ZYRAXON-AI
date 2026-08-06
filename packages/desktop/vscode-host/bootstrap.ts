/**
 * ZYRAXON VS Code Extension Host Bootstrap
 * 
 * This is the main entry point that initializes the REAL VS Code extension host
 * within ZYRAXON's Electron environment.
 * 
 * It:
 * 1. Scans installed extensions
 * 2. Creates the VS Code API shim
 * 3. Provides the extension host with all necessary services
 * 4. Handles extension activation/deactivation
 */

import { join } from "node:path"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"

const VS_SOURCE = join(import.meta.dirname, "vs")

function getExtensionsDir(): string {
  const userData = process.env.ZYRAXON_USER_DATA || join(homedir(), ".zyraxon")
  return join(userData, "extensions")
}

export interface ExtensionInfo {
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
  engines: { vscode: string }
}

export interface ExtensionHostState {
  extensions: Map<string, ExtensionInfo>
  activatedExtensions: Set<string>
  initialized: boolean
  extensionsDir: string
}

function scanExtensions(extensionsDir: string): Map<string, ExtensionInfo> {
  const extensions = new Map<string, ExtensionInfo>()

  if (!existsSync(extensionsDir)) {
    console.log(`[Bootstrap] Extensions directory not found: ${extensionsDir}`)
    return extensions
  }

  const items = readdirSync(extensionsDir)

  for (const item of items) {
    const extensionPath = join(extensionsDir, item)
    const packageJsonPath = join(extensionPath, "package.json")

    if (!existsSync(packageJsonPath)) continue

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"))
      if (!packageJson.engines?.vscode) continue

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
        engines: packageJson.engines,
      }

      extensions.set(ext.id, ext)
      console.log(`[Bootstrap] Found: ${ext.displayName || ext.name} v${ext.version}`)
    } catch (error: any) {
      console.error(`[Bootstrap] Failed to load ${item}: ${error.message}`)
    }
  }

  return extensions
}

async function activateExtension(ext: ExtensionInfo, vscodeAPI: any): Promise<boolean> {
  if (!ext.main) {
    console.log(`[Bootstrap] No main entry for ${ext.id}, marking as active`)
    return true
  }

  const mainPath = join(ext.extensionPath, ext.main)
  if (!existsSync(mainPath)) {
    console.error(`[Bootstrap] Main entry not found: ${mainPath}`)
    return false
  }

  try {
    const module = await import(mainPath)
    if (module.activate) {
      await module.activate(vscodeAPI)
      console.log(`[Bootstrap] ✅ Activated: ${ext.displayName || ext.id}`)
      return true
    }
    console.log(`[Bootstrap] No activate() function for ${ext.id}`)
    return true
  } catch (error: any) {
    console.error(`[Bootstrap] ❌ Failed to activate ${ext.id}: ${error.message}`)
    return false
  }
}

const state: ExtensionHostState = {
  extensions: new Map(),
  activatedExtensions: new Set(),
  initialized: false,
  extensionsDir: "",
}

export function getExtensions(): ExtensionInfo[] {
  return Array.from(state.extensions.values())
}

export function getExtension(extensionId: string): ExtensionInfo | undefined {
  return state.extensions.get(extensionId)
}

export function isExtensionActive(extensionId: string): boolean {
  return state.activatedExtensions.has(extensionId)
}

export async function activateExtensionById(extensionId: string): Promise<boolean> {
  const ext = state.extensions.get(extensionId)
  if (!ext) return false
  if (state.activatedExtensions.has(extensionId)) return true

  const vscodeShim = require("./vscode-api-shim.js")
  const vscodeAPI = vscodeShim.default || vscodeShim
  const success = await activateExtension(ext, vscodeAPI)

  if (success) state.activatedExtensions.add(extensionId)
  return success
}

export async function deactivateExtensionById(extensionId: string): Promise<boolean> {
  if (!state.activatedExtensions.has(extensionId)) return false
  state.activatedExtensions.delete(extensionId)
  return true
}

export function refreshExtensions(): number {
  state.extensions = scanExtensions(state.extensionsDir)
  return state.extensions.size
}

export function initialize(extensionsDir?: string): void {
  state.extensionsDir = extensionsDir || getExtensionsDir()
  state.extensions = scanExtensions(state.extensionsDir)
  state.initialized = true
  console.log(`[Bootstrap] Initialized with ${state.extensions.size} extensions`)
}

export function isInitialized(): boolean {
  return state.initialized
}
