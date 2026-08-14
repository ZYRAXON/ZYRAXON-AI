export * as Database from "./database"

import { EffectDrizzleSqlite } from "@zyraxon-ai/effect-drizzle-sqlite"
import { layer as sqliteLayer } from "#sqlite"
import { Context, Effect, Layer } from "effect"
import { Global } from "../global"
import { Flag } from "../flag/flag"
import { isAbsolute, join } from "path"
import { DatabaseMigration } from "./migration"
import { InstallationChannel } from "../installation/version"
import { makeGlobalNode } from "../effect/app-node"

const makeDatabase = EffectDrizzleSqlite.makeWithDefaults()
type DatabaseShape = Effect.Success<typeof makeDatabase>

export interface Interface {
  db: DatabaseShape
}

export class Service extends Context.Service<Service, Interface>()("@zyraxon/v2/storage/Database") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* makeDatabase

    // ETERNAL MEMORY PRAGMAs — Maximum performance, zero data loss
    yield* db.run("PRAGMA journal_mode = WAL")            // Write-ahead logging for concurrent reads
    yield* db.run("PRAGMA synchronous = NORMAL")           // Balanced speed/safety
    yield* db.run("PRAGMA busy_timeout = 30000")           // 30s timeout for high concurrency
    yield* db.run("PRAGMA cache_size = -67108864")         // 64MB cache (was 8MB)
    yield* db.run("PRAGMA mmap_size = 2147483648")         // 2GB memory-mapped I/O
    yield* db.run("PRAGMA temp_store = MEMORY")            // Temp tables in RAM
    yield* db.run("PRAGMA foreign_keys = ON")              // Referential integrity
    yield* db.run("PRAGMA wal_autocheckpoint = 4000")      // Less frequent checkpoints
    yield* db.run("PRAGMA page_size = 65536")              // 64KB pages for large data
    yield* db.run("PRAGMA wal_checkpoint(PASSIVE)")        // Non-blocking checkpoint
    yield* db.run("PRAGMA optimize")                       // Query planner optimization
    yield* db.run("PRAGMA hard_heap_limit = 268435456")    // 256MB hard heap limit
    yield* db.run("PRAGMA soft_heap_limit = 134217728")    // 128MB soft heap limit
    yield* db.run("PRAGMA mmap_size = 2147483648")         // 2GB memory-mapped I/O
    yield* db.run("PRAGMA secure_delete = OFF")            // Fast deletes (no zero-fill)
    yield* db.run("PRAGMA auto_vacuum = INCREMENTAL")      // Incremental vacuum for space reclamation
    yield* db.run("PRAGMA journal_size_limit = 104857600") // 100MB max WAL file size
    yield* DatabaseMigration.apply(db)

    return { db }
  }).pipe(Effect.orDie),
)

export function layerFromPath(filename: string) {
  return layer.pipe(Layer.provide(sqliteLayer({ filename })))
}

export function path() {
  if (Flag.ZYRAXON_DB) {
    if (Flag.ZYRAXON_DB === ":memory:" || isAbsolute(Flag.ZYRAXON_DB)) return Flag.ZYRAXON_DB
    return join(Global.Path.data, Flag.ZYRAXON_DB)
  }
  if (
    ["latest", "beta", "prod"].includes(InstallationChannel) ||
    process.env.ZYRAXON_DISABLE_CHANNEL_DB === "1" ||
    process.env.ZYRAXON_DISABLE_CHANNEL_DB === "true"
  )
    return join(Global.Path.data, "zyraxon.db")
  return join(Global.Path.data, `zyraxon-${InstallationChannel.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
}

export const node = makeGlobalNode({ service: Service, layer: layerFromPath(path()), deps: [] })
