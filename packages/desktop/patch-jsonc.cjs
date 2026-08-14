const fs = require('fs');
const path = require('path');

const serverDest = path.join(__dirname, 'out/main/chunks/zyraxon-server.js');
const bundledPath = path.join(__dirname, '../../node_modules/.bun/jsonc-parser@3.3.1/node_modules/jsonc-parser/lib/esm/main.js.bundled');

let code = fs.readFileSync(serverDest, 'utf-8');
let bundled = fs.readFileSync(bundledPath, 'utf-8');

// Remove BOM, 'use strict', and comment header
bundled = bundled.replace(/^\uFEFF/, '').replace(/^'use strict';\n/m, '').replace(/^\/\/ Pre-bundled.*?\n/m, '');

// Collect export var names
const exportVarNames = [];
const evRe = /^export var (\w+);$/gm;
let m;
while ((m = evRe.exec(bundled)) !== null) exportVarNames.push(m[1]);

// Convert all export patterns
bundled = bundled
  .replace(/^export function (\w+)/gm, 'exports.$1 = function $1')
  .replace(/^export const (\w+)/gm, 'exports.$1')
  .replace(/^export class (\w+)/gm, 'exports.$1 = class $1')
  .replace(/^export var (\w+);$/gm, 'var $1;');

// For each exported var, find IIFE and add exports inline
for (const name of exportVarNames) {
  // })(Name || (Name = {}));
  const iifeEnd = new RegExp(`\\}\\)\\(${name} \\|\\| \\(${name} = \\{\\}\\)\\);`);
  const replacement = `})(exports.${name} = ${name} || (${name} = {}));`;
  bundled = bundled.replace(iifeEnd, replacement);
}

// Find markers — use the already-patched markers
const startPattern = /\/\/ jsonc-parser \(pre-bundled, no asar path issues\)\nvar require_main = __commonJS\(\(exports, module2\) => \{\n/;
const endPattern = /\n\/\/ \.\.\/core\/src\/installation\/version\.ts/;

const sm = code.match(startPattern);
const em = code.match(endPattern);

if (sm && em) {
  const startIdx = code.indexOf(sm[0]);
  const endIdx = code.indexOf(em[0]);
  const replacement = '// jsonc-parser (pre-bundled, no asar path issues)\nvar require_main = __commonJS((exports, module2) => {\n' + bundled + '});\n\n';
  code = code.substring(0, startIdx) + replacement + code.substring(endIdx + 1);
  fs.writeFileSync(serverDest, code, 'utf-8');
  
  // Verify
  const verify = fs.readFileSync(serverDest, 'utf-8');
  const remaining = verify.match(/^export var \w+;$/gm);
  console.log('SUCCESS');
  console.log('File size:', fs.statSync(serverDest).size, 'bytes');
  console.log('Export vars converted:', exportVarNames);
  console.log('Remaining export var:', remaining || 'NONE');
  console.log('exports.ScanError:', verify.includes('exports.ScanError'));
  console.log('exports.SyntaxKind:', verify.includes('exports.SyntaxKind'));
  console.log('exports.ParseErrorCode:', verify.includes('exports.ParseErrorCode'));
  console.log('exports.parse:', verify.includes('exports.parse = function parse'));
  console.log('exports.createScanner:', verify.includes('exports.createScanner = function createScanner'));
} else {
  console.log('ERROR: Patterns not found');
  console.log('Start:', !!sm, 'End:', !!em);
}
