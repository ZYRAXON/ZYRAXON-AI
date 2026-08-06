/**
 * esbuild configuration for VS Code Extension Host
 * 
 * Bundles all VS Code source files into a single file
 * that ZYRAXON can load and use.
 */

import { build, context } from "esbuild"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync, mkdirSync } from "node:fs"

const __dirname = dirname(fileURLToPath(import.meta.url))
const isWatch = process.argv.includes("--watch")

// ─── Configuration ───────────────────────────────────────────────────────────

const config = {
  // Entry point - our bootstrap file
  entryPoints: [join(__dirname, "bootstrap.ts")],

  // Output
  bundle: true,
  outfile: join(__dirname, "dist", "bootstrap.js"),
  format: "cjs", // CommonJS for Node.js
  platform: "node",
  target: "node18",

  // Don't externalize anything - bundle everything
  external: [],

  // Source maps for debugging
  sourcemap: true,

  // Minification
  minify: false, // Keep readable for debugging

  // Log level
  logLevel: "info",

  // Define globals
  define: {
    "process.env.NODE_ENV": '"production"',
  },

  // Alias resolution for VS Code's internal imports
  alias: {
    // VS Code uses these aliases internally
    "vscode": join(__dirname, "vscode-api-shim.ts"),
  },

  // Resolve extensions
  resolveExtensions: [".ts", ".js", ".json"],

  // Node paths for module resolution
  nodePaths: [join(__dirname, "vs")],

  // Banner
  banner: {
    js: `/**
 * ZYRAXON VS Code Extension Host
 * Built from VS Code source code
 * ${new Date().toISOString()}
 */`,
  },

  // Footer
  footer: {
    js: `// End of ZYRAXON VS Code Extension Host bundle`,
  },

  // Tree shaking
  treeShaking: false, // Keep all code for extension compatibility

  // Charset
  charset: "utf8",

  // Keep names for debugging
  keepNames: true,

  // Main fields
  mainFields: ["main", "module"],
}

// ─── Build ───────────────────────────────────────────────────────────────────

async function main() {
  // Ensure dist directory exists
  const distDir = join(__dirname, "dist")
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true })
  }

  if (isWatch) {
    console.log("👀 Watching for changes...")
    const ctx = await context(config)
    await ctx.watch()
    console.log("✅ Watching started")
  } else {
    console.log("🔨 Building VS Code Extension Host bundle...")
    const result = await build(config)
    console.log("✅ Build complete!")
    console.log(`   Output: ${config.outfile}`)
    console.log(`   Size: ${(result.metafile?.outputs[Object.keys(result.metafile?.outputs)[0]]?.bytes / 1024 / 1024).toFixed(2)} MB`)
  }
}

main().catch((error) => {
  console.error("❌ Build failed:", error)
  process.exit(1)
})
