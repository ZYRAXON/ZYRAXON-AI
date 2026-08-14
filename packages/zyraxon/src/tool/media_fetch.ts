/**
 * MEDIA FETCH TOOL
 * 
 * Downloads media (images, videos, audio) from the internet.
 * Uses free sources and saves to the site's assets directory.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { getSiteManager } from "../pro-builder/engine"
import { MediaManager } from "../pro-builder/media-manager"

const DESCRIPTION = `Download media from the internet for a website project.

Actions:
- search_image: Search for images matching a query
- search_video: Search for videos matching a query  
- download: Download a specific URL to the site's assets
- list_icons: List available SVG icon names
- get_icon: Get an SVG icon by name
- generate_icon: Generate a custom SVG icon with specified colors and style

All media is saved to the site's assets directory:
- Images: assets/images/
- Videos: assets/videos/
- Audio: assets/audio/
- Icons: assets/icons/

Free sources used:
- Images: Unsplash, Pexels, Pixabay
- Videos: Pexels Videos, Pixabay Videos
- Icons: Custom SVG generation

SVG icons are ALWAYS preferred over raster images for icons and decorations.`

const Parameters = Schema.Struct({
  action: Schema.String.annotate({
    description: "Action: search_image, search_video, download, list_icons, get_icon, generate_icon",
  }),
  siteId: Schema.optional(Schema.String).annotate({
    description: "The site ID to save media to (required for download)",
  }),
  query: Schema.optional(Schema.String).annotate({
    description: "Search query for images/videos",
  }),
  url: Schema.optional(Schema.String).annotate({
    description: "Direct URL to download (for download action)",
  }),
  filename: Schema.optional(Schema.String).annotate({
    description: "Filename for the downloaded file",
  }),
  iconName: Schema.optional(Schema.String).annotate({
    description: "SVG icon name (for get_icon action)",
  }),
  iconStyle: Schema.optional(Schema.String).annotate({
    description: "Icon style: outline, filled, gradient (for generate_icon)",
  }),
  iconColors: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Colors for generated icon (for generate_icon)",
  }),
  iconSize: Schema.optional(Schema.Number).annotate({
    description: "Size in pixels for generated icon (for generate_icon)",
  }),
  count: Schema.optional(Schema.Number).annotate({
    description: "Number of results to return (default: 5)",
  }),
})

export const MediaFetchTool = Tool.define<typeof Parameters>(
  "media_fetch",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(async () => {
            const manager = await getSiteManager()

            switch (params.action) {
              case "search_image": {
                if (!params.query) {
                  return { success: false, output: "", error: "query is required for search_image" }
                }

                const siteDir = params.siteId
                  ? manager.getSite(params.siteId)?.directory || ""
                  : ""

                const mediaManager = new MediaManager(siteDir)
                const results = await mediaManager.searchImages(params.query, params.count || 5)

                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Found ${results.length} images for "${params.query}"`,
                    results: results.map(r => ({
                      id: r.id,
                      url: r.url,
                      source: r.source,
                      dimensions: `${r.width}x${r.height}`,
                    })),
                    note: "Use download action with the URL to save an image to your site.",
                  }, null, 2),
                }
              }

              case "search_video": {
                if (!params.query) {
                  return { success: false, output: "", error: "query is required for search_video" }
                }

                const siteDir = params.siteId
                  ? manager.getSite(params.siteId)?.directory || ""
                  : ""

                const mediaManager = new MediaManager(siteDir)
                const results = await mediaManager.searchVideos(params.query, params.count || 3)

                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Found ${results.length} video sources for "${params.query}"`,
                    results: results.map(r => ({
                      id: r.id,
                      source: r.source,
                      searchUrl: r.url,
                    })),
                    note: "Visit the search URL to find and download specific videos.",
                  }, null, 2),
                }
              }

              case "download": {
                if (!params.url || !params.siteId) {
                  return { success: false, output: "", error: "url and siteId are required for download" }
                }

                const site = manager.getSite(params.siteId)
                if (!site) {
                  return { success: false, output: "", error: `Site not found: ${params.siteId}` }
                }

                const mediaManager = new MediaManager(site.directory)
                const filename = params.filename || `media-${Date.now()}`
                const ext = params.url.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|wav)/i)?.[1] || "jpg"
                const fullFilename = filename.includes(".") ? filename : `${filename}.${ext}`

                // Determine target directory based on extension
                let targetDir: string
                if (["mp4", "webm"].includes(ext)) {
                  targetDir = `${site.directory}/assets/videos`
                } else if (["mp3", "wav"].includes(ext)) {
                  targetDir = `${site.directory}/assets/audio`
                } else {
                  targetDir = `${site.directory}/assets/images`
                }

                const downloadResult = await mediaManager.downloadFile(params.url, targetDir, fullFilename)

                if (downloadResult.success) {
                  return {
                    success: true,
                    output: JSON.stringify({
                      message: `Downloaded "${fullFilename}" successfully!`,
                      filename: fullFilename,
                      path: downloadResult.filePath,
                      size: `${(downloadResult.size / 1024).toFixed(1)} KB`,
                      format: downloadResult.format,
                    }, null, 2),
                  }
                }

                return {
                  success: false,
                  output: "",
                  error: `Download failed: ${downloadResult.error}`,
                }
              }

              case "list_icons": {
                const mediaManager = new MediaManager("")
                const icons = mediaManager.getAvailableIcons()

                return {
                  success: true,
                  output: JSON.stringify({
                    message: `Found ${icons.length} available SVG icons`,
                    icons,
                    note: "Use get_icon action with an icon name to get its SVG code.",
                  }, null, 2),
                }
              }

              case "get_icon": {
                if (!params.iconName) {
                  return { success: false, output: "", error: "iconName is required for get_icon" }
                }

                const mediaManager = new MediaManager("")
                const svg = mediaManager.getSvgIcon(params.iconName)

                if (!svg) {
                  return { success: false, output: "", error: `Icon not found: ${params.iconName}` }
                }

                // Save to site if siteId provided
                let filePath: string | null = null
                if (params.siteId) {
                  const site = manager.getSite(params.siteId)
                  if (site) {
                    filePath = await mediaManager.saveSvg(svg, `${site.directory}/assets/icons`, `${params.iconName}.svg`)
                  }
                }

                return {
                  success: true,
                  output: JSON.stringify({
                    message: `SVG icon "${params.iconName}" retrieved`,
                    icon: svg,
                    filePath: filePath,
                  }, null, 2),
                }
              }

              case "generate_icon": {
                const mediaManager = new MediaManager("")
                const svg = mediaManager.generateSvgIcon({
                  type: "icon",
                  style: (params.iconStyle as any) || "outline",
                  subject: params.query,
                  colors: params.iconColors,
                  size: params.iconSize,
                })

                // Save to site if siteId provided
                let filePath: string | null = null
                if (params.siteId) {
                  const site = manager.getSite(params.siteId)
                  if (site) {
                    const filename = `custom-icon-${Date.now()}`
                    filePath = await mediaManager.saveSvg(svg, `${site.directory}/assets/icons`, `${filename}.svg`)
                  }
                }

                return {
                  success: true,
                  output: JSON.stringify({
                    message: "Custom SVG icon generated",
                    icon: svg,
                    filePath: filePath,
                  }, null, 2),
                }
              }

              default:
                return { success: false, output: "", error: `Unknown action: ${params.action}` }
            }
          })

          return {
            title: `Media ${params.action}`,
            metadata: {},
            output: result.output || (result.success ? "Done" : result.error || "Unknown error"),
          }
        }),
    }
  }),
)
