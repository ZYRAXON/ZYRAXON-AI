interface ImportMetaEnv {
  readonly ZYRAXON_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:zyraxon-server" {
  export namespace Server {
    export const listen: typeof import("../../../zyraxon/dist/types/src/node").Server.listen
    export type Listener = import("../../../zyraxon/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../zyraxon/dist/types/src/node").Config.get
    export type Info = import("../../../zyraxon/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../zyraxon/dist/types/src/node").bootstrap
}
