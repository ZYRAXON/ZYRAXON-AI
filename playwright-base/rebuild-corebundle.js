const path = require('path');
const esbuild = require('esbuild');
const fs = require('fs');

const ROOT = __dirname;

async function build() {
  console.log('Building coreBundle.js...');
  
  // First run generate_injected
  console.log('Running generate_injected.js...');
  require('./utils/generate_injected.js');
  
  // Wait a bit for generate_injected to finish
  await new Promise(r => setTimeout(r, 3000));
  
  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, 'packages', 'jarvis-core', 'src', 'coreBundle.ts')],
    outfile: path.join(ROOT, 'packages', 'jarvis-core', 'lib', 'coreBundle.js'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: [
      '../../api.json',
      './help.json',
      'electron',
      'electron/*',
      'chromium-bidi',
      'chromium-bidi/*',
      'mitt',
    ],
    define: {
      __PW_HMR__: 'false',
    },
    plugins: [
      {
        name: 'strip-recorder-imports',
        setup(build) {
          build.onLoad({ filter: /\.ts$/ }, async (args) => {
            let contents = await fs.promises.readFile(args.path, 'utf8');
            let changed = false;
            if (contents.includes('@recorder/')) {
              const newContents = contents
                .replace(/import\s+type\s+\{[^}]*\}\s*from\s*'@recorder\/[^']+';?/g, '')
                .replace(/import\s+type\s+\*\s+as\s+\w+\s+from\s*'@recorder\/[^']+';?/g, '');
              if (newContents !== contents) { contents = newContents; changed = true; }
            }
            return { contents, loader: 'ts' };
          });
        }
      },
      {
        name: 'dynamic-import-to-require',
        setup(build) {
          build.onLoad({ filter: /\.ts$/ }, async (args) => {
            let contents = await fs.promises.readFile(args.path, 'utf8');
            const isJarvisSrc = args.path.includes(path.sep + 'jarvis-browser-core' + path.sep + 'src' + path.sep)
              || args.path.includes(path.sep + 'jarvis' + path.sep + 'src' + path.sep)
              || args.path.includes(path.sep + 'injected' + path.sep + 'src' + path.sep);
            const hasAlias = isJarvisSrc && (contents.includes("'@isomorphic/") || contents.includes("'@utils/"));
            let hasVendored = false;
            const VENDORED_PACKAGES = ['debug', 'ws', 'mime', 'http-proxy-agent', 'https-proxy-agent', 'socks-proxy-agent'];
            for (const pkg of VENDORED_PACKAGES) {
              if (contents.includes("'" + pkg + "'")) { hasVendored = true; break; }
            }
            if (!hasAlias && !hasVendored) return undefined;
            
            if (hasVendored) {
              // Rewrite vendored imports
              for (const pkg of VENDORED_PACKAGES) {
                const re = new RegExp("from\\s+'" + pkg + "'", 'g');
                if (re.test(contents)) {
                  contents = contents.replace(re, "from 'jarvis-core/lib/utilsBundle'");
                }
              }
            }
            
            if (hasAlias) {
              contents = contents.replace(
                /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'@isomorphic\/[^']+';?/g,
                (_, names) => `const {${names}} = require('jarvis-core/lib/coreBundle').iso;`
              );
              contents = contents.replace(
                /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'@utils\/[^']+';?/g,
                (_, names) => `const {${names}} = require('jarvis-core/lib/coreBundle').utils;`
              );
              contents = contents.replace(
                /import\s+type\s+\*\s+as\s+(\w+)\s+from\s*'@isomorphic\/[^']+';?/g,
                (_, ns) => `const ${ns} = require('jarvis-core/lib/coreBundle').iso;`
              );
              contents = contents.replace(
                /import\s+type\s+\*\s+as\s+(\w+)\s+from\s*'@utils\/[^']+';?/g,
                (_, ns) => `const ${ns} = require('jarvis-core/lib/coreBundle').utils;`
              );
            }
            return { contents, loader: 'ts' };
          });
        }
      },
      {
        name: 'externalize-utilsBundle',
        setup(build) {
          build.onResolve({ filter: /utilsBundle/ }, () => ({ path: './utilsBundle', external: true }));
        }
      },
    ],
  });
  
  // Verify
  const outPath = path.join(ROOT, 'packages', 'jarvis-core', 'lib', 'coreBundle.js');
  const outContent = fs.readFileSync(outPath, 'utf8');
  const lines = outContent.split('\n');
  let importCount = 0;
  for (const line of lines) {
    if (/^import\s+/.test(line.trim()) && !line.trim().startsWith('//')) {
      importCount++;
      if (importCount <= 5) console.log('  REMAINING IMPORT:', line.trim().substring(0, 120));
    }
  }
  console.log('Build done! Remaining bare imports:', importCount);
}

build().catch(e => { console.error('BUILD FAILED:', e.message); process.exit(1); });
