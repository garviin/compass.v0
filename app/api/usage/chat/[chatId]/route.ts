import { getChatUsage } from '@/lib/pricing/usage-tracking'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> }
) {
  try {
    const { chatId } = await params

    const usage = await getChatUsage(chatId)

    if (!usage || usage.length === 0) {
      return new Response(
        JSON.stringify({
          totalCost: 0,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          messages: []
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      )
    }

    // Aggregate total cost and tokens
    const totalCost = usage.reduce((sum, record) => sum + record.totalCost, 0)
    const inputTokens = usage.reduce(
      (sum, record) => sum + record.inputTokens,
      0
    )
    const outputTokens = usage.reduce(
      (sum, record) => sum + record.outputTokens,
      0
    )
    const totalTokens = usage.reduce(
      (sum, record) => sum + record.totalTokens,
      0
    )

    return new Response(
      JSON.stringify({
        totalCost: parseFloat(totalCost.toFixed(6)),
        inputTokens,
        outputTokens,
        totalTokens,
        messages: usage.map(record => ({
          modelId: record.modelId,
          providerId: record.providerId,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          cost: record.totalCost,
          timestamp: record.createdAt
        }))
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error fetching chat usage:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to fetch chat usage'
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    )
  }
}
