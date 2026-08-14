// electron.vite.config.ts
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig } from "electron-vite";
import appPlugin from "@zyraxon-ai/app/vite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
var __electron_vite_injected_dirname = "C:\\Users\\MMP\\Downloads\\ZYRAXON-AI-main\\ZYRAXON-AI-main\\packages\\desktop";
if (!process.env.NODE_OPTIONS?.includes("max-old-space-size")) {
  const current = process.env.NODE_OPTIONS ?? "";
  process.env.NODE_OPTIONS = `${current} --max-old-space-size=8192`.trim();
}
var ZYRAXON_SERVER_DIST = "../zyraxon/dist/node";
var channel = (() => {
  const raw = process.env.ZYRAXON_CHANNEL;
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw;
  if (process.env.ZYRAXON_CHANNEL === "latest") return "prod";
  return "dev";
})();
var nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`;
var sentry = process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT ? sentryVitePlugin({
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  telemetry: false,
  release: {
    name: process.env.SENTRY_RELEASE ?? process.env.VITE_SENTRY_RELEASE
  },
  sourcemaps: {
    assets: "./out/renderer/**",
    filesToDeleteAfterUpload: "./out/renderer/**/*.map"
  }
}) : false;
var electron_vite_config_default = defineConfig({
  main: {
    define: {
      "import.meta.env.ZYRAXON_CHANNEL": JSON.stringify(channel)
    },
    build: {
      rollupOptions: {
        external: ["node-fetch", "zyraxon-web-ui.gen.ts"],
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
`
        }
      },
      externalizeDeps: { include: [nodePtyPkg] }
    },
    plugins: [
      {
        name: "zyraxon:bun-protocol-shim",
        enforce: "pre",
        resolveId(id) {
          if (id === "bun:sqlite") return "\0bun:sqlite-shim.ts";
          if (id === "bun:ffi") return "\0bun:ffi-shim.ts";
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
`;
          }
          if (id === "\0bun:ffi-shim.ts") {
            return `
export function dlopen() { return { symbols: {} }; }
export function ptr() { return 0; }
export function read() { return null; }
export class CString { toString() { return ""; } }
export const FFIType = { void:0, i8:1, u8:2, i16:3, u16:4, i32:5, u32:6, i64:7, u64:8, f32:9, f64:10, bool:11, ptr:12, cstring:13 };
`;
          }
        }
      },
      {
        name: "zyraxon:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg;
        }
      },
      {
        name: "zyraxon:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:zyraxon-server") {
            return { id: "zyraxon-server-bundle", external: true };
          }
        }
      },
      {
        name: "zyraxon:copy-server-assets",
        async buildStart() {
          const chunksDir = "./out/main/chunks";
          await fs.mkdir(chunksDir, { recursive: true });
          const serverSource = path.join(ZYRAXON_SERVER_DIST, "node.js");
          const serverDest = path.join(chunksDir, "zyraxon-server.js");
          await fs.copyFile(serverSource, serverDest);
          console.log(`[zyraxon] Pre-copied server bundle to ${serverDest} (${(await fs.stat(serverDest)).size} bytes)`);
        },
        async writeBundle() {
          const chunksDir = "./out/main/chunks";
          for (const l of await fs.readdir(ZYRAXON_SERVER_DIST)) {
            if (l.endsWith(".wasm")) {
              await fs.writeFile(`${chunksDir}/${l}`, await fs.readFile(`${ZYRAXON_SERVER_DIST}/${l}`));
            }
          }
          const serverSource = path.join(ZYRAXON_SERVER_DIST, "node.js");
          const serverDest = path.join(chunksDir, "zyraxon-server.js");
          await fs.copyFile(serverSource, serverDest);
          let serverCode = await fs.readFile(serverDest, "utf-8");
          serverCode = serverCode.replace(/from "bun:sqlite"/g, 'from "./bun-sqlite-shim.mjs"');
          serverCode = serverCode.replace(/from "bun:ffi"/g, 'from "./bun-ffi-shim.mjs"');
          serverCode = serverCode.replace(/import\("bun:sqlite"\)/g, 'import("./bun-sqlite-shim.mjs")');
          if (serverCode.includes("../../node_modules/.bun/jsonc-parser@")) {
            const nodeModulesBase = path.resolve(__electron_vite_injected_dirname, "../../node_modules/.bun");
            const serverVersionMatch = serverCode.match(/jsonc-parser@([\d.]+)/);
            const targetVersion = serverVersionMatch ? serverVersionMatch[1] : null;
            const jsoncDirs = await fs.readdir(nodeModulesBase).catch(() => []);
            const jsoncDir = jsoncDirs.find((d) => targetVersion ? d === `jsonc-parser@${targetVersion}` : d.startsWith("jsonc-parser@"));
            if (jsoncDir) {
              const bundledPath = path.join(nodeModulesBase, jsoncDir, "node_modules/jsonc-parser/lib/esm/main.js.bundled");
              const stringInternPath = path.join(nodeModulesBase, jsoncDir, "node_modules/jsonc-parser/lib/esm/impl/string-intern.js");
              if (await fs.access(bundledPath).then(() => true).catch(() => false)) {
                let bundled = await fs.readFile(bundledPath, "utf-8");
                if (await fs.access(stringInternPath).then(() => true).catch(() => false)) {
                  const stringInternContent = (await fs.readFile(stringInternPath, "utf-8")).replace(/^\uFEFF/, "").replace(/^'use strict';\n/m, "").replace(/^export /gm, "");
                  bundled = bundled.replace(/^import \{[^}]+\} from '\.\/string-intern';\n/m, "");
                  bundled = bundled.replace(
                    /^(import \{ createScanner \} from '\.\/scanner';\n)/m,
                    `${stringInternContent}
$1`
                  );
                }
                bundled = bundled.replace(/^import \{[^}]+\} from '[^']+';\n/gm, "");
                bundled = bundled.replace(/^import \* as \w+ from '[^']+';\n/gm, "");
                bundled = bundled.replace(/^export const \w+ = scanner\.\w+;\n/gm, "");
                bundled = bundled.replace(/^export const \w+ = parser\.\w+;\n/gm, "");
                bundled = bundled.replace(/^export const \w+ = formatter\.\w+;\n/gm, "");
                bundled = bundled.replace(/^export const \w+ = edit\.\w+;\n/gm, "");
                bundled = bundled.replace(/^exports\.\w+ = scanner\.\w+;\n/gm, "");
                bundled = bundled.replace(/^exports\.\w+ = parser\.\w+;\n/gm, "");
                bundled = bundled.replace(/^exports\.\w+ = formatter\.\w+;\n/gm, "");
                bundled = bundled.replace(/^exports\.\w+ = edit\.\w+;\n/gm, "");
                const lastCopyrightIdx = bundled.lastIndexOf("/*------");
                if (lastCopyrightIdx !== -1) {
                  const afterCopyright = bundled.substring(lastCopyrightIdx);
                  const useStrictIdx = afterCopyright.indexOf("'use strict';");
                  if (useStrictIdx !== -1) {
                    const sectionContent = afterCopyright.substring(useStrictIdx + 13);
                    if (!sectionContent.includes("function isDigit") && !sectionContent.includes("function repeat")) {
                      bundled = bundled.substring(0, lastCopyrightIdx).trimEnd() + "\n";
                    }
                  }
                }
                bundled = bundled.replace(/^\uFEFF/, "");
                bundled = bundled.replace(/^'use strict';\n/m, "");
                bundled = bundled.replace(/^\/\/ Pre-bundled.*?\n/m, "");
                bundled = bundled.replace(/^\/\/ Source:.*?\n/m, "");
                const exportVarNames = [];
                for (const m of bundled.matchAll(/^export var (\w+);$/gm)) {
                  exportVarNames.push(m[1]);
                }
                bundled = bundled.replace(/^export function (\w+)/gm, "exports.$1 = function $1").replace(/^export const (\w+)/gm, "exports.$1").replace(/^export class (\w+)/gm, "exports.$1 = class $1").replace(/^export var (\w+);$/gm, "var $1;");
                for (const name of exportVarNames) {
                  const iifeEnd = new RegExp(`\\}\\)\\(${name} \\|\\| \\(${name} = \\{\\}\\)\\);`);
                  bundled = bundled.replace(iifeEnd, `})(exports.${name} = ${name} || (${name} = {}));`);
                }
                const startMarker = "// ../../node_modules/.bun/jsonc-parser@";
                const startIdx = serverCode.indexOf(startMarker);
                if (startIdx !== -1) {
                  let lineStart = startIdx;
                  while (lineStart > 0 && serverCode[lineStart - 1] !== "\n") lineStart--;
                  const cjsStart = serverCode.indexOf("var require_main = __commonJS((exports, module2) => {", startIdx);
                  if (cjsStart !== -1) {
                    let depth = 0;
                    let endPos = cjsStart;
                    let foundFirst = false;
                    for (let i = cjsStart; i < serverCode.length - 1; i++) {
                      if (serverCode[i] === "{") {
                        depth++;
                        foundFirst = true;
                      }
                      if (serverCode[i] === "}") {
                        depth--;
                      }
                      if (foundFirst && depth === 0) {
                        endPos = i + 1;
                        break;
                      }
                    }
                    let lineEnd = endPos;
                    while (lineEnd < serverCode.length && serverCode[lineEnd] !== "\n") lineEnd++;
                    if (lineEnd < serverCode.length) lineEnd++;
                    const replacement = [
                      "// jsonc-parser (pre-bundled, no asar path issues)",
                      "var require_main = __commonJS((exports, module2) => {",
                      bundled,
                      "});",
                      ""
                    ].join("\n");
                    serverCode = serverCode.substring(0, lineStart) + replacement + serverCode.substring(lineEnd);
                    console.log("[zyraxon] Patched jsonc-parser: replaced broken UMD with pre-bundled CJS");
                  }
                }
              }
            }
          }
          await fs.writeFile(serverDest, serverCode);
          console.log(`[zyraxon] Patched server bundle: replaced bun:sqlite/bun:ffi with local shims`);
          const shimDir = path.resolve(__electron_vite_injected_dirname, "src/main/shims");
          for (const shim of ["bun-sqlite-shim.mjs", "bun-ffi-shim.mjs"]) {
            const src = path.join(shimDir, shim);
            try {
              await fs.access(src);
              await fs.copyFile(src, path.join(chunksDir, shim));
            } catch {
              console.warn(`[zyraxon] Warning: shim ${shim} not found at ${src}`);
            }
          }
          const wasmSource = path.resolve(__electron_vite_injected_dirname, "node_modules/sql.js/dist/sql-wasm.wasm");
          try {
            await fs.access(wasmSource);
            await fs.copyFile(wasmSource, path.join(chunksDir, "sql-wasm.wasm"));
            console.log(`[zyraxon] Copied sql-wasm.wasm to ${chunksDir}`);
          } catch {
            console.warn(`[zyraxon] Warning: sql-wasm.wasm not found at ${wasmSource}`);
          }
          console.log(`[zyraxon] Copied bun: protocol shims to ${chunksDir}`);
          const webUiSource = path.join(ZYRAXON_SERVER_DIST, "zyraxon-web-ui.gen.ts");
          const webUiDest = "./out/main/zyraxon-web-ui.gen.ts";
          try {
            await fs.access(webUiSource);
            await fs.copyFile(webUiSource, webUiDest);
          } catch {
          }
        }
      }
    ]
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
        output: {
          format: "cjs",
          entryFileNames: "[name].js"
        }
      }
    }
  },
  renderer: {
    plugins: [appPlugin, sentry],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      sourcemap: true,
      rollupOptions: {
        input: {
          main: "src/renderer/index.html"
        }
      }
    }
  }
});
export {
  electron_vite_config_default as default
};
