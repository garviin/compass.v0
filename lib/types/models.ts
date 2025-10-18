export interface ModelPricing {
  inputPricePer1kTokens: number
  outputPricePer1kTokens: number
}

export interface Model {
  id: string
  name: string
  provider: string
  providerId: string
  enabled: boolean
  toolCallType: 'native' | 'manual'
  toolCallModel?: string
  pricing?: ModelPricing
  // Ollama-specific fields (only added when needed)
  capabilities?: string[]
  contextWindow?: number
}
