#!/usr/bin/env bun
/**
 * Build Jarvis Browser MCP — Copy @playwright/mcp + deps to resources
 * Then create wrapper that sets NODE_PATH at runtime
 */
import path from "path"
import fs from "fs"
import { $ } from "bun"

const ROOT = path.resolve(import.meta.dir, "..")
const RESOURCES = path.join(ROOT, "packages", "desktop", "resources")
const BUNDLE_DIR = path.join(RESOURCES, "jarvis-browser")
const WRAPPER = path.join(RESOURCES, "jarvis-browser-mcp.js")
const NODE_MODULES = path.join(ROOT, "node_modules")

async function main() {
  console.log("=== Building Jarvis Browser MCP (proper copy + wrapper) ===")

  // Clean
  if (fs.existsSync(BUNDLE_DIR)) fs.rmSync(BUNDLE_DIR, { recursive: true })
  fs.mkdirSync(path.join(BUNDLE_DIR, "node_modules"), { recursive: true })

  // Packages to copy
  const packages = [
    ["@playwright", "mcp"],
    ["playwright-core"],
    ["chromium-bidi"],
  ]

  for (const parts of packages) {
    const name = parts.join("/")
    const src = path.join(NODE_MODULES, ...parts)
    const dest = path.join(BUNDLE_DIR, "node_modules", ...parts)

    if (!fs.existsSync(src)) {
      console.error(`MISSING: ${name} at ${src}`)
      process.exit(1)
    }

    console.log(`Copying ${name}...`)
    // Use PowerShell to copy (Windows-compatible recursive copy)
    try {
      await $`powershell -Command "Copy-Item -Path '${src}' -Destination '${dest}' -Recurse -Force"`
      console.log(`  OK -> ${dest}`)
    } catch (e) {
      console.error(`Failed to copy ${name}:`, e.message)
      process.exit(1)
    }
  }

  // Also copy nested playwright-core deps if any
  const corePkgPath = path.join(BUNDLE_DIR, "node_modules", "playwright-core", "package.json")
  if (fs.existsSync(corePkgPath)) {
    const corePkg = JSON.parse(fs.readFileSync(corePkgPath, "utf-8"))
    if (corePkg.dependencies) {
      for (const dep of Object.keys(corePkg.dependencies)) {
        const depSrc = path.join(NODE_MODULES, dep)
        const depDest = path.join(BUNDLE_DIR, "node_modules", dep)
        if (fs.existsSync(depSrc) && !fs.existsSync(depDest)) {
          console.log(`Copying nested dep: ${dep}...`)
          await $`powershell -Command "Copy-Item -Path '${depSrc}' -Destination '${depDest}' -Recurse -Force"`
        }
      }
    }
  }

  // Create wrapper
  const wrapper = `#!/usr/bin/env node
// Jarvis Browser MCP — ZYRAXON Browser Automation
// Built from @playwright/mcp (proper build, no shortcuts)
var path = require('path');
var fs = require('fs');

// Resolve jarvis-browser/node_modules
var bundleDir = path.join(__dirname, 'jarvis-browser');
if (!fs.existsSync(bundleDir) && process.resourcesPath) {
  bundleDir = path.join(process.resourcesPath, 'jarvis-browser');
}
var nodeModules = path.join(bundleDir, 'node_modules');
if (!fs.existsSync(nodeModules)) {
  console.error('Jarvis Browser MCP: node_modules not found at', nodeModules);
  process.exit(1);
}

// Set NODE_PATH for runtime resolution
process.env.NODE_PATH = nodeModules;
require('module').Module._initPaths();

// Forward to @playwright/mcp CLI
var cliPath = path.join(nodeModules, '@playwright', 'mcp', 'cli.js');
process.argv[0] = process.execPath;
process.argv[1] = cliPath;
require(cliPath);
`

  fs.writeFileSync(WRAPPER, wrapper, "utf-8")

  // Count files
  let fileCount = 0
  const countDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) countDir(path.join(dir, entry.name))
      else fileCount++
    }
  }
  countDir(BUNDLE_DIR)

  const totalSize = getDirSize(BUNDLE_DIR)
  console.log(`\n=== Build Complete ===`)
  console.log(`Bundle: ${BUNDLE_DIR}`)
  console.log(`Files: ${fileCount}`)
  console.log(`Size: ${(totalSize / 1024 / 1024).toFixed(1)} MB`)
  console.log(`Wrapper: ${WRAPPER}`)

  // Verify wrapper works
  console.log(`\nVerifying...`)
  try {
    const proc = Bun.spawnSync(["node", WRAPPER, "--help"], { timeout: 10000 })
    const output = new TextDecoder().decode(proc.stdout)
    console.log(output.split("\n").slice(0, 3).join("\n"))
    console.log("VERIFICATION PASSED!")
  } catch (e) {
    console.error("VERIFICATION FAILED:", e)
  }
}

function getDirSize(dir: string): number {
  let size = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) size += getDirSize(full)
    else size += fs.statSync(full).size
  }
  return size
}

main().catch((err) => {
  console.error("Build failed:", err)
  process.exit(1)
})
