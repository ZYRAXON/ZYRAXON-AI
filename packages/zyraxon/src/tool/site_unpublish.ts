/**
 * SITE UNPUBLISH TOOL
 * 
 * Stops publishing a website and removes its public access.
 * The site continues to run locally.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { getSiteManager } from "../pro-builder/engine"

const DESCRIPTION = `Unpublish a website — stop its public access via Cloudflare Tunnel.

The site will continue running locally at http://localhost:{port} but will no longer be accessible from the internet.

Use this when you want to take a website offline from the public internet while keeping it available locally for development.`

const Parameters = Schema.Struct({
  siteId: Schema.String.annotate({
    description: "The site ID to unpublish",
  }),
})

export const SiteUnpublishTool = Tool.define<typeof Parameters>(
  "site_unpublish",
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

            if (!site.published) {
              return {
                success: true,
                output: JSON.stringify({
                  message: `"${site.name}" is already unpublished.`,
                  siteId: site.id,
                  localUrl: `http://localhost:${site.port}`,
                }, null, 2),
              }
            }

            await manager.unpublishSite(params.siteId)

            return {
              success: true,
              output: JSON.stringify({
                message: `Website "${site.name}" has been unpublished.`,
                siteId: site.id,
                localUrl: `http://localhost:${site.port}`,
                note: "The site is still running locally. Use site_publish to make it public again.",
              }, null, 2),
            }
          })

          return {
            title: "Site Unpublished",
            metadata: {},
            output: result.output || (result.success ? "Done" : result.error || "Unknown error"),
          }
        }),
    }
  }),
)
