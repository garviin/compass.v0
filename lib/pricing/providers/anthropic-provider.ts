/**
 * Anthropic Pricing Provider
 *
 * Fetches pricing from Anthropic's documentation
 * Note: Anthropic doesn't provide a public pricing API
 */

import { ModelPricing } from '../types'

import { BasePricingProvider } from './base-provider'
import { PricingProviderResult, ProviderConfig } from './types'

// Static pricing data (updated as of October 2024)
const STATIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-7-sonnet-20250219': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet-latest': { input: 0.003, output: 0.015 },
  'claude-3-5-sonnet-20241022': { input: 0.003, output: 0.015 },
  'claude-3-5-haiku-20241022': { input: 0.0008, output: 0.004 },
  'claude-3-opus-20240229': { input: 0.015, output: 0.075 },
  'claude-3-sonnet-20240229': { input: 0.003, output: 0.015 },
  'claude-3-haiku-20240307': { input: 0.00025, output: 0.00125 }
}

export class AnthropicPricingProvider extends BasePricingProvider {
  name = 'Anthropic'
  providerId = 'anthropic'

  constructor(config?: ProviderConfig) {
    super(config)

    this.supportedModels = Object.keys(STATIC_PRICING)

    // Anthropic pricing documentation URL
    this.metadata = {
      type: 'docs',
      url: 'https://docs.anthropic.com/en/docs/about-claude/models#model-pricing',
      failureCount: 0
    }
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async fetchPricing(): Promise<PricingProviderResult> {
    try {
      this.log('Fetching Anthropic pricing...')

      // Option 1: Try to fetch from API docs (if available)
      if (this.config.apiKey && process.env.ENABLE_ANTHROPIC_API === 'true') {
        try {
          const apiPricing = await this.fetchFromAPI()
          if (apiPricing.length > 0) {
            this.log(`Fetched ${apiPricing.length} models from Anthropic API`)
            this.recordSuccess()
            return {
              success: true,
              pricing: apiPricing,
              source: 'anthropic-api',
              fetchedAt: new Date()
            }
          }
        } catch (error) {
          this.log('No API pricing available, using static data', error)
        }
      }

      // Option 2: Try to fetch from docs page
      if (process.env.ENABLE_PRICING_SCRAPING === 'true') {
        try {
          const docsPricing = await this.fetchFromDocs()
          if (docsPricing.length > 0) {
            this.log(`Fetched ${docsPricing.length} models from Anthropic docs`)
            this.recordSuccess()
            return {
              success: true,
              pricing: docsPricing,
              source: 'anthropic-docs',
              fetchedAt: new Date()
            }
          }
        } catch (error) {
          this.log('Failed to scrape docs, using static data', error)
        }
      }

      // Option 3: Use static pricing data
      const pricing = this.getStaticPricing()

      this.log(`Using static pricing for ${pricing.length} Anthropic models`)
      this.recordSuccess()

      return {
        success: true,
        pricing,
        source: 'anthropic-static',
        fetchedAt: new Date()
      }
    } catch (error) {
      this.error('Failed to fetch Anthropic pricing', error)
      this.recordFailure(error instanceof Error ? error.message : 'Unknown error')

      return {
        success: false,
        pricing: [],
        source: 'anthropic-error',
        fetchedAt: new Date(),
        errors: [error instanceof Error ? error.message : 'Failed to fetch pricing']
      }
    }
  }

  /**
   * Fetch pricing from Anthropic API (if they add this in future)
   */
  private async fetchFromAPI(): Promise<ModelPricing[]> {
    // Anthropic doesn't currently have a pricing API
    // This is a placeholder for future implementation
    return []
  }

  /**
   * Scrape pricing from Anthropic docs
   */
  private async fetchFromDocs(): Promise<ModelPricing[]> {
    // In production, this would:
    // 1. Fetch https://docs.anthropic.com/en/docs/about-claude/models
    // 2. Parse the pricing table
    // 3. Extract model names and prices
    // 4. Map to our standard format

    // For now, return empty to use static fallback
    return []
  }

  /**
   * Get static pricing data
   */
  private getStaticPricing(): ModelPricing[] {
    const pricing: ModelPricing[] = []

    for (const [modelId, prices] of Object.entries(STATIC_PRICING)) {
      pricing.push({
        modelId,
        providerId: this.providerId,
        inputPricePer1kTokens: prices.input,
        outputPricePer1kTokens: prices.output
      })
    }

    return this.validatePricing(pricing)
  }

  /**
   * Map Anthropic's model names to our standard names
   */
  protected mapModelName(providerModelName: string): string {
    // Normalize Claude model names
    const mappings: Record<string, string> = {
      'claude-3.5-sonnet': 'claude-3-5-sonnet-latest',
      'claude-3.5-haiku': 'claude-3-5-haiku-20241022',
      'claude-3-opus': 'claude-3-opus-20240229',
      'claude-3-sonnet': 'claude-3-sonnet-20240229',
      'claude-3-haiku': 'claude-3-haiku-20240307'
    }

    return mappings[providerModelName] || providerModelName
  }

  getDataFreshness(): 'realtime' | 'daily' | 'weekly' | 'static' {
    return 'weekly' // Anthropic updates pricing less frequently
  }
}