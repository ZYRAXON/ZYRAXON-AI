import path from "path"
import fs from "fs/promises"
import fsSync from "fs"
import { xdgData, xdgCache, xdgConfig, xdgState } from "xdg-basedir"
import os from "os"
import { Context, Effect, Layer } from "effect"
import { Flock } from "./util/flock"
import { Flag } from "./flag/flag"
import { makeGlobalNode } from "./effect/app-node"

const app = "zyraxon"
const data = path.join(xdgData!, app)
const cache = path.join(xdgCache!, app)

// On Windows, xdgConfig = %APPDATA% (C:\Users\<user>\AppData\Roaming)
// But users may also have config at ~/.config/zyraxon/ (Linux-style)
// Check both and prefer ~/.config if it exists (more standard)
const xdgConfigDir = path.join(xdgConfig!, app)
const homeConfigDir = path.join(os.homedir(), ".config", app)

// Use sync fs to check config dirs at startup
function resolveConfigDir(): string {
  if (Flag.ZYRAXON_CONFIG_DIR) return Flag.ZYRAXON_CONFIG_DIR
  try {
    const files = fsSync.readdirSync(homeConfigDir)
    if (files.some(f => f.endsWith(".json") || f.endsWith(".jsonc"))) {
      return homeConfigDir
    }
  } catch {}
  return xdgConfigDir
}

const config = resolveConfigDir()

const state = path.join(xdgState!, app)
const tmp = path.join(os.tmpdir(), app)

const paths = {
  get home() {
    return process.env.ZYRAXON_TEST_HOME ?? os.homedir()
  },
  data,
  bin: path.join(cache, "bin"),
  log: path.join(data, "log"),
  repos: path.join(data, "repos"),
  cache,
  config,
  state,
  tmp,
}

export const Path = paths

Flock.setGlobal({ state })

await Promise.all([
  fs.mkdir(Path.data, { recursive: true }),
  fs.mkdir(Path.config, { recursive: true }),
  fs.mkdir(Path.state, { recursive: true }),
  fs.mkdir(Path.tmp, { recursive: true }),
  fs.mkdir(Path.log, { recursive: true }),
  fs.mkdir(Path.bin, { recursive: true }),
  fs.mkdir(Path.repos, { recursive: true }),
])

export class Service extends Context.Service<Service, Interface>()("@zyraxon/Global") {}

export interface Interface {
  readonly home: string
  readonly data: string
  readonly cache: string
  readonly config: string
  readonly state: string
  readonly tmp: string
  readonly bin: string
  readonly log: string
  readonly repos: string
}

export function make(input: Partial<Interface> = {}): Interface {
  return {
    home: Path.home,
    data: Path.data,
    cache: Path.cache,
    config: Flag.ZYRAXON_CONFIG_DIR ?? Path.config,
    state: Path.state,
    tmp: Path.tmp,
    bin: Path.bin,
    log: Path.log,
    repos: Path.repos,
    ...input,
  }
}

const layer = Layer.effect(
  Service,
  Effect.sync(() => Service.of(make())),
)

export const node = makeGlobalNode({ service: Service, layer: layer, deps: [] })

export const layerWith = (input: Partial<Interface>) =>
  Layer.effect(
    Service,
    Effect.sync(() => Service.of(make(input))),
  )

export * as Global from "./global"
