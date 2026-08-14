import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { processAgentRequest } from './ai-agent'
import type { AgentRequest, AgentResponse } from './types'

const app = new Hono()

app.use('/*', cors({ origin: '*', allowHeaders: ['Content-Type'], allowMethods: ['POST', 'GET', 'OPTIONS'] }))

app.get('/health', (c) => c.json({
  status: 'ok',
  service: 'zyraxon-mobile-agent',
  version: '1.0.0',
  api_url: process.env.ZYRAXON_API_URL ?? '(not set)',
  api_key_set: process.env.ZYRAXON_API_KEY ? 'yes' : 'no',
  model: process.env.MOBILE_AI_MODEL ?? '(not set)',
}))



app.post('/api/mobile/agent', async (c) => {
  try {
    const req: AgentRequest = await c.req.json()
    const response = await processAgentRequest(req)
    return c.json(response)
  } catch (err: any) {
    return c.json({ text: `Server error: ${err.message}`, actions: [], finish_reason: 'error' } as AgentResponse, 500)
  }
})

app.post('/api/mobile/agent/stream', async (c) => {
  try {
    const req: AgentRequest = await c.req.json()
    c.header('Content-Type', 'text/event-stream')
    c.header('Cache-Control', 'no-cache')
    c.header('Connection', 'keep-alive')

    const response = await processAgentRequest(req)
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const words = response.text.split(' ')
        let idx = 0
        function pushWord() {
          if (idx < words.length) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'token', content: words[idx] + ' ' })}\n\n`))
            idx++
            setTimeout(pushWord, 30)
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'actions', actions: response.actions })}\n\n`))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done', finish_reason: response.finish_reason })}\n\n`))
            controller.close()
          }
        }
        pushWord()
      },
    })
    return new Response(stream)
  } catch (err: any) {
    return c.json({ text: `Stream error: ${err.message}`, actions: [], finish_reason: 'error' } as AgentResponse, 500)
  }
})

const PORT = parseInt(process.env.PORT ?? '3001', 10)

console.log(`\n╔══════════════════════════════════════╗`)
console.log(`║  ZYRAXON Mobile Agent Server        ║`)
console.log(`║  Port: ${PORT}                        ║`)
console.log(`║  AI: ${process.env.MOBILE_AI_PROVIDER ?? 'zyraxon'} / ${process.env.MOBILE_AI_MODEL ?? 'mimo-v2.5-free'}  ║`)
console.log(`╚══════════════════════════════════════╝\n`)
console.log(`Mobile Agent API: http://localhost:${PORT}/api/mobile/agent`)
console.log(`Health:           http://localhost:${PORT}/health`)

Bun.serve({
  port: PORT,
  fetch: app.fetch,
})
