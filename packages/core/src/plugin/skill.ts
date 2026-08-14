/// <reference path="../markdown.d.ts" />

export * as SkillPlugin from "./skill"

import { define } from "./internal"
import { Effect } from "effect"
import { AbsolutePath } from "../schema"
import { SkillV2 } from "../skill"
import customizeZyraxonContent from "./skill/customize-zyraxon.md" with { type: "text" }

export const CustomizeZyraxonContent = customizeZyraxonContent

export const Plugin = define({
  id: "skill",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.skill.transform((draft) => {
      draft.source(
        SkillV2.EmbeddedSource.make({
          type: "embedded",
          skill: SkillV2.Info.make({
            name: "customize-zyraxon",
            description:
              "Use ONLY when the user is editing or creating zyraxon's own configuration: zyraxon.json, zyraxon.jsonc, files under .zyraxon/, or files under ~/.config/zyraxon/. Also use when creating or fixing zyraxon agents, subagents, commands, skills, plugins, MCP servers, or permission rules. Do not use for the user's own application code, or for any project that is not configuring zyraxon itself.",
            location: AbsolutePath.make("/builtin/customize-zyraxon.md"),
            content: CustomizeZyraxonContent,
          }),
        }),
      )
    })
  }),
})
