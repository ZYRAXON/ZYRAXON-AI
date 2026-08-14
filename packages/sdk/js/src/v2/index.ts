export * from "./client.js"
export * from "./server.js"

import { createZyraxonClient } from "./client.js"
import { createZyraxonServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export * as data from "./data.js"

export async function createZyraxon(options?: ServerOptions) {
  const server = await createZyraxonServer({
    ...options,
  })

  const client = createZyraxonClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
