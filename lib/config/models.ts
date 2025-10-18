import { Model } from '@/lib/types/models'

import defaultModels from './default-models.json'

export function validateModel(model: any): model is Model {
  return (
    typeof model.id === 'string' &&
    typeof model.name === 'string' &&
    typeof model.provider === 'string' &&
    typeof model.providerId === 'string' &&
    typeof model.enabled === 'boolean' &&
    (model.toolCallType === 'native' || model.toolCallType === 'manual') &&
    (model.toolCallModel === undefined ||
      typeof model.toolCallModel === 'string')
  )
}

export async function getModels(): Promise<Model[]> {
  try {
    let staticModels: Model[] = []

    // Try to load from default models first (always available)
    if (
      Array.isArray(defaultModels.models) &&
      defaultModels.models.every(validateModel)
    ) {
      console.log('Successfully loaded default models')
      staticModels = defaultModels.models
    }

    // Try to fetch Ollama models if configured
    try {
      const ollamaModels = await fetchOllamaModels()
      if (ollamaModels.length > 0) {
        console.log(`Successfully loaded ${ollamaModels.length} Ollama models`)
        staticModels = [...staticModels, ...ollamaModels]
      }
    } catch (error) {
      console.warn('Failed to fetch Ollama models:', error)
    }

    console.log(`Loaded ${staticModels.length} total models`)
    return staticModels
  } catch (error) {
    console.warn('Failed to load models:', error)
  }

  // Last resort: return empty array
  console.warn('All attempts to load models failed, returning empty array')
  return []
}

/**
 * Fetch Ollama models from the API endpoint
 */
async function fetchOllamaModels(): Promise<Model[]> {
  try {
    const ollamaUrl = process.env.OLLAMA_BASE_URL
    if (!ollamaUrl) {
      return []
    }

    const response = await fetch('/api/ollama/models', {
      cache: 'no-store',
      headers: {
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    if (Array.isArray(data.models)) {
      return data.models
    }

    return []
  } catch (error) {
    return []
  }
}
