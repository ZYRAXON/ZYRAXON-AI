export interface ModelInfo {
  name: string
  provider: string
  costPer1kInput: number
  costPer1kOutput: number
  contextLimit: number
  capability: 'simple' | 'reasoning' | 'coding' | 'vision'
}

export class CostRouter {
  private models: ModelInfo[] = [
    { name: 'gpt-5.4-nano', provider: 'zyraxon', costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 32000, capability: 'simple' },
    { name: 'mimo-v2.5-free', provider: 'zyraxon', costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 200000, capability: 'reasoning' },
    { name: 'big-pickle', provider: 'zyraxon', costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 200000, capability: 'coding' },
    { name: 'deepseek-v4-flash-free', provider: 'zyraxon', costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 200000, capability: 'reasoning' },
    { name: 'glm-5.2', provider: 'zyraxon', costPer1kInput: 1.4, costPer1kOutput: 4.4, contextLimit: 1000000, capability: 'coding' },
    { name: 'gpt-5.1-codex-max', provider: 'zyraxon', costPer1kInput: 12, costPer1kOutput: 36, contextLimit: 32000, capability: 'coding' },
    { name: 'gemini-3.5-flash', provider: 'google', costPer1kInput: 0, costPer1kOutput: 0, contextLimit: 1000000, capability: 'vision' },
  ]

  route(task: { type: string; complexity: 'simple' | 'medium' | 'complex'; contextSize: number; needsVision: boolean }): ModelInfo {
    if (task.needsVision) return this.models.find((m) => m.capability === 'vision') || this.models[1]
    if (task.complexity === 'complex' && task.contextSize > 100000) return this.models[4]
    if (task.complexity === 'complex') return this.models[3]
    if (task.complexity === 'medium') return this.models[2]
    return this.models[0]
  }

  getModelsByCapability(cap: ModelInfo['capability']): ModelInfo[] {
    return this.models.filter((m) => m.capability === cap && m.costPer1kInput === 0)
  }
}
