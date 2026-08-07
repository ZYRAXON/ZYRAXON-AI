#!/usr/bin/env bun
// Post-build patch: Replace broken jsonc-parser UMD with pre-bundled version
// Runs AFTER electron-vite build and BEFORE electron-builder packages

import * as fs from "node:fs"
import * as path from "node:path"

const chunksDir = path.resolve(import.meta.dirname, "../out/main/chunks")
const serverFile = path.join(chunksDir, "opencode-server.js")
const bundledPath = path.resolve(
  import.meta.dirname,
  "../../../node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js.bundled"
)
const stringInternPath = path.resolve(
  import.meta.dirname,
  "../../../node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/impl/string-intern.js"
)

if (!fs.existsSync(serverFile)) {
  console.log("[patch-jsonc] opencode-server.js not found, skipping")
  process.exit(0)
}

if (!fs.existsSync(bundledPath)) {
  console.warn("[patch-jsonc] main.js.bundled not found, skipping")
  process.exit(0)
}

let serverCode = fs.readFileSync(serverFile, "utf-8")

// Check if UMD exists
if (!serverCode.includes("../../node_modules/.bun/jsonc-parser@")) {
  console.log("[patch-jsonc] No UMD jsonc-parser found, already patched")
  process.exit(0)
}

let bundled = fs.readFileSync(bundledPath, "utf-8")

// --- Inline string-intern ---
const stringInternContent = fs.readFileSync(stringInternPath, "utf-8")
  .replace(/^\uFEFF/, "")
  .replace(/^'use strict';\n/m, "")
  .replace(/^export /gm, "")
bundled = bundled.replace(/^import \{[^}]+\} from '\.\/string-intern';\n/m, "")
bundled = bundled.replace(
  /^(import \{ createScanner \} from '\.\/scanner';\n)/m,
  `${stringInternContent}\n$1`
)

// --- Remove ALL import statements ---
bundled = bundled.replace(/^import \{[^}]+\} from '[^']+';\n/gm, "")
bundled = bundled.replace(/^import \* as \w+ from '[^']+';\n/gm, "")

// --- Remove main.js re-export lines (scanner.X, parser.X, formatter.X, edit.X references) ---
// Match both ESM and CJS forms
bundled = bundled.replace(/^export const \w+ = scanner\.\w+;\n/gm, "")
bundled = bundled.replace(/^export const \w+ = parser\.\w+;\n/gm, "")
bundled = bundled.replace(/^export const \w+ = formatter\.\w+;\n/gm, "")
bundled = bundled.replace(/^export const \w+ = edit\.\w+;\n/gm, "")
bundled = bundled.replace(/^exports\.\w+ = scanner\.\w+;\n/gm, "")
bundled = bundled.replace(/^exports\.\w+ = parser\.\w+;\n/gm, "")
bundled = bundled.replace(/^exports\.\w+ = formatter\.\w+;\n/gm, "")
bundled = bundled.replace(/^exports\.\w+ = edit\.\w+;\n/gm, "")

// --- Remove trailing main.js section (copyright + use strict + function declarations after last export) ---
// Find the LAST occurrence of the Microsoft copyright comment that's followed by 'use strict'
const lastCopyrightIdx = bundled.lastIndexOf("/*------")
if (lastCopyrightIdx !== -1) {
  const afterCopyright = bundled.substring(lastCopyrightIdx)
  const useStrictIdx = afterCopyright.indexOf("'use strict';")
  if (useStrictIdx !== -1) {
    const sectionStart = lastCopyrightIdx
    const sectionContent = afterCopyright.substring(useStrictIdx + 13)
    // Check if this section has function declarations (not just enum IIFEs)
    if (sectionContent.includes("function isDigit") || sectionContent.includes("function repeat")) {
      // This is the main.js implementation section — DON'T remove it, it has real code
      console.log("[patch-jsonc] Found main.js implementation section (keeping)")
    } else {
      // This is just re-export boilerplate — remove it
      bundled = bundled.substring(0, sectionStart).trimEnd() + "\n"
      console.log("[patch-jsonc] Removed trailing re-export section")
    }
  }
}

// --- Clean up ---
bundled = bundled.replace(/^\uFEFF/, "")
bundled = bundled.replace(/^'use strict';\n/m, "")
bundled = bundled.replace(/^\/\/ Pre-bundled.*?\n/m, "")
bundled = bundled.replace(/^\/\/ Source:.*?\n/m, "")

// --- Collect export var names (enum IIFEs) ---
const exportVarNames: string[] = []
for (const m of bundled.matchAll(/^export var (\w+);$/gm)) {
  exportVarNames.push(m[1])
}

// --- Convert ESM exports to CommonJS ---
bundled = bundled
  .replace(/^export function (\w+)/gm, "exports.$1 = function $1")
  .replace(/^export const (\w+)/gm, "exports.$1")
  .replace(/^export class (\w+)/gm, "exports.$1 = class $1")
  .replace(/^export var (\w+);$/gm, "var $1;")

// --- For each enum var, find IIFE and add exports inline ---
for (const name of exportVarNames) {
  const iifeEnd = new RegExp(`\\}\\)\\(${name} \\|\\| \\(${name} = \\{\\}\\)\\);`)
  bundled = bundled.replace(iifeEnd, `})(exports.${name} = ${name} || (${name} = {}));`)
}

// --- Find and replace the broken UMD block ---
const startPattern = /\/\/ \.\.\/\.\.\/node_modules\/\.bun\/jsonc-parser@[\d.]+\/node_modules\/jsonc-parser\/lib\/umd\/main\.js\n/
const endPattern = /\n\/\/ \.\.\/core\/src\/installation\/version\.ts/

const startMatch = serverCode.match(startPattern)
const endMatch = serverCode.match(endPattern)

if (startMatch && endMatch) {
  const startIdx = serverCode.indexOf(startMatch[0])
  const endIdx = serverCode.indexOf(endMatch[0])

  if (startIdx !== -1 && endIdx !== -1) {
    const replacement = [
      "// jsonc-parser (pre-bundled, no asar path issues)",
      "var require_main = __commonJS((exports, module2) => {",
      bundled,
      "});",
      "",
    ].join("\n")

    serverCode =
      serverCode.substring(0, startIdx) +
      replacement +
      serverCode.substring(endIdx + 1)

    fs.writeFileSync(serverFile, serverCode, "utf-8")

    // Verify
    const verify = fs.readFileSync(serverFile, "utf-8")
    const hasBrokenRequire = verify.includes('require2("./impl/format")')
    const hasScannerRef = verify.includes("= scanner.") || verify.includes("= parser.")
    console.log("[patch-jsonc] SUCCESS")
    console.log("[patch-jsonc] Broken require2 removed:", !hasBrokenRequire)
    console.log("[patch-jsonc] Namespace refs removed:", !hasScannerRef)
    console.log("[patch-jsonc] File size:", fs.statSync(serverFile).size, "bytes")
  } else {
    console.error("[patch-jsonc] Could not find start/end indices")
  }
} else {
  console.error("[patch-jsonc] Pattern match failed:", {
    startMatch: !!startMatch,
    endMatch: !!endMatch,
  })
}
