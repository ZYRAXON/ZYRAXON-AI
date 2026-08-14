#!/usr/bin/env bun
import { $ } from "bun"
import path from "path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "../../..")

if (!process.env.NODE_OPTIONS?.includes("max-old-space-size")) {
  const current = process.env.NODE_OPTIONS ?? ""
  process.env.NODE_OPTIONS = `${current} --max-old-space-size=4096`.trim()
}

console.log(`Setting Node.js heap limit to 4096MB`)

// Build zyraxon dist/node first if it doesn't exist
const zyraxonDistNode = path.join(rootDir, "packages", "zyraxon", "dist", "node")
const zyraxonWebUI = path.join(zyraxonDistNode, "zyraxon-web-ui.gen.ts")

if (!Bun.file(zyraxonWebUI).exists()) {
  console.log("Building zyraxon dist/node...")
  await $`bun run script/build-node.ts`.cwd(path.join(rootDir, "packages", "zyraxon"))
}

// Always copy web-ui to dist/node (may be stale)
const srcWebUI = path.join(rootDir, "packages", "zyraxon", "zyraxon-web-ui.gen.ts")
if (Bun.file(srcWebUI).exists()) {
  await Bun.write(zyraxonWebUI, await Bun.file(srcWebUI).arrayBuffer())
  console.log("Copied zyraxon-web-ui.gen.ts to dist/node")
} else {
  console.error("ERROR: zyraxon-web-ui.gen.ts not found! Run: bun run --cwd packages/app bun run build")
  process.exit(1)
}

await $`electron-vite build`
