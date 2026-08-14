/**
 * SVG GENERATE TOOL
 * 
 * Generates custom SVG icons, illustrations, and logos.
 * Always preferred over emoji or raster images for website decorations.
 */

import { Effect, Schema } from "effect"
import { Tool } from "../tool/tool"
import { getSiteManager } from "../pro-builder/engine"
import { MediaManager } from "../pro-builder/media-manager"

const DESCRIPTION = `Generate custom SVG icons, illustrations, and logos.

Types:
- icon: Small SVG icon (24x24 or custom size) for UI elements
- illustration: Larger SVG illustration for hero sections, empty states
- logo: Brand logo SVG with gradient backgrounds

Styles:
- outline: Stroke-based icons (like Heroicons, Lucide)
- filled: Solid fill icons
- gradient: Gradient-colored icons

The generated SVGs can be:
1. Used inline in HTML (recommended for icons)
2. Saved as .svg files in the site's assets/icons directory
3. Used in CSS backgrounds

ALWAYS use SVG icons instead of emoji in websites. This tool generates the SVGs you need.`

const Parameters = Schema.Struct({
  type: Schema.String.annotate({
    description: "Type: icon, illustration, or logo",
  }),
  style: Schema.optional(Schema.String).annotate({
    description: "Style: outline, filled, or gradient (default: outline)",
  }),
  subject: Schema.optional(Schema.String).annotate({
    description: "What the icon represents (e.g., 'code', 'rocket', 'shield', 'arrow-right')",
  }),
  colors: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: "Color palette as hex codes (e.g., ['#6366f1', '#8b5cf6'])",
  }),
  size: Schema.optional(Schema.Number).annotate({
    description: "Size in pixels (default: 24 for icons, 120 for illustrations, 48 for logos)",
  }),
  siteId: Schema.optional(Schema.String).annotate({
    description: "Site ID to save the SVG file to (optional)",
  }),
  filename: Schema.optional(Schema.String).annotate({
    description: "Filename for the saved SVG (without .svg extension)",
  }),
})

export const SvgGenerateTool = Tool.define<typeof Parameters>(
  "svg_generate",
  Effect.gen(function* () {
    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const result = yield* Effect.promise(async () => {
            const manager = await getSiteManager()
            const mediaManager = new MediaManager("")

            const defaultSizes: Record<string, number> = {
              icon: 24,
              illustration: 120,
              logo: 48,
            }

            const size = params.size || defaultSizes[params.type] || 24
            const colors = params.colors || ["#6366f1", "#8b5cf6"]
            const style = (params.style as any) || "outline"

            let svg: string

            if (params.type === "logo") {
              svg = mediaManager.generateSvgIcon({
                type: "logo",
                style,
                colors,
                size,
              })
            } else if (params.type === "illustration") {
              svg = generateIllustration(params.subject || "abstract", size, colors)
            } else {
              svg = mediaManager.generateSvgIcon({
                type: "icon",
                style,
                subject: params.subject,
                colors,
                size,
              })
            }

            // Save to file if siteId provided
            let filePath: string | null = null
            if (params.siteId) {
              const site = manager.getSite(params.siteId)
              if (site) {
                const filename = params.filename || `svg-${params.type}-${Date.now()}`
                filePath = await mediaManager.saveSvg(
                  svg,
                  `${site.directory}/assets/icons`,
                  filename
                )
              }
            }

            return {
              success: true,
              output: JSON.stringify({
                message: `SVG ${params.type} generated successfully`,
                type: params.type,
                style,
                size: `${size}x${size}`,
                svg,
                filePath,
                usage: filePath
                  ? `File saved. Reference in HTML: <img src="assets/icons/${params.filename || "svg"}.svg">`
                  : `Use inline in HTML: ${svg.substring(0, 100)}...`,
              }, null, 2),
            }
          })

          return {
            title: "SVG Generated",
            metadata: {},
            output: result.output,
          }
        }),
    }
  }),
)

/**
 * Generate an SVG illustration
 */
function generateIllustration(subject: string, size: number, colors: string[]): string {
  const id = `illust-${Date.now()}`
  
  // Abstract illustration with shapes
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
  <defs>
    <linearGradient id="${id}-grad" x1="0" y1="0" x2="${size}" y2="${size}">
      <stop offset="0%" stop-color="${colors[0]}"/>
      <stop offset="100%" stop-color="${colors[1] || colors[0]}"/>
    </linearGradient>
  </defs>
  <circle cx="${size * 0.5}" cy="${size * 0.5}" r="${size * 0.4}" fill="url(#${id}-grad)" opacity="0.1"/>
  <circle cx="${size * 0.35}" cy="${size * 0.4}" r="${size * 0.15}" fill="${colors[0]}" opacity="0.6"/>
  <circle cx="${size * 0.65}" cy="${size * 0.35}" r="${size * 0.12}" fill="${colors[1] || colors[0]}" opacity="0.8"/>
  <rect x="${size * 0.3}" y="${size * 0.55}" width="${size * 0.4}" height="${size * 0.08}" rx="${size * 0.04}" fill="${colors[0]}" opacity="0.4"/>
  <rect x="${size * 0.35}" y="${size * 0.68}" width="${size * 0.3}" height="${size * 0.06}" rx="${size * 0.03}" fill="${colors[1] || colors[0]}" opacity="0.3"/>
</svg>`
}
