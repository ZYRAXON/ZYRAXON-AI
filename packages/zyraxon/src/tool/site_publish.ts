/**
 * SITE PUBLISH TOOL
 *
 * Publishes a website to GitHub Pages (free forever, custom domains supported).
 * Also handles starting/stopping the local server for preview.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { getSiteManager, writePreviewState } from "../pro-builder/engine"

const DESCRIPTION = `Publish a website to GitHub Pages (free forever).

Actions:
- publish: Push site files to GitHub and enable GitHub Pages
- unpublish: Remove the site from GitHub Pages
- start: Start the local server for preview (localhost only)
- stop: Stop the local server
- status: Get the current status of a site

When published via GitHub Pages:
- The site gets a permanent URL like https://username.github.io/repo-name
- Anyone on the internet can access it
- The URL is PERMANENT — it never changes
- Custom domains are supported (free)
- The site stays live even when the app is closed`

const Parameters = Schema.Struct({
  action: Schema.String.annotate({
    description: "Action: publish, unpublish, start, stop, or status",
  }),
  siteId: Schema.String.annotate({
    description: "The site ID to manage",
  }),
})

export const SitePublishTool = Tool.define<typeof Parameters>(
  "site_publish",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(async () => {
            const manager = await getSiteManager()

            const site = manager.getSite(params.siteId)
            if (!site) {
              return { success: false, output: "", error: `Site not found: ${params.siteId}` }
            }

            switch (params.action) {
              case "publish": {
                try {
                  const { pagesUrl, repoUrl } = await manager.publishSite(params.siteId)
                  return {
                    success: true,
                    output: JSON.stringify({
                      message: `Website "${site.name}" is now LIVE on GitHub Pages!`,
                      siteId: site.id,
                      localUrl: `http://localhost:${site.port}`,
                      pagesUrl: pagesUrl,
                      repoUrl: repoUrl,
                      status: "published",
                      note: "The website is now permanently hosted on GitHub Pages. It stays live even when the app is closed.",
                    }, null, 2),
                  }
                } catch (error: any) {
                  return {
                    success: false,
                    output: "",
                    error: `Failed to publish: ${error.message}`,
                  }
                }
              }

              case "unpublish": {
                await manager.unpublishSite(params.siteId)
                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Website "${site.name}" has been removed from GitHub Pages.`,
                    siteId: site.id,
                    localUrl: `http://localhost:${site.port}`,
                    status: "unpublished",
                    note: "The site can still be previewed locally.",
                  }, null, 2),
                }
              }

              case "start": {
                const url = await manager.startServer(params.siteId)
                // Write preview state so the in-app iframe shows the site
                await writePreviewState({
                  url,
                  siteName: site.name,
                  siteId: site.id,
                  timestamp: new Date().toISOString(),
                })
                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Website "${site.name}" server started. Preview is now active in the app.`,
                    siteId: site.id,
                    localUrl: url,
                    status: "running",
                  }, null, 2),
                }
              }

              case "stop": {
                await manager.stopServer(params.siteId)
                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Website "${site.name}" server stopped.`,
                    siteId: site.id,
                    status: "stopped",
                  }, null, 2),
                }
              }

              case "status": {
                return {
                  success: true,
                  output: JSON.stringify({
                    siteId: site.id,
                    name: site.name,
                    port: site.port,
                    localUrl: `http://localhost:${site.port}`,
                    published: site.published,
                    publishMethod: site.publishMethod,
                    githubRepo: site.githubRepo,
                    pagesUrl: site.githubPagesUrl,
                    customDomain: site.customDomain,
                    status: site.published ? "published" : "local-only",
                  }, null, 2),
                }
              }

              default:
                return { success: false, output: "", error: `Unknown action: ${params.action}. Use publish, unpublish, start, stop, or status.` }
            }
          })

          return {
            title: `Site ${params.action}`,
            metadata: {},
            output: result.output || (result.success ? "Action completed" : result.error || "Unknown error"),
          }
        }),
    }
  }),
)
