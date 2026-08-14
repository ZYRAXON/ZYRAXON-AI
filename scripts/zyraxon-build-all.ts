#!/usr/bin/env bun
/**
 * ZYRAXON auto-provision + build orchestrator.
 *
 * Every step checks whether its artifact already exists and skips it,
 * so previously downloaded/setup libraries are never re-downloaded.
 * Missing artifacts are auto-provisioned (install / download / build).
 *
 * Pipeline: zyraxon-code deps -> zyraxon binary -> dist/node -> app (web-ui)
 *           -> desktop -> desktop package (EXE).
 */

import { $ } from "bun"
import path from "node:path"
import { existsSync, symlinkSync } from "node:fs"

const root = path.resolve(import.meta.dir, "..")
const pkg = (name: string) => path.join(root, "packages", name)
const zc = pkg("zyraxon-code")

async function provisionWorkspaceJunctions() {
  // Ensure @zyraxon-ai/* workspace packages resolve from the root node_modules.
  // Without these junctions, vite/rollup fails with "Rollup failed to resolve
  // import @zyraxon-ai/sdk/v2/client". Only missing ones are created.
  const scope = path.join(root, "node_modules", "@zyraxon-ai")
  const pkgDirs = existsSync(path.join(root, "packages")) ? (await Array.fromAsync(new Bun.Glob("*").scan({ cwd: path.join(root, "packages") }))).filter((name) => existsSync(path.join(root, "packages", name, "package.json")) || (name === "sdk" && existsSync(path.join(root, "packages", "sdk", "js", "package.json")))) : []
  let created = 0
  for (const name of pkgDirs) {
    const linkPath = path.join(scope, name)
    if (existsSync(linkPath)) continue
    const target = name === "sdk" ? path.join(root, "packages", "sdk", "js") : path.join(root, "packages", name)
    if (!existsSync(target)) continue
    try {
      symlinkSync(target, linkPath, "junction")
      console.log(`[provision] linked @zyraxon-ai/${name}`)
      created++
    } catch (error) {
      console.warn(`[provision] could not link @zyraxon-ai/${name}: ${error}`)
    }
  }
  if (created === 0) skip("workspace junctions", "all present")
}

const flags = new Set(process.argv.slice(2))
const only = (name: string) => flags.has("--only") ? flags.has(name) : true
const force = flags.has("--force")
const skipSteps = new Set((flags.has("--skip") ? process.argv[process.argv.indexOf("--skip") + 1] ?? "" : "").split(",").filter(Boolean))

let stepCount = 0

function check(name: string) {
  console.log(`[check] ${name}`)
}

function done(name: string) {
  console.log(`[done] ${name}`)
}

function skip(name: string, reason: string) {
  console.log(`[skip] ${name} (${reason})`)
}

function step(name: string): boolean {
  if (skipSteps.has(name)) {
    skip(name, "requested via --skip")
    return false
  }
  if (!only(name)) return false
  stepCount++
  console.log(`\n=== STEP ${stepCount}: ${name} ===`)
  return true
}

