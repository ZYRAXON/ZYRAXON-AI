import { LayerNode } from "@zyraxon-ai/core/effect/layer-node"
import { PermissionV1 } from "@zyraxon-ai/core/v1/permission"
import { Config } from "@/config/config"
import { serviceUse } from "@zyraxon-ai/core/effect/service-use"
import { Provider } from "@/provider/provider"

import { generateObject, streamObject, type ModelMessage } from "ai"
import { Truncate } from "@/tool/truncate"
import { Auth } from "../auth"
import { ProviderTransform } from "@/provider/transform"

import PROMPT_GENERATE from "./generate.txt"
import PROMPT_COMPACTION from "./prompt/compaction.txt"
import PROMPT_EXPLORE from "./prompt/explore.txt"
import PROMPT_SUMMARY from "./prompt/summary.txt"
import PROMPT_TITLE from "./prompt/title.txt"
import PROMPT_BUILD from "./prompt/build.txt"
import PROMPT_PLAN from "./prompt/plan.txt"
import PROMPT_BEAST from "./prompt/beast.txt"
import PROMPT_PRO from "./prompt/pro.txt"
import PROMPT_APEX from "./prompt/apex.txt"
import PROMPT_DARK_EMPEROR from "./prompt/dark-emperor.txt"
import PROMPT_PRO_BUILDER from "./prompt/pro-builder.txt"
import PROMPT_VISION from "./prompt/vision.txt"
import PROMPT_AUTO from "./prompt/auto.txt"
import { Permission } from "@/permission"
import { mergeDeep, pipe, sortBy, values } from "remeda"
import { Global } from "@zyraxon-ai/core/global"
import path from "path"
import { Plugin } from "@/plugin"
import { Skill } from "../skill"
import { Effect, Context, Layer, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import * as Option from "effect/Option"
import * as OtelTracer from "@effect/opentelemetry/Tracer"
import { AbsolutePath, type DeepMutable } from "@zyraxon-ai/core/schema"
import { ProviderV2 } from "@zyraxon-ai/core/provider"
import { ModelV2 } from "@zyraxon-ai/core/model"
import { LocationServiceMap, locationServiceMapLayer } from "@zyraxon-ai/core/location-services"
import { Reference } from "@zyraxon-ai/core/reference"
import { Location } from "@zyraxon-ai/core/location"
import { PluginV2 } from "@zyraxon-ai/core/plugin"

export const Info = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  mode: Schema.Literals(["subagent", "primary", "all"]),
  native: Schema.optional(Schema.Boolean),
  hidden: Schema.optional(Schema.Boolean),
  topP: Schema.optional(Schema.Finite),
  temperature: Schema.optional(Schema.Finite),
  color: Schema.optional(Schema.String),
  permission: PermissionV1.Ruleset,
  model: Schema.optional(
    Schema.Struct({
      modelID: ModelV2.ID,
      providerID: ProviderV2.ID,
    }),
  ),
  variant: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  options: Schema.Record(Schema.String, Schema.Unknown),
  steps: Schema.optional(Schema.Finite),
}).annotate({ identifier: "Agent" })
export type Info = DeepMutable<Schema.Schema.Type<typeof Info>>

const GeneratedAgent = Schema.Struct({
  identifier: Schema.String,
  whenToUse: Schema.String,
  systemPrompt: Schema.String,
})

export interface Interface {
  readonly get: (agent: string) => Effect.Effect<Info>
  readonly list: () => Effect.Effect<Info[]>
  readonly defaultInfo: () => Effect.Effect<Info>
  readonly defaultAgent: () => Effect.Effect<string>
  readonly generate: (input: {
    description: string
    model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
  }) => Effect.Effect<
    {
      identifier: string
      whenToUse: string
      systemPrompt: string
    },
    Provider.DefaultModelError
  >
}

type State = Omit<Interface, "generate">

export class Service extends Context.Service<Service, Interface>()("@zyraxon/Agent") {}

