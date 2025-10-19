/**
 * Provider Pricing Client Types
 *
 * Common interfaces for all pricing providers
 */

import { ModelPricing } from '../types'

export interface PricingProviderResult {
  success: boolean
  pricing: ModelPricing[]
  source: string
  fetchedAt: Date
  errors?: string[]
}

export interface PricingProvider {
  /** Provider name for logging */
  name: string

  /** Provider ID matching database */
  providerId: string

  /** Check if this provider is available/configured */
  isAvailable(): Promise<boolean>

  /** Fetch current pricing from provider */
  fetchPricing(): Promise<PricingProviderResult>

  /** Get list of models this provider supports */
  getSupportedModels(): string[]

  /** How fresh is the pricing data (for cache decisions) */
  getDataFreshness(): 'realtime' | 'daily' | 'weekly' | 'static'
}

export interface PricingSourceMetadata {
  /** Where pricing comes from */
  type: 'api' | 'docs' | 'static' | 'manual'

  /** URL or endpoint used */
  url?: string

  /** Last successful fetch */
  lastSuccess?: Date

  /** Last fetch attempt */
  lastAttempt?: Date

  /** Number of consecutive failures */
  failureCount?: number

  /** Additional provider-specific metadata */
  extra?: Record<string, any>
}

/** Model pricing from provider with metadata */
export interface ProviderPricing extends ModelPricing {
  /** Raw model name from provider */
  rawModelName?: string

  /** When this pricing becomes effective */
  effectiveDate?: Date

  /** When this pricing expires */
  expiryDate?: Date

  /** Additional pricing tiers (if applicable) */
  tiers?: {
    minTokens: number
    maxTokens?: number
    inputPrice: number
    outputPrice: number
  }[]

  /** Provider-specific metadata */
  metadata?: Record<string, any>
}

/** Configuration for provider clients */
export interface ProviderConfig {
  /** API key or credentials */
  apiKey?: string

  /** Base URL for API calls */
  baseUrl?: string

  /** Custom headers for requests */
  headers?: Record<string, string>

  /** Request timeout in ms */
  timeout?: number

  /** Enable debug logging */
  debug?: boolean

  /** Cache duration in seconds */
  cacheDuration?: number
}

/** Provider registry for dynamic loading */
export interface ProviderRegistry {
  providers: Map<string, PricingProvider>

  register(provider: PricingProvider): void

  get(providerId: string): PricingProvider | undefined

  getAll(): PricingProvider[]

  getAvailable(): Promise<PricingProvider[]>
}