async function provisionZyraxonCode() {
  if (!step("zyraxon-code")) return

  // 0. Workspace junctions (@zyraxon-ai/*) required by vite/rollup
  await provisionWorkspaceJunctions()

  // 1. Core node_modules
  if (existsSync(path.join(zc, "node_modules"))) {
    skip("node_modules", "already present")
  } else {
    console.log("Installing zyraxon-code node_modules (npm ci)...")
    await $`npm ci`.cwd(zc)
  }

  // 2. Extensions / build / remote deps via postinstall
  const stateFile = path.join(zc, "node_modules", ".postinstall-state")
  if (existsSync(stateFile)) {
    skip("postinstall deps", "already installed")
  } else {
    console.log("Running postinstall to populate extensions/build/remote deps...")
    await $`node --experimental-strip-types --max-old-space-size=8192 ./build/npm/postinstall.ts`.cwd(zc)
  }

  // 3. Compiled client
  const outMain = path.join(zc, "out", "vs", "code", "browser", "workbench", "workbench.js")
  if (existsSync(outMain)) {
    skip("compile-client", "out/ already compiled")
  } else {
    console.log("Compiling client...")
    await $`npm run compile-client`.cwd(zc)
  }

  // 4. Desktop VS Code runtime (full Electron-based editor, embedded into the app)
  const vscodeFolder = path.join(zc, `VSCode-${process.platform === "win32" ? "win32" : process.platform}-${process.arch === "x64" ? "x64" : "arm64"}`)
  if (existsSync(vscodeFolder)) {
    skip("desktop VS Code", "already present")
  } else {
    const gulpTarget = `vscode-${process.platform === "win32" ? "win32" : process.platform}-${process.arch === "x64" ? "x64" : "arm64"}-min`
    console.log(`Building ${gulpTarget} (full desktop VS Code)...`)
    await $`node --experimental-strip-types --max-old-space-size=8192 ./node_modules/gulp/bin/gulp.js ${gulpTarget}`.cwd(zc)
  }
}

async function buildZyraxonBinary() {
  if (!step("zyraxon-binary")) return

  const dist = pkg("zyraxon")
  const bin = path.join(dist, "dist", `zyraxon-${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`)
  if (!force && existsSync(bin)) {
    skip("binary", `already built: ${path.basename(bin)}`)
    return
  }
  console.log("Building zyraxon binary (single target)...")
  await $`bun run script/build.ts --single --skip-install`.cwd(dist)
}

async function buildZyraxonNode() {
  if (!step("zyraxon-node")) return

  const distNode = path.join(pkg("zyraxon"), "dist", "node")
  if (!force && existsSync(path.join(distNode, "index.js"))) {
    skip("dist/node", "already built")
    return
  }
  console.log("Building zyraxon dist/node...")
  await $`bun run script/build-node.ts`.cwd(pkg("zyraxon"))
}

async function buildApp() {
  if (!step("app")) return

  const dist = path.join(pkg("app"), "dist")
  if (!force && existsSync(path.join(dist, "index.html"))) {
    skip("app web-ui", "dist already built")
    return
  }
  console.log("Building app (web-ui)...")
  await $`bun run build`.cwd(pkg("app"))
}

async function buildDesktop() {
  if (!step("desktop")) return

  const dist = path.join(pkg("desktop"), "dist")
  if (!force && existsSync(path.join(dist, "main", "index.js"))) {
    skip("desktop", "dist already built")
    return
  }
  console.log("Building desktop...")
  await $`bun run build`.cwd(pkg("desktop"))
}

async function packageDesktop() {
  if (!step("desktop-exe")) return

  const installerGlob = path.join(pkg("desktop"), "dist", "*.exe")
  if (!force) {
    const { stdout } = await $`ls ${installerGlob}`.quiet().nothrow()
    if (stdout.toString().trim()) {
      skip("desktop EXE", "installer already exists")
      return
    }
  }
  console.log("Packaging desktop EXE (electron-builder)...")
  await $`bun run package`.cwd(pkg("desktop"))
}

console.log("ZYRAXON auto-provision + build orchestrator")
console.log(`root: ${root}`)
console.log("")

await provisionZyraxonCode()
await buildZyraxonBinary()
await buildZyraxonNode()
await buildApp()
await buildDesktop()
await packageDesktop()

console.log("\n=== ALL STEPS COMPLETE ===")
console.log("Artifacts:")
console.log(`  binary : ${path.join(pkg("zyraxon"), "dist")}`)
console.log(`  node   : ${path.join(pkg("zyraxon"), "dist", "node")}`)
console.log(`  app    : ${path.join(pkg("app"), "dist")}`)
console.log(`  desktop: ${path.join(pkg("desktop"), "dist")}`)