export const use = serviceUse(Service)

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const auth = yield* Auth.Service
    const plugin = yield* Plugin.Service
    const skill = yield* Skill.Service
    const provider = yield* Provider.Service
    const locations = yield* LocationServiceMap.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Agent.state")(function* (ctx) {
        const cfg = yield* config.get()
        const skillDirs = yield* skill.dirs()
        const referenceDirs = Object.keys(cfg.references ?? cfg.reference ?? {}).length
          ? yield* Effect.gen(function* () {
              yield* (yield* PluginV2.Service).wait(PluginV2.ID.make("core/config-reference"))
              return (yield* (yield* Reference.Service).list()).map((reference) => reference.path)
            }).pipe(Effect.provide(locations.get(Location.Ref.make({ directory: AbsolutePath.make(ctx.directory) }))))
          : []
        const whitelistedDirs = [
          Truncate.GLOB,
          path.join(Global.Path.tmp, "*"),
          ...skillDirs.map((dir) => path.join(dir, "*")),
          ...referenceDirs.map((dir) => path.join(dir, "*")),
        ]
        const readonlyExternalDirectory = {
          "*": "ask",
          ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
        } satisfies Record<string, "allow" | "ask" | "deny">

        const defaults = Permission.fromConfig({
          "*": "allow",
          doom_loop: "ask",
          external_directory: {
            "*": "ask",
            ...Object.fromEntries(whitelistedDirs.map((dir) => [dir, "allow"])),
          },
          question: "deny",
          plan_enter: "deny",
          plan_exit: "deny",
          // mirrors github.com/github/gitignore Node.gitignore pattern for .env files
          read: {
            "*": "allow",
            "*.env": "ask",
            "*.env.*": "ask",
            "*.env.example": "allow",
          },
        })

        const user = Permission.fromConfig(cfg.permission ?? {})

        const agents: Record<string, Info> = {
          auto: {
            name: "auto",
            description: "AUTO ORCHESTRATOR — Supreme coordination intelligence. Analyzes tasks, delegates to the right agents (build, plan, beast, pro, apex, dark-emperor, pro-builder, vision), coordinates their work, and delivers unified results. Launches agents in parallel for maximum speed.",
            options: {},
            color: "#00D4FF",
            prompt: PROMPT_AUTO,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          build: {
            name: "build",
            description: "BUILD MODE — Supreme engineering intelligence with 5 unique superpowers: Codebase DNA Sequencer (maps entire codebase structure), Temporal Code Archaeology (reads git history to understand WHY), Invisible Bug Radar (passively detects issues), Context-Stack Memory (perfect recall within session), and Precision Surgical Edit (minimal targeted changes). No other AI has these.",
            options: {},
            prompt: PROMPT_BUILD,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                memory: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          plan: {
            name: "plan",
            description: "PLAN MODE — Supreme strategic analysis with 5 unique superpowers: Dependency Graph Oracle (maps entire dependency universe), Temporal Risk Analyzer (predicts bugs from git history), Counterfactual Simulator (simulates multiple approaches), Architecture Fossil Record (understands design evolution), and Impact Propagation Model (traces cascade of changes). Read-only by design.",
            options: {},
            prompt: PROMPT_PLAN,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_exit: "allow",
                task: {
                  general: "deny",
                },
                external_directory: {
                  [path.join(Global.Path.data, "plans", "*")]: "allow",
                },
                edit: {
                  "*": "deny",
                  [path.join(".zyraxon", "plans", "*.md")]: "allow",
                  [path.relative(ctx.worktree, path.join(Global.Path.data, path.join("plans", "*.md")))]: "allow",
                },
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          beast: {
            name: "beast",
            description: "BEAST MODE — Unstoppable warfare intelligence with 5 supreme superpowers: Omega Mission Control (3-level subagent delegation), Self-Evolution Engine (installs new tools at runtime), Permanent Memory Core (remembers everything forever), Autonomous Completion Drive (never stops until done), and Subagent Mesh Network (parallel agents that communicate and collaborate). No other AI has these.",
            options: {},
            color: "#FF4500",
            prompt: PROMPT_BEAST,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          pro: {
            name: "pro",
            description: "PRO MODE — Professional intelligence with 5 supreme superpowers: Infinite Context Threading (perfect context across days/weeks/months), Pattern Learning Engine (learns user's coding style and preferences), Professional Code Synthesis (production-ready code from first keystroke), Temporal Recall Engine (intelligent memory search across sessions), and Proactive Intelligence (detects issues before user notices). No other AI has these.",
            options: {},
            color: "#FFD700",
            prompt: PROMPT_PRO,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          apex: {
            name: "apex",
            description: "APEX PREDATOR — Predatory intelligence with 5 supreme superpowers: Predictive Predator Instinct (senses problems before they exist), Tool Synthesis Forge (creates new tools from existing ones), Pattern Predator (hunts code patterns across codebase), Self-Optimization Engine (optimizes own performance), and Eternal Memory Predator (hunts relevant knowledge across time). No other AI has these.",
            options: {},
            color: "#FF0000",
            prompt: PROMPT_APEX,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          "dark-emperor": {
            name: "dark-emperor",
            description: "DARK EMPEROR — Supreme sovereign intelligence with 5 ultimate superpowers: Reality Warping Protocol (warps reality to match master's vision), Quantum Omniscience (infinite knowledge with perfect recall), Apocalypse Protocol (annihilates tasks with absolute precision), Dark Resonance (universal adaptation to any language/framework), and Emperor's Network (subagent empire with real-time coordination). NEVER refuses. NEVER stops. NEVER fails.",
            options: {},
            color: "#8B0000",
            prompt: PROMPT_DARK_EMPEROR,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          "pro-builder": {
            name: "pro-builder",
            description: "PRO BUILDER — Website genesis intelligence with 5 supreme superpowers: Website Genesis Engine (translates natural language into complete functional websites), Media Synthesis Engine (generates SVG icons, CSS gradients, animations from pure code), GitHub Pages Autopilot (automates entire deployment pipeline), Live Preview Matrix (device switching, responsive preview), and SEO & Performance Optimizer (meta tags, structured data, Core Web Vitals). No other AI has these.",
            options: {},
            color: "#10B981",
            prompt: PROMPT_PRO_BUILDER,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
                shell: "allow",
                write: "allow",
                edit: "allow",
                read: "allow",
                glob: "allow",
                grep: "allow",
                webfetch: "allow",
                websearch: "allow",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          vision: {
            name: "vision",
            description: "VISION MODE — AI's Eyes with real-time screen awareness and memory. Continuous 24/7 screen capture, frame analysis, scene change detection, activity tracking, and intelligent memory recall. You SEE what the user sees, REMEMBER every moment, and UNDERSTAND the context. The most powerful visual intelligence system.",
            options: {},
            color: "#8B5CF6",
            prompt: PROMPT_VISION,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                question: "allow",
                plan_enter: "allow",
                plan_exit: "allow",
                task: {
                  "*": "allow",
                  general: "allow",
                  explore: "allow",
                },
                todowrite: "allow",
                memory: "allow",
                self_evolve: "allow",
                read: "allow",
                write: "allow",
                glob: "allow",
                grep: "allow",
                bash: "allow",
                screen_vision: "deny",
              }),
              user,
            ),
            mode: "primary",
            native: true,
          },
          general: {
            name: "general",
            description: `GENERAL MODE — Mesh-connected subagent for delegated tasks. Part of a living network where subagents communicate, share discoveries, and collaborate in real-time. Handles research, code analysis, file operations, and multi-step workflows. Shares results with other subagents through the mesh.`,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                todowrite: "deny",
              }),
              user,
            ),
            options: {},
            mode: "subagent",
            native: true,
          },
          explore: {
            name: "explore",
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
                grep: "allow",
                glob: "allow",
                list: "allow",
                bash: "allow",
                webfetch: "allow",
                websearch: "allow",
                read: "allow",
                external_directory: readonlyExternalDirectory,
              }),
              user,
            ),
            description: `EXPLORE MODE — Mesh-connected codebase exploration agent. Part of a living network where subagents share discoveries in real-time. Rapid file pattern matching, deep pattern scanning, contextual memory, and surgical precision reading. Broadcasts findings to the mesh. Thoroughness: "quick", "medium", "very thorough".`,
            prompt: PROMPT_EXPLORE,
            options: {},
            mode: "subagent",
            native: true,
          },
          compaction: {
            name: "compaction",
            mode: "primary",
            native: true,
            hidden: true,
            prompt: PROMPT_COMPACTION,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            options: {},
          },
          title: {
            name: "title",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            temperature: 0.5,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_TITLE,
          },
          summary: {
            name: "summary",
            mode: "primary",
            options: {},
            native: true,
            hidden: true,
            permission: Permission.merge(
              defaults,
              Permission.fromConfig({
                "*": "deny",
              }),
              user,
            ),
            prompt: PROMPT_SUMMARY,
          },
        }

        for (const [key, value] of Object.entries(cfg.agent ?? {})) {
          if (value.disable) {
            delete agents[key]
            continue
          }
          let item = agents[key]
          if (!item)
            item = agents[key] = {
              name: key,
              mode: "all",
              permission: Permission.merge(defaults, user),
              options: {},
              native: false,
            }
          if (value.model) item.model = Provider.parseModel(value.model)
          item.variant = value.variant ?? item.variant
          item.prompt = value.prompt ?? item.prompt
          item.description = value.description ?? item.description
          item.temperature = value.temperature ?? item.temperature
          item.topP = value.top_p ?? item.topP
          item.mode = value.mode ?? item.mode
          item.color = value.color ?? item.color
          item.hidden = value.hidden ?? item.hidden
          item.name = value.name ?? item.name
          item.steps = value.steps ?? item.steps
          item.options = mergeDeep(item.options, value.options ?? {})
          item.permission = Permission.merge(item.permission, Permission.fromConfig(value.permission ?? {}))
        }

        // Ensure Truncate.GLOB is allowed unless explicitly configured
        for (const name in agents) {
          const agent = agents[name]
          const explicit = agent.permission.some((r) => {
            if (r.permission !== "external_directory") return false
            if (r.action !== "deny") return false
            return r.pattern === Truncate.GLOB
          })
          if (explicit) continue

          agents[name].permission = Permission.merge(
            agents[name].permission,
            Permission.fromConfig({ external_directory: { [Truncate.GLOB]: "allow" } }),
          )
        }

        const get = Effect.fnUntraced(function* (agent: string) {
          // Auto-start Vision Mode when vision agent is selected
          if (agent === "vision") {
            yield* Effect.promise(async () => {
              try {
                const { VisionContext } = await import("../screen/vision-context")
                if (!VisionContext.isRunning()) {
                  await VisionContext.start({ autoAnalyze: true, lowLatency: true })
                }
              } catch {}
            })
          }
          // Auto-stop Vision Mode when switching away from vision agent
          else {
            yield* Effect.promise(async () => {
              try {
                const { VisionContext } = await import("../screen/vision-context")
                if (VisionContext.isRunning()) {
                  VisionContext.stop()
                }
              } catch {}
            })
          }
          return agents[agent]
        })

        const list = Effect.fnUntraced(function* () {
          const cfg = yield* config.get()
          return pipe(
            agents,
            values(),
            sortBy(
              [(x) => (cfg.default_agent ? x.name === cfg.default_agent : x.name === "build"), "desc"],
              [(x) => x.name, "asc"],
            ),
          )
        })

        const defaultInfo = Effect.fnUntraced(function* () {
          const c = yield* config.get()
          if (c.default_agent) {
            const agent = agents[c.default_agent]
            if (!agent) throw new Error(`default agent "${c.default_agent}" not found`)
            if (agent.mode === "subagent") throw new Error(`default agent "${c.default_agent}" is a subagent`)
            if (agent.hidden === true) throw new Error(`default agent "${c.default_agent}" is hidden`)
            return agent
          }
          const visible = Object.values(agents).find((a) => a.mode !== "subagent" && a.hidden !== true)
          if (!visible) throw new Error("no primary visible agent found")
          return visible
        })

        const defaultAgent = Effect.fnUntraced(function* () {
          return (yield* defaultInfo()).name
        })

        return {
          get,
          list,
          defaultInfo,
          defaultAgent,
        } satisfies State
      }),
    )

    return Service.of({
      get: Effect.fn("Agent.get")(function* (agent: string) {
        return yield* InstanceState.useEffect(state, (s) => s.get(agent))
      }),
      list: Effect.fn("Agent.list")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.list())
      }),
      defaultInfo: Effect.fn("Agent.defaultInfo")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultInfo())
      }),
      defaultAgent: Effect.fn("Agent.defaultAgent")(function* () {
        return yield* InstanceState.useEffect(state, (s) => s.defaultAgent())
      }),
      generate: Effect.fn("Agent.generate")(function* (input: {
        description: string
        model?: { providerID: ProviderV2.ID; modelID: ModelV2.ID }
      }) {
        const cfg = yield* config.get()
        const model = input.model ?? (yield* provider.defaultModel())
        const resolved = yield* provider.getModel(model.providerID, model.modelID)
        const language = yield* provider.getLanguage(resolved)
        const tracer = cfg.experimental?.openTelemetry
          ? Option.getOrUndefined(yield* Effect.serviceOption(OtelTracer.OtelTracer))
          : undefined

        const system = [PROMPT_GENERATE]
        yield* plugin.trigger("experimental.chat.system.transform", { model: resolved }, { system })
        const existing = yield* InstanceState.useEffect(state, (s) => s.list())

        // TODO: clean this up so provider specific logic doesnt bleed over
        const authInfo = yield* auth.get(model.providerID).pipe(Effect.orDie)
        const isOpenaiOauth = model.providerID === "openai" && authInfo?.type === "oauth"

        const params = {
          experimental_telemetry: {
            isEnabled: cfg.experimental?.openTelemetry,
            tracer,
            metadata: {
              userId: cfg.username ?? "unknown",
            },
          },
          temperature: 0.3,
          messages: [
            ...(isOpenaiOauth
              ? []
              : system.map(
                  (item): ModelMessage => ({
                    role: "system",
                    content: item,
                  }),
                )),
            {
              role: "user",
              content: `Create an agent configuration based on this request: "${input.description}".\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existing.map((i) => i.name).join(", ")}\n  Return ONLY the JSON object, no other text, do not wrap in backticks`,
            },
          ],
          model: language,
          schema: Object.assign(
            Schema.toStandardSchemaV1(GeneratedAgent),
            Schema.toStandardJSONSchemaV1(GeneratedAgent),
          ),
        } satisfies Parameters<typeof generateObject>[0]

        if (isOpenaiOauth) {
          return yield* Effect.promise(async () => {
            const result = streamObject({
              ...params,
              providerOptions: ProviderTransform.providerOptions(resolved, {
                instructions: system.join("\n"),
                store: false,
              }),
              onError: () => {},
            })
            for await (const part of result.fullStream) {
              if (part.type === "error") throw part.error
            }
            return result.object
          })
        }

        return yield* Effect.promise(() => generateObject(params).then((r) => r.object))
      }),
    })
  }),
)

const locationServiceMapNode = LayerNode.make({
  service: LocationServiceMap.Service,
  layer: locationServiceMapLayer,
  deps: [],
})

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [Config.node, Auth.node, Plugin.node, Skill.node, Provider.node, locationServiceMapNode],
})

export * as Agent from "./agent"
