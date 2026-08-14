import { AgentV2 } from "@zyraxon-ai/core/agent"
import { Agent } from "@/agent/agent"
import { Catalog } from "@zyraxon-ai/core/catalog"
import { EventV2 } from "@zyraxon-ai/core/event"
import { Location } from "@zyraxon-ai/core/location"
import { LocationServiceMap } from "@zyraxon-ai/core/location-services"
import { ModelV2 } from "@zyraxon-ai/core/model"
import { AbsolutePath } from "@zyraxon-ai/core/schema"
import { SessionV2 } from "@zyraxon-ai/core/session"
import { WorkspaceV2 } from "@zyraxon-ai/core/workspace"
import { createHash } from "node:crypto"
import { Effect, Option, Result, Schema, Stream } from "effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import type { Payload } from "@zyraxon-ai/schema/event"

const subscriberCapacity = 256

const ChatContent = Schema.Union([
  Schema.String,
  Schema.Null,
  Schema.Array(
    Schema.Struct({
      type: Schema.String.pipe(Schema.optional),
      text: Schema.String,
    }),
  ),
])

const ChatMessage = Schema.Struct({
  role: Schema.String,
  content: ChatContent,
})

const ChatCompletionRequest = Schema.Struct({
  model: Schema.String,
  messages: Schema.Array(ChatMessage),
  stream: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
})
type ChatCompletionRequest = typeof ChatCompletionRequest.Type

type DeltaChunk = { readonly tag: "delta"; readonly content: string }
type TerminalChunk = { readonly tag: "finish"; readonly reason: string } | { readonly tag: "error"; readonly message: string }
type TurnChunk = DeltaChunk | TerminalChunk

function sessionIDFor(directory: string, model: string, agent?: string) {
  const hash = createHash("sha256").update([directory, model, agent ?? ""].join("|")).digest("hex").slice(0, 32)
  return SessionV2.ID.make("ses_" + hash)
}

function textOf(content: ChatCompletionRequest["messages"][number]["content"]) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) return content.map((part) => part.text).join("")
  return ""
}

function lastUserText(messages: ChatCompletionRequest["messages"]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message?.role === "user") return textOf(message.content)
  }
  return ""
}

function locationRef(request: HttpServerRequest.HttpServerRequest): Location.Ref {
  const query = new URL(request.url, "http://localhost").searchParams
  const workspaceID = query.get("location[workspace]") || request.headers["x-zyraxon-workspace"]
  const directory =
    query.get("location[directory]") ||
    (request.headers["x-zyraxon-directory"] ? decode(request.headers["x-zyraxon-directory"]) : process.cwd())
  return Location.Ref.make({
    directory: AbsolutePath.make(directory),
    workspaceID: workspaceID ? WorkspaceV2.ID.make(workspaceID) : undefined,
  })
}

function decode(input: string) {
  try {
    return decodeURIComponent(input)
  } catch {
    return input
  }
}

function modelRef(model: string) {
  const parsed = ModelV2.parse(model)
  return { model: ModelV2.Ref.make({ id: parsed.modelID, providerID: parsed.providerID }), parsed }
}

// Model ids served by `/v1/models` are mode-prefixed (`build/google/gemini-3-flash`).
// This splits the mode prefix off, falling back to the raw model id when the
// caller passes a plain `providerID/modelID`.
function splitMode(model: string, modes: string[]): { mode: string | undefined; model: string } {
  const slash = model.indexOf("/")
  if (slash <= 0) return { mode: undefined, model }
  const head = model.slice(0, slash)
  if (modes.includes(head)) return { mode: head, model: model.slice(slash + 1) }
  return { mode: undefined, model }
}

function finishReason(reason: string) {
  if (reason === "content-filter") return "content_filter"
  return reason
}

function chunkOf(event: Payload): Option.Option<TurnChunk> {
  switch (event.type) {
    case "session.next.text.delta": {
      const data = event.data as { sessionID: string; delta: string }
      return Option.some({ tag: "delta", content: data.delta })
    }
    case "session.next.step.ended": {
      const data = event.data as { finish: string }
      if (data.finish === "tool-calls") return Option.none()
      return Option.some({ tag: "finish", reason: finishReason(data.finish) })
    }
    case "session.next.step.failed": {
      const data = event.data as { error: { message: string } }
      return Option.some({ tag: "error", message: data.error.message })
    }
    default:
      return Option.none()
  }
}

