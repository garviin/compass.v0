/**
 * Base Provider Class
 *
 * Common functionality for all pricing providers
 */

import { ModelPricing } from '../types'

import {
  PricingProvider,
  PricingProviderResult,
  PricingSourceMetadata,
  ProviderConfig} from './types'

export abstract class BasePricingProvider implements PricingProvider {
  abstract name: string
  abstract providerId: string

  protected config: ProviderConfig
  protected metadata: PricingSourceMetadata
  protected supportedModels: string[] = []

  constructor(config?: ProviderConfig) {
    this.config = {
      timeout: 30000,
      cacheDuration: 300, // 5 minutes
      debug: false,
      ...config
    }

    this.metadata = {
      type: 'api',
      failureCount: 0
    }
  }

  abstract isAvailable(): Promise<boolean>
  abstract fetchPricing(): Promise<PricingProviderResult>

  getSupportedModels(): string[] {
    return this.supportedModels
  }

  getDataFreshness(): 'realtime' | 'daily' | 'weekly' | 'static' {
    return 'daily' // Most providers update pricing infrequently
  }

  /**
   * Helper: Log debug messages if debug mode enabled
   */
  protected log(message: string, data?: any): void {
    if (this.config.debug) {
      console.log(`[${this.name}] ${message}`, data || '')
    }
  }

  /**
   * Helper: Log errors
   */
  protected error(message: string, error?: any): void {
    console.error(`[${this.name}] ${message}`, error || '')
  }

  /**
   * Helper: Make HTTP request with timeout
   */
  protected async fetch(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeout || 30000
    )

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'Morphic-Pricing-Bot/1.0',
          ...this.config.headers,
          ...options?.headers
        }
      })

      clearTimeout(timeout)
      return response
    } catch (error) {
      clearTimeout(timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.config.timeout}ms`)
      }
      throw error
    }
  }

  /**
   * Helper: Parse HTML/Markdown pricing tables
   * Many providers list pricing in documentation
   */
  protected parsePricingTable(html: string): ModelPricing[] {
    // This would use a library like cheerio or jsdom
    // For now, returning empty array - override in specific providers
    return []
  }

  /**
   * Helper: Validate and clean pricing data
   */
  protected validatePricing(pricing: ModelPricing[]): ModelPricing[] {
    return pricing.filter(p => {
      // Basic validation
      if (!p.modelId || !p.providerId) return false
      if (p.inputPricePer1kTokens <= 0) return false
      if (p.outputPricePer1kTokens <= 0) return false
      if (p.inputPricePer1kTokens > 100) return false // Sanity check
      if (p.outputPricePer1kTokens > 100) return false
      return true
    })
  }

  /**
   * Helper: Map provider model names to our standard names
   */
  protected mapModelName(providerModelName: string): string {
    // Override in specific providers for custom mapping
    return providerModelName
  }

  /**
   * Helper: Record successful fetch
   */
  protected recordSuccess(): void {
    this.metadata.lastSuccess = new Date()
    this.metadata.lastAttempt = new Date()
    this.metadata.failureCount = 0
  }

  /**
   * Helper: Record failed fetch
   */
  protected recordFailure(error?: string): void {
    this.metadata.lastAttempt = new Date()
    this.metadata.failureCount = (this.metadata.failureCount || 0) + 1
    if (error) {
      this.metadata.extra = {
        ...this.metadata.extra,
        lastError: error
      }
    }
  }
}