/**
 * SITE CREATE TOOL
 *
 * Creates a new website project in the Pro Builder system.
 * Supports multiple frameworks: HTML, React, Vue, Astro, Svelte, Tailwind, TypeScript.
 * Initializes the directory structure and site configuration.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { getSiteManager, type SiteType, type FrameworkType, type ThemeConfig } from "../pro-builder/engine"

const DESCRIPTION = `Create a new website project in the Pro Builder system.

Actions:
- create: Create a new website with the specified type and options
- list: List all existing websites
- info: Get detailed info about a specific website
- build: Build a website (for frameworks that need compilation)

Website types: portfolio, landing, blog, ecommerce, business, restaurant, saas, dashboard, gallery, custom

Frameworks (choose based on project needs):
- html: Pure HTML/CSS/JS — no build step, fastest for simple sites
- tailwind: HTML + Tailwind CSS via CDN — rapid styling, no build
- react: React + Vite — for complex interactive UIs
- vue: Vue + Vite — for elegant reactive sites
- astro: Astro — for content-heavy sites (blogs, docs)
- svelte: Svelte + Vite — for lightweight reactive sites
- next: Next.js — for SSR/SSG sites (exports static for GitHub Pages)
- typescript: TypeScript + Vite — for type-safe projects

For React/Vue/Astro/Svelte projects:
- The tool creates package.json, vite config, and source files
- Run build action to compile for production
- Output goes to dist/ or out/ directory
- GitHub Pages serves the built output`

const Parameters = Schema.Struct({
  action: Schema.String.annotate({
    description: "Action: create, list, info, or build",
  }),
  name: Schema.optional(Schema.String).annotate({
    description: "Name of the website (for create action)",
  }),
  type: Schema.optional(Schema.String).annotate({
    description: "Website type: portfolio, landing, blog, ecommerce, business, restaurant, saas, dashboard, gallery, custom",
  }),
  framework: Schema.optional(Schema.String).annotate({
    description: "Framework: html, tailwind, react, vue, astro, svelte, next, typescript (default: html)",
  }),
  siteId: Schema.optional(Schema.String).annotate({
    description: "Site ID (for info and build actions)",
  }),
  theme: Schema.optional(Schema.Struct({
    mode: Schema.optional(Schema.String),
    primaryColor: Schema.optional(Schema.String),
    secondaryColor: Schema.optional(Schema.String),
  })).annotate({
    description: "Theme options (for create action)",
  }),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)).annotate({
    description: "Custom metadata: title, description, name, subtitle, about, email, location, github, linkedin, twitter",
  }),
})

export const SiteCreateTool = Tool.define<typeof Parameters>(
  "site_create",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(async () => {
            const manager = await getSiteManager()

            switch (params.action) {
              case "create": {
                if (!params.name) {
                  return { success: false, output: "", error: "Site name is required for create action" }
                }

                const siteType: SiteType = (params.type as SiteType) || "portfolio"
                const framework: FrameworkType = (params.framework as FrameworkType) || "html"

                const site = await manager.createSite({
                  name: params.name,
                  type: siteType,
                  template: siteType,
                  framework,
                  theme: params.theme as Partial<ThemeConfig> | undefined,
                  metadata: params.metadata || {},
                })

                const fs = await import("fs/promises")
                const pathMod = await import("path")

                // Generate project files based on framework
                if (framework === "html" || framework === "tailwind") {
                  // Simple HTML projects — write directly
                  const { getTemplate } = await import("../pro-builder/templates")
                  const template = getTemplate(siteType)
                  const output = template.generate(site)

                  await fs.writeFile(pathMod.join(site.directory, "index.html"), output.html)
                  await fs.writeFile(pathMod.join(site.directory, "style.css"), output.css)
                  await fs.writeFile(pathMod.join(site.directory, "script.js"), output.js)
                } else {
                  // Framework projects — create project structure
                  await createFrameworkProject(site.directory, framework, site.name)
                }

                await manager.saveSiteManifest(site.id)

                // Auto-start the local server and write preview state so the
                // in-app preview iframe shows the site immediately.
                let localUrl = `http://localhost:${site.port}`
                try {
                  localUrl = await manager.startServer(site.id)
                  const { writePreviewState } = await import("../pro-builder/engine")
                  await writePreviewState({
                    url: localUrl,
                    siteName: site.name,
                    siteId: site.id,
                    timestamp: new Date().toISOString(),
                  })
                } catch {
                  // Server start is best-effort; site files still exist on disk.
                }

                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Website "${params.name}" created with ${framework} framework! Preview is now active in the app.`,
                    siteId: site.id,
                    type: siteType,
                    framework,
                    directory: site.directory,
                    port: site.port,
                    previewUrl: localUrl,
                    nextSteps: framework !== "html" && framework !== "tailwind"
                      ? [
                          "1. Edit source files in src/ directory",
                          "2. Use 'build' action to compile for production",
                          "3. Use 'publish' action to deploy to GitHub Pages",
                        ]
                      : [
                          "1. Edit index.html, style.css, script.js directly",
                          "2. Use 'publish' action to deploy to GitHub Pages",
                        ],
                  }, null, 2),
                }
              }

              case "list": {
                const sites = manager.listSites()
                if (sites.length === 0) {
                  return {
                    success: true,
                    output: JSON.stringify({ message: "No websites found. Use create action to make one.", sites: [] }, null, 2),
                  }
                }

                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Found ${sites.length} website(s)`,
                    sites: sites.map(s => ({
                      id: s.id,
                      name: s.name,
                      type: s.type,
                      framework: s.framework,
                      port: s.port,
                      published: s.published,
                      pagesUrl: s.githubPagesUrl,
                      created: s.created,
                    })),
                  }, null, 2),
                }
              }

              case "info": {
                if (!params.siteId) {
                  return { success: false, output: "", error: "siteId is required for info action" }
                }

                const site = manager.getSite(params.siteId)
                if (!site) {
                  return { success: false, output: "", error: `Site not found: ${params.siteId}` }
                }

                return {
                  success: true,
                  output: JSON.stringify({
                    id: site.id,
                    name: site.name,
                    type: site.type,
                    framework: site.framework,
                    directory: site.directory,
                    port: site.port,
                    published: site.published,
                    publishMethod: site.publishMethod,
                    pagesUrl: site.githubPagesUrl,
                    customDomain: site.customDomain,
                    theme: site.theme,
                    media: {
                      images: site.media.images.length,
                      videos: site.media.videos.length,
                      audio: site.media.audio.length,
                    },
                    created: site.created,
                    updated: site.updated,
                  }, null, 2),
                }
              }

              case "build": {
                if (!params.siteId) {
                  return { success: false, output: "", error: "siteId is required for build action" }
                }

                const buildResult = await manager.buildSite(params.siteId)
                return {
                  success: buildResult.success,
                  output: JSON.stringify({
                    message: buildResult.success
                      ? `Site built successfully! Output: ${buildResult.outputDir}`
                      : `Build failed: ${buildResult.error}`,
                    outputDir: buildResult.outputDir,
                    error: buildResult.error,
                  }, null, 2),
                }
              }

              default:
                return { success: false, output: "", error: `Unknown action: ${params.action}. Use create, list, info, or build.` }
            }
          })

          return {
            title: `Site ${params.action}`,
            metadata: {},
            output: result.output || (result.success ? "Action completed successfully" : result.error || "Unknown error"),
          }
        }),
    }
  }),
)

/**
 * Create a framework project with proper structure
 */
