'use client'

import { DollarSign } from 'lucide-react'

import { formatCost, formatTokens } from '@/lib/pricing/cost-estimation'

import { useChatCost } from '@/hooks/use-chat-cost'

interface ChatCostDisplayProps {
  chatId: string | null
}

export function ChatCostDisplay({ chatId }: ChatCostDisplayProps) {
  const { cost, loading } = useChatCost(chatId)

  if (!chatId || loading || !cost || cost.totalCost === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground bg-muted/50 rounded-md border border-border/50">
      <DollarSign className="size-3" />
      <div className="flex items-center gap-3">
        <span className="font-medium">
          Cost: {formatCost(cost.totalCost)}
        </span>
        <span className="opacity-70">|</span>
        <span>
          Tokens: {formatTokens(cost.totalTokens)}
          {cost.inputTokens > 0 && cost.outputTokens > 0 && (
            <span className="opacity-70 ml-1">
              ({formatTokens(cost.inputTokens)} in / {formatTokens(cost.outputTokens)} out)
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
