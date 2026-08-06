#!/usr/bin/env node

/**
 * VS Code Extension Host Extractor for ZYRAXON
 * 
 * This script:
 * 1. Clones VS Code repository (shallow clone for speed)
 * 2. Extracts the extension host related code
 * 3. Adapts it for ZYRAXON integration
 * 4. Creates a build manifest for version tracking
 * 
 * Usage: node extract-vscode-host.js [--version <tag>]
 */

import { execSync } from "node:child_process"
import { mkdirSync, existsSync, rmSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = join(__dirname, "..", "..")
const TEMP_DIR = join(ROOT_DIR, ".vscode-temp")
const OUTPUT_DIR = join(ROOT_DIR, "packages", "desktop", "vscode-host")
const MANIFEST_PATH = join(OUTPUT_DIR, "manifest.json")

// Parse arguments
const args = process.argv.slice(2)
const versionIndex = args.indexOf("--version")
const TARGET_VERSION = versionIndex !== -1 ? args[versionIndex + 1] : "stable"

console.log("🔧 ZYRAXON VS Code Extension Host Extractor")
console.log(`   Target version: ${TARGET_VERSION}`)
console.log("")

// ─── Step 1: Clone VS Code ───────────────────────────────────────────────────

console.log("📥 Step 1: Cloning VS Code repository...")

if (existsSync(TEMP_DIR)) {
  rmSync(TEMP_DIR, { recursive: true, force: true })
}

try {
  // Shallow clone for speed
  const cloneCmd = TARGET_VERSION === "stable"
    ? "git clone --depth 1 https://github.com/microsoft/vscode.git"
    : `git clone --depth 1 --branch ${TARGET_VERSION} https://github.com/microsoft/vscode.git`
  
  execSync(cloneCmd, { cwd: ROOT_DIR, stdio: "inherit" })
  
  // Rename to temp dir
  execSync(`mv vscode .vscode-temp`, { cwd: ROOT_DIR, stdio: "inherit" })
  
  console.log("   ✅ Clone complete")
} catch (error) {
  console.error("   ❌ Clone failed:", error.message)
  process.exit(1)
}

// ─── Step 2: Extract Extension Host Files ────────────────────────────────────

console.log("\n📦 Step 2: Extracting extension host files...")

const VSCODE_SRC = join(TEMP_DIR, "src")
const VSCODE_OUT = join(TEMP_DIR, "out")

// Directories to extract
const EXTRACT_PATHS = [
  // Core extension host
  "vs/workbench/services/extensions/common",
  "vs/workbench/services/extensions/node",
  "vs/workbench/api/common",
  "vs/workbench/api/node",
  
  // VS Code API implementation
  "vs/workbench/api/common/extHost",
  "vs/workbench/api/common/extHost.protocol",
  
  // Language features
  "vs/editor/common/languages",
  "vs/editor/common/services",
  
  // Extension management
  "vs/workbench/contrib/extensions/common",
  "vs/workbench/contrib/extensions/browser",
  
  // Terminal
  "vs/workbench/contrib/terminal/common",
  "vs/workbench/contrib/terminal/browser",
  
  // Debug
  "vs/workbench/contrib/debug/common",
  "vs/workbench/contrib/debug/browser",
  
  // Tasks
  "vs/workbench/contrib/tasks/common",
  "vs/workbench/contrib/tasks/browser",
  
  // Core services needed by extensions
  "vs/platform/extensions/common",
  "vs/platform/extensions/node",
  "vs/platform/log/common",
  "vs/platform/configuration/common",
  "vs/platform/files/common",
  "vs/platform/uriIdentity/common",
  "vs/platform/workspace/common",
  
  // URI and disposables
  "vs/base/common/uri",
  "vs/base/common/lifecycle",
  "vs/base/common/event",
  "vs/base/common/disposable",
  "vs/base/common/paths",
  "vs/base/common/strings",
  "vs/base/common/mime",
  "vs/base/common/network",
  "vs/base/common/platform",
  "vs/base/common/processes",
  "vs/base/common/severity",
  "vs/base/common/types",
  "vs/base/common/glob",
  "vs/base/common/map",
  "vs/base/common/arrays",
  "vs/base/common/objects",
  "vs/base/common/async",
  "vs/base/common/cancellation",
  "vs/base/common/encoding",
  "vs/base/common/hash",
  "vs/base/common/json",
  "vs/base/common/jsonErrorMessages",
  "vs/base/common/marked/marked",
  
  // Node utilities
  "vs/base/node/pfs",
  "vs/base/node/processes",
  
  // NLS
  "vs/nls",
  "vs/nls.runtime",
  
  // Protocol
  "vs/workbench/services/extensions/common/extensionHostProtocol",
]

// Create output directory structure
if (existsSync(OUTPUT_DIR)) {
  rmSync(OUTPUT_DIR, { recursive: true, force: true })
}
mkdirSync(OUTPUT_DIR, { recursive: true })

let extractedFiles = 0
let totalSize = 0

for (const relPath of EXTRACT_PATHS) {
  const srcPath = join(VSCODE_SRC, relPath)
  const destPath = join(OUTPUT_DIR, relPath)
  
  if (!existsSync(srcPath)) {
    console.log(`   ⚠️  Not found: ${relPath}`)
    continue
  }
  
  try {
    // Create destination directory
    mkdirSync(destPath, { recursive: true })
    
    // Copy files
    cpSync(srcPath, destPath, { recursive: true })
    
    // Count files
    const count = countFiles(destPath)
    extractedFiles += count.files
    totalSize += count.size
    
    console.log(`   ✅ ${relPath} (${count.files} files)`)
  } catch (error) {
    console.log(`   ⚠️  Error copying ${relPath}: ${error.message}`)
  }
}

console.log(`\n   Total: ${extractedFiles} files, ${(totalSize / 1024 / 1024).toFixed(1)} MB`)

// ─── Step 3: Create TypeScript Configuration ────────────────────────────────

console.log("\n📝 Step 3: Creating TypeScript configuration...")

const tsConfig = {
  compilerOptions: {
    target: "ES2022",
    module: "Node16",
    moduleResolution: "Node16",
    outDir: "./dist",
    rootDir: ".",
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    forceConsistentCasingInFileNames: true,
    resolveJsonModule: true,
    isolatedModules: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noFallthroughCasesInSwitch: true,
    paths: {
      "vs/*": ["./*"]
    }
  },
  include: ["**/*.ts"],
  exclude: ["node_modules", "dist"]
}

writeFileSync(join(OUTPUT_DIR, "tsconfig.json"), JSON.stringify(tsConfig, null, 2))

// ─── Step 4: Create Package.json ────────────────────────────────────────────

console.log("📦 Step 4: Creating package.json...")

const packageJson = {
  name: "@zyraxon/vscode-host",
  version: "0.0.1",
  description: "VS Code Extension Host extracted for ZYRAXON",
  main: "dist/index.js",
  types: "dist/index.d.ts",
  scripts: {
    build: "tsc",
    "build:watch": "tsc --watch",
    clean: "rm -rf dist"
  },
  dependencies: {
    "vscode-jsonrpc": "^8.2.0",
    "vscode-languageserver-protocol": "^3.17.5",
    "vscode-languageserver-textdocument": "^1.0.11",
    "vscode-languageserver-types": "^3.17.5"
  },
  devDependencies: {
    "typescript": "^5.3.3"
  }
}

writeFileSync(join(OUTPUT_DIR, "package.json"), JSON.stringify(packageJson, null, 2))

// ─── Step 5: Create Manifest ────────────────────────────────────────────────

console.log("📋 Step 5: Creating build manifest...")

let vscodeVersion = "unknown"
try {
  vscodeVersion = execSync("git rev-parse HEAD", { cwd: TEMP_DIR }).toString().trim()
} catch {}

const manifest = {
  vscodeVersion,
  extractedAt: new Date().toISOString(),
  targetVersion: TARGET_VERSION,
  files: extractedFiles,
  size: totalSize,
  paths: EXTRACT_PATHS.filter(p => existsSync(join(VSCODE_SRC, p)))
}

writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2))

