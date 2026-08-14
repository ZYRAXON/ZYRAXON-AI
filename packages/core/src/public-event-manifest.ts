export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@zyraxon-ai/schema/event"
import { EventManifest } from "@zyraxon-ai/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
