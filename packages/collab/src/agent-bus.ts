import { Effect, Queue, PubSub, Context, type Scope } from "effect"
import type { AgentMessage, AgentID, CollabEvent } from "./types"

const newMessageId = (): string => {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return cryptoObj?.randomUUID ? cryptoObj.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface AgentBusInterface {
  // Subscribe to messages for a specific agent
  readonly subscribe: (agentId: AgentID, callback: (message: AgentMessage) => void) => Effect.Effect<void, never, Scope.Scope>

  // Unsubscribe from messages
  readonly unsubscribe: (agentId: AgentID) => Effect.Effect<void>

  // Publish a message
  readonly publish: (message: AgentMessage) => Effect.Effect<void>

  // Broadcast to all agents
  readonly broadcast: (from: AgentID, type: AgentMessage["type"], payload: unknown) => Effect.Effect<void>

  // Subscribe to all events (for dashboard)
  readonly subscribeEvents: (callback: (event: CollabEvent) => void) => Effect.Effect<void>

  // Emit a collaboration event
  readonly emitEvent: (event: CollabEvent) => Effect.Effect<void>

  // Get all registered agents
  readonly getSubscribers: () => Effect.Effect<AgentID[]>
}

export class AgentBus extends Context.Service<AgentBus, AgentBusInterface>()("@zyraxon/AgentBus") {}

export const make = Effect.gen(function* () {
  // PubSub for agent messages
  const messagePubSub = yield* PubSub.unbounded<AgentMessage>()

  // PubSub for collaboration events
  const eventPubSub = yield* PubSub.unbounded<CollabEvent>()

  // Subscriber queues per agent
  const subscribers = new Map<AgentID, Queue.Queue<AgentMessage>>()

  // Event subscriber callbacks
  const eventCallbacks = new Set<(event: CollabEvent) => void>()

  const subscribe = (agentId: AgentID, callback: (message: AgentMessage) => void) =>
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<AgentMessage>()
      subscribers.set(agentId, queue)

      // Start consuming messages for this agent
      yield* Effect.forkScoped(
        Effect.gen(function* () {
          while (true) {
            const message = yield* Queue.take(queue)
            callback(message)
          }
        }),
      )

      yield* Effect.logInfo(`Agent ${agentId} subscribed to message bus`)
    })

  const unsubscribe = (agentId: AgentID) =>
    Effect.sync(() => {
      subscribers.delete(agentId)
    })

  const publish = (message: AgentMessage) =>
    Effect.gen(function* () {
      // Publish to the global pubsub
      yield* PubSub.publish(messagePubSub, message)

      // Deliver to specific agent or broadcast
      if (message.to === "*") {
        // Broadcast to all subscribers
        for (const [agentId, queue] of subscribers) {
          if (agentId !== message.from) {
            yield* Queue.offer(queue, message)
          }
        }
      } else {
        // Deliver to specific agent
        const queue = subscribers.get(message.to)
        if (queue) {
          yield* Queue.offer(queue, message)
        }
      }

      yield* Effect.logDebug(`Message sent from ${message.from} to ${message.to}`)
    })

  const broadcast = (from: AgentID, type: AgentMessage["type"], payload: unknown) =>
    publish({
      id: newMessageId(),
      from,
      to: "*",
      type,
      payload,
      timestamp: Date.now(),
    })

  const emitEvent = (event: CollabEvent) =>
    Effect.gen(function* () {
      yield* PubSub.publish(eventPubSub, event)

      // Also call registered callbacks
      for (const callback of eventCallbacks) {
        callback(event)
      }
    })

  const subscribeEvents = (callback: (event: CollabEvent) => void) =>
    Effect.sync(() => {
      eventCallbacks.add(callback)
    })

  const getSubscribers = () => Effect.sync(() => [...subscribers.keys()])

  return AgentBus.of({
    subscribe,
    unsubscribe,
    publish,
    broadcast,
    subscribeEvents,
    emitEvent,
    getSubscribers,
  })
})
