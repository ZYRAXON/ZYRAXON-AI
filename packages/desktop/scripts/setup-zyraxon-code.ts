#!/usr/bin/env bun
import { $ } from "bun"
import path from "node:path"
import { existsSync } from "node:fs"

const __dirname = import.meta.dir
const packageDir = path.resolve(__dirname, "..")
const rootDir = path.resolve(packageDir, "../..")
const zyraxonCodeDir = path.join(rootDir, "packages", "zyraxon-code")

const platform = process.platform === "win32" ? "win32" : process.platform
const arch = process.arch === "x64" ? "x64" : process.arch === "arm64" ? "arm64" : process.arch
// Desktop VS Code build (Electron-based), NOT the web server variant.
const vscodeFolder = path.join(zyraxonCodeDir, `VSCode-${platform}-${arch}`)
const gulpTarget = `vscode-${platform}-${arch}-min`

console.log("[zyraxon-code setup] platform:", platform, "arch:", arch)
console.log("[zyraxon-code setup] target:", gulpTarget)
console.log("[zyraxon-code setup] output:", vscodeFolder)

if (!existsSync(path.join(zyraxonCodeDir, "package.json"))) {
  console.error("ERROR: packages/zyraxon-code not found at", zyraxonCodeDir)
  process.exit(1)
}

// 1. Install zyraxon-code dependencies (VS Code source tree: ~2GB node_modules)
if (!existsSync(path.join(zyraxonCodeDir, "node_modules"))) {
  console.log("[zyraxon-code setup] Installing dependencies (npm ci)... this downloads ~2GB and can take 10+ minutes")
  await $`npm ci`.cwd(zyraxonCodeDir)
  console.log("[zyraxon-code setup] npm ci done")
} else {
  console.log("[zyraxon-code setup] node_modules already present, skipping install")
}

// 1b. Ensure the Electron runtime binary (~100MB) is downloaded. npm skips the
// electron package's postinstall by default, so the `dist` folder (electron.exe)
// is missing until this step runs. Without it, `package-win32-x64` hangs trying
// to download Electron mid-build and can run out of memory on low-RAM machines.
const electronDist = path.join(zyraxonCodeDir, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron")
if (existsSync(path.join(zyraxonCodeDir, "node_modules", "electron"))) {
  if (!existsSync(electronDist)) {
    console.log("[zyraxon-code setup] Downloading Electron runtime (~100MB)...")
    await $`node install.js`.cwd(path.join(zyraxonCodeDir, "node_modules", "electron"))
    console.log("[zyraxon-code setup] Electron runtime ready")
  } else {
    console.log("[zyraxon-code setup] Electron runtime already present, skipping download")
  }
} else {
  console.warn("[zyraxon-code setup] electron package not found, skipping Electron download")
}

// 2. Build the embedded desktop VS Code runtime if missing
if (!existsSync(vscodeFolder)) {
  console.log(`[zyraxon-code setup] Building ${gulpTarget} (full desktop VS Code)...`)
  console.log("[zyraxon-code setup] This compiles ~250MB VS Code desktop runtime and downloads Electron automatically")
  await $`node --experimental-strip-types --max-old-space-size=8192 ./node_modules/gulp/bin/gulp.js ${gulpTarget}`.cwd(zyraxonCodeDir)
  console.log("[zyraxon-code setup] Build complete:", vscodeFolder)
} else {
  console.log("[zyraxon-code setup] Desktop VS Code build already present, skipping build")
}

if (!existsSync(vscodeFolder)) {
  console.error("ERROR: desktop VS Code build missing after setup:", vscodeFolder)
  process.exit(1)
}

console.log("[zyraxon-code setup] OK — ready to embed into desktop app")
