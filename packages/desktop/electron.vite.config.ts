import { sentryVitePlugin } from "@sentry/vite-plugin"
import { defineConfig } from "electron-vite"
import appPlugin from "@opencode-ai/app/vite"
import * as fs from "node:fs/promises"
import * as path from "node:path"

if (!process.env.NODE_OPTIONS?.includes("max-old-space-size")) {
  const current = process.env.NODE_OPTIONS ?? ""
  process.env.NODE_OPTIONS = `${current} --max-old-space-size=8192`.trim()
}

const ZYRAXON_SERVER_DIST = "../opencode/dist/node"

const channel = (() => {
  const raw = process.env.ZYRAXON_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  if (process.env.ZYRAXON_CHANNEL === "latest") return "prod"
  return "dev"
})()

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

const sentry =
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? sentryVitePlugin({
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        telemetry: false,
        release: {
          name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE,
        },
        sourcemaps: {
          assets: "./out/renderer/**",
          filesToDeleteAfterUpload: "./out/renderer/**/*.map",
        },
      })
    : false

export default defineConfig({
  main: {
    define: {
      "import.meta.env.ZYRAXON_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        external: ["node-fetch", "opencode-web-ui.gen.ts"],
        input: { index: "src/main/index.ts", sidecar: "src/main/sidecar.ts" },
        // Keep this identical to electron-vite's Node 20.11+ shim. Its regex insertion can
        // corrupt bundled TypeScript, while a Rollup banner places the shim safely.
        output: {
          banner: `
// -- CommonJS Shims --
import __cjs_mod__ from 'node:module';
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require = __cjs_mod__.createRequire(import.meta.url);
if (!import.meta.require) { import.meta.require = require; }
`,
        },
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "opencode:bun-protocol-shim",
        enforce: "pre",
        resolveId(id) {
          if (id === "bun:sqlite") return "\0bun:sqlite-shim.ts"
          if (id === "bun:ffi") return "\0bun:ffi-shim.ts"
        },
        load(id) {
          if (id === "\0bun:sqlite-shim.ts") {
            return `
import initSqlJs from "sql.js";
const SQL = await initSqlJs();
class Statement {
  constructor(stmt, db) { this._stmt = stmt; this._db = db; }
  all(...params) { this._stmt.bind(params.length ? params : undefined); const rows = []; while (this._stmt.step()) { rows.push(this._stmt.getAsObject()); } this._stmt.reset(); return rows; }
  values(...params) { this._stmt.bind(params.length ? params : undefined); const rows = []; while (this._stmt.step()) { rows.push(this._stmt.get()); } this._stmt.reset(); return rows; }
  run(...params) { this._stmt.bind(params.length ? params : undefined); this._stmt.step(); this._stmt.reset(); return { changes: this._db.getRowsModified() }; }
  safeIntegers() { return this; }
}
export class Database {
  constructor(filename, options) {
    this._readonly = options?.readonly ?? false;
    if (!filename || filename === ":memory:") { this._db = new SQL.Database(); }
    else { this._db = new SQL.Database(); }
    if (!this._readonly) { try { this._db.run("PRAGMA journal_mode = WAL"); } catch {} }
  }
  query(sql) { return new Statement(this._db.prepare(sql), this._db); }
  run(sql) { this._db.run(sql); }
  close() { this._db.close(); }
  serialize() { return new Uint8Array(0); }
  loadExtension() {}
}
`
          }
          if (id === "\0bun:ffi-shim.ts") {
            return `
export function dlopen() { return { symbols: {} }; }
export function ptr() { return 0; }
export function read() { return null; }
export class CString { toString() { return ""; } }
export const FFIType = { void:0, i8:1, u8:2, i16:3, u16:4, i32:5, u32:6, i64:7, u64:8, f32:9, f64:10, bool:11, ptr:12, cstring:13 };
`
          }
        },
      },
      {
        name: "opencode:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "opencode:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:opencode-server") {
            // Sidecar now loads server directly via import("./chunks/opencode-server.js")
            // This plugin is kept as a no-op for any remaining references
            return { id: "opencode-server-bundle", external: true }
          }
        },
      },
      {
        name: "opencode:copy-server-assets",
        async buildStart() {
          // Copy server bundle BEFORE build so the sidecar import resolves
          const chunksDir = "./out/main/chunks"
          await fs.mkdir(chunksDir, { recursive: true })
          const serverSource = path.join(ZYRAXON_SERVER_DIST, "node.js")
          const serverDest = path.join(chunksDir, "opencode-server.js")
          await fs.copyFile(serverSource, serverDest)
          console.log(`[opencode] Pre-copied server bundle to ${serverDest} (${(await fs.stat(serverDest)).size} bytes)`)
        },
        async writeBundle() {
          const chunksDir = "./out/main/chunks"
          for (const l of await fs.readdir(ZYRAXON_SERVER_DIST)) {
            if (l.endsWith(".wasm")) {
              await fs.writeFile(`${chunksDir}/${l}`, await fs.readFile(`${ZYRAXON_SERVER_DIST}/${l}`))
            }
          }
          const serverSource = path.join(ZYRAXON_SERVER_DIST, "node.js")
          const serverDest = path.join(chunksDir, "opencode-server.js")
          await fs.copyFile(serverSource, serverDest)

          // Patch bun:sqlite and bun:ffi imports → local shim files
          let serverCode = await fs.readFile(serverDest, "utf-8")
          serverCode = serverCode.replace(/from "bun:sqlite"/g, 'from "./bun-sqlite-shim.mjs"')
          serverCode = serverCode.replace(/from "bun:ffi"/g, 'from "./bun-ffi-shim.mjs"')
          serverCode = serverCode.replace(/import\("bun:sqlite"\)/g, 'import("./bun-sqlite-shim.mjs")')
          await fs.writeFile(serverDest, serverCode)
          console.log(`[opencode] Patched server bundle: replaced bun:sqlite/bun:ffi with local shims`)

          // Copy bun: protocol shim files
          const shimDir = path.resolve(__dirname, "src/main/shims")
          for (const shim of ["bun-sqlite-shim.mjs", "bun-ffi-shim.mjs"]) {
            const src = path.join(shimDir, shim)
            try {
              await fs.access(src)
              await fs.copyFile(src, path.join(chunksDir, shim))
            } catch {
              console.warn(`[opencode] Warning: shim ${shim} not found at ${src}`)
            }
          }

          // Copy sql-wasm.wasm for sql.js (bun:sqlite shim dependency)
          const wasmSource = path.resolve(__dirname, "node_modules/sql.js/dist/sql-wasm.wasm")
          try {
            await fs.access(wasmSource)
            await fs.copyFile(wasmSource, path.join(chunksDir, "sql-wasm.wasm"))
            console.log(`[opencode] Copied sql-wasm.wasm to ${chunksDir}`)
          } catch {
            console.warn(`[opencode] Warning: sql-wasm.wasm not found at ${wasmSource}`)
          }
          console.log(`[opencode] Copied bun: protocol shims to ${chunksDir}`)

          // Copy jsonc-parser UMD impl/ directory — the server bundle uses
          // __commonJS wrapper with runtime require("./impl/format") calls
          // that Bun's bundler didn't inline. These files must exist at runtime.
          const jsoncImplDir = path.resolve(__dirname, "../../node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/umd/impl")
          const destImplDir = path.join(chunksDir, "impl")
          try {
            await fs.access(jsoncImplDir)
            await fs.mkdir(destImplDir, { recursive: true })
            for (const f of await fs.readdir(jsoncImplDir)) {
              if (f.endsWith(".js")) {
                await fs.copyFile(path.join(jsoncImplDir, f), path.join(destImplDir, f))
              }
            }
            console.log(`[opencode] Copied jsonc-parser impl/ to ${destImplDir}`)
          } catch {
            console.warn(`[opencode] Warning: jsonc-parser impl not found at ${jsoncImplDir}`)
          }

          const webUiSource = path.join(ZYRAXON_SERVER_DIST, "opencode-web-ui.gen.ts")
          const webUiDest = "./out/main/opencode-web-ui.gen.ts"
          try {
            await fs.access(webUiSource)
            await fs.copyFile(webUiSource, webUiDest)
          } catch { /* file doesn't exist, skip */ }
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js",
        },
      },
    },
  },
  renderer: {
    plugins: [appPlugin, sentry],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
        },
      },
    },
  },
})