function sseData(data: string) {
  return `data: ${data}\n\n`
}

function chatChunk(id: string, created: number, model: string, delta: Record<string, unknown>, finish: string | null) {
  return JSON.stringify({
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })
}

const openaiBridgeRoute = HttpRouter.use((router) =>
  Effect.gen(function* () {
    const session = yield* SessionV2.Service
    const events = yield* EventV2.Service
    const locations = yield* LocationServiceMap.Service
    const agents = yield* Agent.Service

    // Modes are primary ZYRAXON agents surfaced as mode prefixes on model
    // ids (e.g. `build/google/gemini-3-flash`) so the editor's model picker
    // exposes the same 9 modes as the agent. `x-zyraxon-agent` on the chat
    // request selects the mode explicitly when present.
    const modes = (yield* agents.list())
      .filter((info) => info.mode === "primary")
      .map((info) => info.name)

    const handleModels = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const catalog = yield* Catalog.Service.pipe(Effect.provide(locations.get(locationRef(request))))
      const models = yield* catalog.model.available()
      const data = models.flatMap((model) =>
        modes.map((mode) => ({
          id: `${mode}/${model.providerID}/${model.id}`,
          object: "model",
          owned_by: model.providerID,
          created: Math.floor(model.time.released),
        })),
      )
      return yield* HttpServerResponse.json({ object: "list", data })
    })

    const handleChat = Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const body = yield* HttpServerRequest.schemaBodyJson(ChatCompletionRequest)
      const { mode, model } = splitMode(body.model, modes)
      const resolved = modelRef(model)
      const ref = locationRef(request)
      const agent = request.headers["x-zyraxon-agent"] ?? mode
      const sessionID = sessionIDFor(ref.directory, model, agent)
      yield* session.create({ id: sessionID, agent: agent ? AgentV2.ID.make(agent) : undefined, model: resolved.model, location: ref })
      const prompt = lastUserText(body.messages)
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      yield* session.prompt({ sessionID, prompt: { text: prompt } })

      const turn = live.pipe(
        Stream.filter((event) => (event.data as { sessionID?: string }).sessionID === sessionID),
        Stream.filterMap((event) => Result.fromOption(() => undefined)(chunkOf(event))),
        Stream.takeUntil((chunk): chunk is TerminalChunk => chunk.tag === "finish" || chunk.tag === "error"),
      )

      if (!body.stream) {
        const chunks = yield* turn.pipe(Stream.runCollect)
        let content = ""
        for (const chunk of chunks) {
          if (chunk.tag === "delta") content += chunk.content
        }
        return yield* HttpServerResponse.json({
          id: `chatcmpl-${EventV2.ID.create()}`,
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: body.model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
        })
      }

      const id = `chatcmpl-${EventV2.ID.create()}`
      const created = Math.floor(Date.now() / 1000)
      const output = Stream.make(sseData(chatChunk(id, created, body.model, { role: "assistant" }, null))).pipe(
        Stream.concat(
          turn.pipe(
            Stream.map((chunk) => {
              if (chunk.tag === "delta") return sseData(chatChunk(id, created, body.model, { content: chunk.content }, null))
              if (chunk.tag === "error") return sseData(JSON.stringify({ error: { message: chunk.message } }))
              return sseData(chatChunk(id, created, body.model, {}, chunk.reason))
            }),
            Stream.concat(Stream.succeed(sseData("[DONE]"))),
          ),
        ),
        Stream.encodeText,
        Stream.ensuring(Effect.logInfo("openai chat completion closed", { sessionID })),
      )
      return HttpServerResponse.stream(output, {
        contentType: "text/event-stream",
        headers: {
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
          "X-Content-Type-Options": "nosniff",
        },
      })
    })

    yield* router.add("GET", "/v1/models", () => handleModels)
    yield* router.add("POST", "/v1/chat/completions", () => handleChat)
  }),
)

export const OpenAICompat = { layer: openaiBridgeRoute }
