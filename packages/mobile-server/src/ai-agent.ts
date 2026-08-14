import { MOBILE_AGENT_SYSTEM_PROMPT } from './system-prompt'
import type { AgentRequest, AgentResponse } from './types'

/**
 * AI Agent — zyraxon.ai Free Models Provider
 *
 * Uses zyraxon.ai's free models (big-pickle, mimo-v2.5-free, deepseek-v4-flash-free, etc.)
 * These are completely FREE with NO rate limits.
 *
 * API: https://api.opencode.ai/v1 (OpenAI-compatible)
 */

interface ProviderConfig {
  apiKey: string
  baseUrl: string
  model: string
}

type ProviderName = 'zyraxon' | 'openai' | 'anthropic' | 'google' | 'openrouter'

function getProvider(): ProviderConfig {
  const provider = (process.env.MOBILE_AI_PROVIDER ?? 'zyraxon') as ProviderName
  const configs: Record<ProviderName, ProviderConfig> = {
    zyraxon: {
      apiKey: '',
      baseUrl: process.env.ZYRAXON_API_URL ?? 'https://opencode.ai/zen/v1',
      model: process.env.MOBILE_AI_MODEL ?? 'mimo-v2.5-free',
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY ?? '',
      baseUrl: 'https://api.openai.com/v1',
      model: process.env.MOBILE_AI_MODEL ?? 'gpt-4o',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY ?? '',
      baseUrl: 'https://api.anthropic.com/v1',
      model: process.env.MOBILE_AI_MODEL ?? 'claude-3-5-sonnet-20241022',
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY ?? '',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: process.env.MOBILE_AI_MODEL ?? 'gemini-2.0-flash',
    },
    openrouter: {
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env.MOBILE_AI_MODEL ?? 'qwen/qwen3-coder:free',
    },
  }
  return configs[provider] ?? configs.zyraxon
}

function buildMessages(req: AgentRequest): Array<{ role: string; content: any }> {
  const messages: Array<{ role: string; content: any }> = [
    { role: 'system', content: MOBILE_AGENT_SYSTEM_PROMPT },
  ]

  for (const msg of req.history) {
    messages.push({ role: msg.role, content: msg.content })
  }

  const hasVision = req.vision_frames && req.vision_frames.length > 0

  if (hasVision) {
    const userContent: any[] = [{ type: 'text', text: req.message }]
    for (const frame of req.vision_frames!) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${frame.base64}`, detail: 'high' },
      })
    }
    if (req.device_info) {
      userContent.push({
        type: 'text',
        text: `[Device: ${req.device_info.platform}, Screen: ${req.device_info.screen_width}x${req.device_info.screen_height}, Battery: ${req.device_info.battery_level ?? 'unknown'}%]`,
      })
    }
    messages.push({ role: 'user', content: userContent })
  } else {
    let text = req.message
    if (req.device_info) {
      text += `\n[Device: ${req.device_info.platform}, Screen: ${req.device_info.screen_width}x${req.device_info.screen_height}, Battery: ${req.device_info.battery_level ?? 'unknown'}%]`
    }
    messages.push({ role: 'user', content: text })
  }
  return messages
}

export async function processAgentRequest(req: AgentRequest): Promise<AgentResponse> {
  const provider = getProvider()
  const messages = buildMessages(req)

  console.log(`[AI] Provider: ${provider.baseUrl}, Model: ${provider.model}`)

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        max_tokens: 512,
      }),
    })

    const bodyText = await res.text()
    if (!res.ok) {
      console.error(`[AI] Error ${res.status}: ${bodyText}`)
      throw new Error(`AI provider error (${res.status}): ${bodyText}`)
    }

    let data: any
    try {
      data = JSON.parse(bodyText)
    } catch (parseErr: any) {
      console.error(`[AI] JSON parse failed on body: "${bodyText.slice(0, 500)}"`)
      throw new Error(`Failed to parse JSON: ${parseErr.message}. Body: ${bodyText.slice(0, 200)}`)
    }
    const msg = data.choices?.[0]?.message ?? {}
    const raw = msg.content || msg.reasoning_content || msg.reasoning || ''
    const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let response: AgentResponse

    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try {
        response = JSON.parse(jsonMatch[0])
      } catch {
        response = { text: clean, actions: [], finish_reason: 'complete' }
      }
    } else {
      response = { text: clean || 'No response generated', actions: [], finish_reason: 'complete' }
    }

    if (!response.text) response.text = 'Task processed.'
    if (!response.actions) response.actions = []
    if (!response.finish_reason) response.finish_reason = 'complete'

    console.log(`[AI] Response: ${response.text.slice(0, 100)}..., Actions: ${response.actions.length}`)
    return response
  } catch (err: any) {
    console.error(`[AI] Failed: ${err.message}`)
    return {
      text: `Error: ${err.message}`,
      actions: [],
      finish_reason: 'error',
    }
  }
}
