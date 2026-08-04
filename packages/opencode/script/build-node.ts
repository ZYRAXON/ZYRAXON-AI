#!/usr/bin/env bun
import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "url"
import { createSolidTransformPlugin } from "@opentui/solid/bun-plugin"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const generated = await import("./generate.ts")

import { Script } from "@opencode-ai/script"

const plugin = createSolidTransformPlugin()

console.log("Building opencode dist/node...")

// Ensure dist/node directory exists
const distNode = path.join(dir, "dist", "node")
await $`mkdir -p ${distNode}`

const result = await Bun.build({
  conditions: ["bun", "node"],
  tsconfig: "./tsconfig.json",
  plugins: [plugin],
  external: ["node-gyp"],
  format: "esm",
  minify: false,
  sourcemap: "none",
  splitting: false,
  target: "node",
  outdir: distNode,
  entrypoints: ["./src/node.ts"],
  define: {
    ZYRAXON_VERSION: `'${Script.version}'`,
    ZYRAXON_MODELS_DEV: generated.modelsData,
    ZYRAXON_CHANNEL: `'${Script.channel}'`,
  },
})

console.log("Build result:", result.success, result.outputs.map(o => o.path))
console.log("Current directory:", process.cwd())
console.log("Built dist/node/node.js")
