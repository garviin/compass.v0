/**
 * OpenAI Pricing Provider
 *
 * Fetches pricing from OpenAI's pricing page or static data
 * Note: OpenAI doesn't provide a public pricing API
 */

import { ModelPricing } from '../types'

import { BasePricingProvider } from './base-provider'
import { PricingProviderResult, ProviderConfig } from './types'

// Static pricing data (updated as of October 2024)
// This serves as fallback and can be updated via automated scraping
const STATIC_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4.1': { input: 0.01, output: 0.03 },
  'gpt-4.1-mini': { input: 0.0005, output: 0.0015 },
  'gpt-4.1-nano': { input: 0.0001, output: 0.0003 },
  'o3-mini': { input: 0.0015, output: 0.006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 }
}

export class OpenAIPricingProvider extends BasePricingProvider {
  name = 'OpenAI'
  providerId = 'openai'

  constructor(config?: ProviderConfig) {
    super(config)

    this.supportedModels = Object.keys(STATIC_PRICING)

    // OpenAI pricing page URL for potential scraping
    this.metadata = {
      type: 'docs',
      url: 'https://openai.com/api/pricing/',
      failureCount: 0
    }
  }

  async isAvailable(): Promise<boolean> {
    // For docs/static provider, always available
    return true
  }

  async fetchPricing(): Promise<PricingProviderResult> {
    try {
      this.log('Fetching OpenAI pricing...')

      // Option 1: Try to fetch from pricing page (if we implement scraping)
      if (this.config.baseUrl || process.env.ENABLE_PRICING_SCRAPING === 'true') {
        try {
          const scrapedPricing = await this.fetchFromPricingPage()
          if (scrapedPricing.length > 0) {
            this.log(`Fetched ${scrapedPricing.length} models from OpenAI docs`)
            this.recordSuccess()
            return {
              success: true,
              pricing: scrapedPricing,
              source: 'openai-docs',
              fetchedAt: new Date()
            }
          }
        } catch (error) {
          this.log('Failed to scrape pricing page, falling back to static data', error)
        }
      }

      // Option 2: Use static pricing data (fallback)
      const pricing = this.getStaticPricing()

      this.log(`Using static pricing for ${pricing.length} OpenAI models`)
      this.recordSuccess()

      return {
        success: true,
        pricing,
        source: 'openai-static',
        fetchedAt: new Date()
      }
    } catch (error) {
      this.error('Failed to fetch OpenAI pricing', error)
      this.recordFailure(error instanceof Error ? error.message : 'Unknown error')

      return {
        success: false,
        pricing: [],
        source: 'openai-error',
        fetchedAt: new Date(),
        errors: [error instanceof Error ? error.message : 'Failed to fetch pricing']
      }
    }
  }

  /**
   * Scrape pricing from OpenAI's pricing page
   * This would use Playwright or Puppeteer in production
   */
  private async fetchFromPricingPage(): Promise<ModelPricing[]> {
    // In production, this would:
    // 1. Use Playwright to load https://openai.com/api/pricing/
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
   * Map OpenAI's model names to our standard names
   */
  protected mapModelName(providerModelName: string): string {
    // Handle common variations
    const mappings: Record<string, string> = {
      'gpt-4-turbo-preview': 'gpt-4-turbo',
      'gpt-4-1106-preview': 'gpt-4-turbo',
      'gpt-3.5-turbo-0125': 'gpt-3.5-turbo',
      'gpt-3.5-turbo-1106': 'gpt-3.5-turbo'
    }

    return mappings[providerModelName] || providerModelName
  }

  getDataFreshness(): 'realtime' | 'daily' | 'weekly' | 'static' {
    // If we're scraping, it's daily. If static, it's static.
    return this.config.baseUrl ? 'daily' : 'static'
  }
}