// ─── Step 6: Create Index File ──────────────────────────────────────────────

console.log("📝 Step 6: Creating index file...")

const indexContent = `/**
 * VS Code Extension Host for ZYRAXON
 * 
 * This module provides VS Code extension compatibility for ZYRAXON.
 * It allows running VS Code extensions without requiring VS Code installation.
 * 
 * Auto-generated from VS Code ${TARGET_VERSION}
 * Build date: ${new Date().toISOString()}
 */

export * from "./vs/workbench/services/extensions/common/extensionHostProtocol"
export * from "./vs/workbench/api/common/extHost.protocol"
export * from "./vs/platform/extensions/common/extensions"
export * from "./vs/base/common/uri"
export * from "./vs/base/common/lifecycle"
export * from "./vs/base/common/event"
export * from "./vs/base/common/disposable"

// Version info
export const VSCODE_HOST_VERSION = "${vscodeVersion}"
export const BUILD_DATE = "${new Date().toISOString()}"
export const TARGET_VSCODE_VERSION = "${TARGET_VERSION}"
`

writeFileSync(join(OUTPUT_DIR, "index.ts"), indexContent)

// ─── Cleanup ────────────────────────────────────────────────────────────────

console.log("\n🧹 Cleaning up temporary files...")
rmSync(TEMP_DIR, { recursive: true, force: true })

console.log("\n✅ VS Code Extension Host extraction complete!")
console.log(`\nOutput directory: ${OUTPUT_DIR}`)
console.log(`Files extracted: ${extractedFiles}`)
console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
console.log(`VS Code version: ${vscodeVersion}`)
console.log("\nNext steps:")
console.log("1. cd packages/desktop/vscode-host")
console.log("2. npm install")
console.log("3. npm run build")

// ─── Helper Functions ───────────────────────────────────────────────────────

function countFiles(dir) {
  let files = 0
  let size = 0
  
  const items = readdirSync(dir)
  for (const item of items) {
    const itemPath = join(dir, item)
    const stat = statSync(itemPath)
    
    if (stat.isDirectory()) {
      const sub = countFiles(itemPath)
      files += sub.files
      size += sub.size
    } else {
      files++
      size += stat.size
    }
  }
  
  return { files, size }
}
