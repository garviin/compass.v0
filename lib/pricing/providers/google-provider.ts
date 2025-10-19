/**
 * Google (Gemini) Pricing Provider
 *
 * Fetches pricing for Google's Gemini models
 */

import { ModelPricing } from '../types'

import { BasePricingProvider } from './base-provider'
import { PricingProviderResult, ProviderConfig } from './types'

// Static pricing data (updated as of October 2024)
const STATIC_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.000075, output: 0.0003 },
  'gemini-2.0-flash-thinking-exp-01-21': { input: 0.000075, output: 0.0003 },
  'gemini-2.5-pro-exp-03-25': { input: 0.00125, output: 0.005 },
  'gemini-1.5-pro': { input: 0.00125, output: 0.005 },
  'gemini-1.5-flash': { input: 0.000075, output: 0.0003 },
  'gemini-1.5-flash-8b': { input: 0.0000375, output: 0.00015 },
  'gemini-pro': { input: 0.000125, output: 0.000375 },
  'gemini-pro-vision': { input: 0.000125, output: 0.000375 }
}

export class GooglePricingProvider extends BasePricingProvider {
  name = 'Google'
  providerId = 'google'

  constructor(config?: ProviderConfig) {
    super(config)

    this.supportedModels = Object.keys(STATIC_PRICING)

    // Google AI pricing page
    this.metadata = {
      type: 'docs',
      url: 'https://ai.google.dev/pricing',
      failureCount: 0
    }
  }

  async isAvailable(): Promise<boolean> {
    return true
  }

  async fetchPricing(): Promise<PricingProviderResult> {
    try {
      this.log('Fetching Google pricing...')

      // Option 1: Try to fetch from Google Cloud pricing API
      if (this.config.apiKey && process.env.ENABLE_GOOGLE_CLOUD_API === 'true') {
        try {
          const apiPricing = await this.fetchFromCloudAPI()
          if (apiPricing.length > 0) {
            this.log(`Fetched ${apiPricing.length} models from Google Cloud API`)
            this.recordSuccess()
            return {
              success: true,
              pricing: apiPricing,
              source: 'google-api',
              fetchedAt: new Date()
            }
          }
        } catch (error) {
          this.log('Failed to fetch from Cloud API, using static data', error)
        }
      }

      // Option 2: Use static pricing data
      const pricing = this.getStaticPricing()

      this.log(`Using static pricing for ${pricing.length} Google models`)
      this.recordSuccess()

      return {
        success: true,
        pricing,
        source: 'google-static',
        fetchedAt: new Date()
      }
    } catch (error) {
      this.error('Failed to fetch Google pricing', error)
      this.recordFailure(error instanceof Error ? error.message : 'Unknown error')

      return {
        success: false,
        pricing: [],
        source: 'google-error',
        fetchedAt: new Date(),
        errors: [error instanceof Error ? error.message : 'Failed to fetch pricing']
      }
    }
  }

  /**
   * Fetch pricing from Google Cloud Billing API
   * Requires service account with billing.viewer permission
   */
  private async fetchFromCloudAPI(): Promise<ModelPricing[]> {
    // In production, this would use Google Cloud Billing API:
    // 1. Authenticate with service account
    // 2. Query SKUs for Vertex AI / Generative AI services
    // 3. Parse pricing information
    // 4. Map to our format

    // Placeholder for now
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
   * Map Google's model names to our standard names
   */
  protected mapModelName(providerModelName: string): string {
    // Handle variations in Gemini model names
    const mappings: Record<string, string> = {
      'models/gemini-2.0-flash': 'gemini-2.0-flash',
      'models/gemini-1.5-pro': 'gemini-1.5-pro',
      'models/gemini-1.5-flash': 'gemini-1.5-flash',
      'models/gemini-pro': 'gemini-pro',
      'gemini-2.0-flash-latest': 'gemini-2.0-flash',
      'gemini-1.5-pro-latest': 'gemini-1.5-pro'
    }

    return mappings[providerModelName] || providerModelName
  }

  getDataFreshness(): 'realtime' | 'daily' | 'weekly' | 'static' {
    return 'weekly' // Google updates pricing occasionally
  }
}