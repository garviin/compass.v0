'use client'

import { useEffect, useState } from 'react'

interface ChatCost {
  totalCost: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/**
 * Hook to track and display cost for the current chat session
 * This is a client-side approximation based on message count
 */
export function useChatCost(chatId: string | null) {
  const [cost, setCost] = useState<ChatCost | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!chatId) {
      setCost(null)
      return
    }

    const fetchChatCost = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/usage/chat/${chatId}`)
        if (response.ok) {
          const data = await response.json()
          setCost(data)
        }
      } catch (error) {
        console.error('Failed to fetch chat cost:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchChatCost()
  }, [chatId])

  return { cost, loading }
}
