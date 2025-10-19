/**
 * Provider Registry
 *
 * Manages all pricing providers and coordinates fetching
 */

import { AnthropicPricingProvider } from './anthropic-provider'
import { GooglePricingProvider } from './google-provider'
import { OpenAIPricingProvider } from './openai-provider'
import { PricingProvider, ProviderRegistry as IProviderRegistry } from './types'

export class ProviderRegistry implements IProviderRegistry {
  providers: Map<string, PricingProvider>

  constructor() {
    this.providers = new Map()

    // Register default providers
    this.registerDefaults()
  }

  /**
   * Register default providers
   */
  private registerDefaults(): void {
    // OpenAI
    this.register(
      new OpenAIPricingProvider({
        debug: process.env.PRICING_DEBUG === 'true'
      })
    )

    // Anthropic
    this.register(
      new AnthropicPricingProvider({
        debug: process.env.PRICING_DEBUG === 'true'
      })
    )

    // Google
    this.register(
      new GooglePricingProvider({
        debug: process.env.PRICING_DEBUG === 'true'
      })
    )

    // Add more providers here as needed
    // DeepSeek, Groq, xAI, etc.
  }

  /**
   * Register a provider
   */
  register(provider: PricingProvider): void {
    this.providers.set(provider.providerId, provider)
    console.log(`[Registry] Registered provider: ${provider.name} (${provider.providerId})`)
  }

  /**
   * Get a specific provider
   */
  get(providerId: string): PricingProvider | undefined {
    return this.providers.get(providerId)
  }

  /**
   * Get all registered providers
   */
  getAll(): PricingProvider[] {
    return Array.from(this.providers.values())
  }

  /**
   * Get only available providers (that can fetch pricing)
   */
  async getAvailable(): Promise<PricingProvider[]> {
    const available: PricingProvider[] = []

    for (const provider of this.providers.values()) {
      try {
        const isAvailable = await provider.isAvailable()
        if (isAvailable) {
          available.push(provider)
        } else {
          console.log(`[Registry] Provider ${provider.name} is not available`)
        }
      } catch (error) {
        console.error(`[Registry] Error checking availability for ${provider.name}:`, error)
      }
    }

    return available
  }

  /**
   * Fetch pricing from all available providers
   */
  async fetchAll(): Promise<Map<string, { success: boolean; data?: any; error?: string }>> {
    const results = new Map<string, { success: boolean; data?: any; error?: string }>()
    const providers = await this.getAvailable()

    console.log(`[Registry] Fetching pricing from ${providers.length} providers`)

    // Fetch in parallel for speed
    const promises = providers.map(async provider => {
      try {
        const result = await provider.fetchPricing()
        return { providerId: provider.providerId, result }
      } catch (error) {
        return {
          providerId: provider.providerId,
          result: {
            success: false,
            pricing: [],
            source: 'error',
            fetchedAt: new Date(),
            errors: [error instanceof Error ? error.message : 'Unknown error']
          }
        }
      }
    })

    const fetchResults = await Promise.allSettled(promises)

    for (const result of fetchResults) {
      if (result.status === 'fulfilled' && result.value) {
        const { providerId, result: fetchResult } = result.value
        results.set(providerId, {
          success: fetchResult.success,
          data: fetchResult,
          error: fetchResult.errors?.join(', ')
        })
      }
    }

    return results
  }

  /**
   * Get provider statistics
   */
  getStats(): {
    total: number
    available: number
    providers: { id: string; name: string; models: number }[]
  } {
    const providers = this.getAll()
    const stats = {
      total: providers.length,
      available: 0,
      providers: providers.map(p => ({
        id: p.providerId,
        name: p.name,
        models: p.getSupportedModels().length
      }))
    }

    return stats
  }
}

// Singleton instance
let registry: ProviderRegistry | null = null

/**
 * Get the global provider registry
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!registry) {
    registry = new ProviderRegistry()
  }
  return registry
}