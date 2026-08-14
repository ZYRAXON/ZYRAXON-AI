// @ts-nocheck

import { Zyraxon } from "@zyraxon-ai/core"
import { ReadTool } from "@zyraxon-ai/core/tools"

const zyraxon = Zyraxon.make({})

zyraxon.tool.add(ReadTool)

zyraxon.tool.add({
  name: "bash",
  schema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to run.",
      },
    },
    required: ["command"],
  },
  execute(input, ctx) {},
})

zyraxon.auth.add({
  provider: "openai",
  type: "api",
  value: process.env.OPENAI_API_KEY,
})

zyraxon.agent.add({
  name: "build",
  permissions: [],
  model: {
    id: "gpt-5-5",
    provider: "openai",
    variant: "xhigh",
  },
})

const sessionID = await zyraxon.session.create({
  agent: "build",
})

zyraxon.subscribe((event) => {
  console.log(event)
})

await zyraxon.session.prompt({
  sessionID,
  text: "hey what is up",
})

await zyraxon.session.prompt({
  sessionID,
  text: "what is up with this",
  files: [
    {
      mime: "image/png",
      uri: "data:image/png;base64,xxxx",
    },
  ],
})

await zyraxon.session.wait()

console.log(await zyraxon.session.messages(sessionID))
