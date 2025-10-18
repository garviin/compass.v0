export interface ModelPricing {
  modelId: string
  providerId: string
  inputPricePer1kTokens: number
  outputPricePer1kTokens: number
  createdAt?: Date
  updatedAt?: Date
}

export interface CostCalculation {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  modelId: string
  providerId: string
}