async function createFrameworkProject(
  directory: string,
  framework: FrameworkType,
  siteName: string,
): Promise<void> {
  const fs = await import("fs/promises")
  const pathMod = await import("path")

  switch (framework) {
    case "react": {
      // package.json
      await fs.writeFile(pathMod.join(directory, "package.json"), JSON.stringify({
        name: siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          react: "^18.2.0",
          "react-dom": "^18.2.0",
        },
        devDependencies: {
          "@types/react": "^18.2.0",
          "@types/react-dom": "^18.2.0",
          "@vitejs/plugin-react": "^4.0.0",
          typescript: "^5.0.0",
          vite: "^5.0.0",
        },
      }, null, 2))

      // vite.config.ts
      await fs.writeFile(pathMod.join(directory, "vite.config.ts"), `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})
`)

      // tsconfig.json
      await fs.writeFile(pathMod.join(directory, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          useDefineForClassFields: true,
          lib: ["ES2020", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          allowImportingTsExtensions: true,
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: "react-jsx",
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
        },
        include: ["src"],
      }, null, 2))

      // index.html
      await fs.writeFile(pathMod.join(directory, "index.html"), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${siteName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`)

      // src/main.tsx
      await fs.mkdir(pathMod.join(directory, "src"), { recursive: true })
      await fs.writeFile(pathMod.join(directory, "src", "main.tsx"), `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`)

      // src/App.tsx
      await fs.writeFile(pathMod.join(directory, "src", "App.tsx"), `function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
      <h1>${siteName}</h1>
      <p>Edit src/App.tsx to start building.</p>
    </div>
  )
}

export default App
`)

      // src/index.css
      await fs.writeFile(pathMod.join(directory, "src", "index.css"), `* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Inter, sans-serif; background: #0a0a0a; color: #fff; }
`)
      break
    }

    case "vue": {
      await fs.writeFile(pathMod.join(directory, "package.json"), JSON.stringify({
        name: siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite",
          build: "vite build",
          preview: "vite preview",
        },
        dependencies: {
          vue: "^3.3.0",
        },
        devDependencies: {
          "@vitejs/plugin-vue": "^4.0.0",
          typescript: "^5.0.0",
          vite: "^5.0.0",
          "vue-tsc": "^1.0.0",
        },
      }, null, 2))

      await fs.writeFile(pathMod.join(directory, "vite.config.ts"), `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: { outDir: 'dist' },
})
`)

      await fs.writeFile(pathMod.join(directory, "index.html"), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${siteName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`)

      await fs.mkdir(pathMod.join(directory, "src"), { recursive: true })
      await fs.writeFile(pathMod.join(directory, "src", "main.ts"), `import { createApp } from 'vue'
import App from './App.vue'
createApp(App).mount('#app')
`)
      await fs.writeFile(pathMod.join(directory, "src", "App.vue"), `<template>
  <div style="padding: 2rem; font-family: Inter, sans-serif;">
    <h1>${siteName}</h1>
    <p>Edit src/App.vue to start building.</p>
  </div>
</template>
`)
      break
    }

    case "astro": {
      await fs.writeFile(pathMod.join(directory, "package.json"), JSON.stringify({
        name: siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        type: "module",
        scripts: {
          dev: "astro dev",
          build: "astro build",
          preview: "astro preview",
        },
        dependencies: {
          astro: "^3.0.0",
        },
      }, null, 2))

      await fs.writeFile(pathMod.join(directory, "astro.config.mjs"), `import { defineConfig } from 'astro/config';
export default defineConfig({ outDir: 'dist' });
`)

      await fs.mkdir(pathMod.join(directory, "src", "pages"), { recursive: true })
      await fs.writeFile(pathMod.join(directory, "src", "pages", "index.astro"), `---
---
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${siteName}</title>
  </head>
  <body style="font-family: Inter, sans-serif; background: #0a0a0a; color: #fff; padding: 2rem;">
    <h1>${siteName}</h1>
    <p>Edit src/pages/index.astro to start building.</p>
  </body>
</html>
`)
      break
    }

    default: {
      // For other frameworks, create a minimal structure
      await fs.writeFile(pathMod.join(directory, "package.json"), JSON.stringify({
        name: siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        private: true,
        scripts: {
          dev: "vite",
          build: "vite build",
        },
        devDependencies: {
          vite: "^5.0.0",
          typescript: "^5.0.0",
        },
      }, null, 2))

      await fs.mkdir(pathMod.join(directory, "src"), { recursive: true })
      await fs.writeFile(pathMod.join(directory, "index.html"), `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${siteName}</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`)
      await fs.writeFile(pathMod.join(directory, "src", "main.ts"), `console.log('${siteName} - Edit src/main.ts to start building.')
`)
    }
  }
}
