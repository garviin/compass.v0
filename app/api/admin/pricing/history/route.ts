/**
 * GET /api/admin/pricing/history
 *
 * Get pricing change history
 */

import { NextRequest, NextResponse } from 'next/server'

import { withAdminAuth } from '@/lib/auth/admin-middleware'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  return withAdminAuth(request, async (req, user) => {
    try {
      const url = new URL(req.url)
      const modelId = url.searchParams.get('modelId')
      const providerId = url.searchParams.get('providerId')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')
      const startDate = url.searchParams.get('startDate')
      const endDate = url.searchParams.get('endDate')

      const supabase = createAdminClient()

      // Build query
      let query = supabase
        .from('model_pricing_history')
        .select('*')
        .order('created_at', { ascending: false })

      // Apply filters
      if (modelId) {
        query = query.eq('model_id', modelId)
      }

      if (providerId) {
        query = query.eq('provider_id', providerId)
      }

      if (startDate) {
        query = query.gte('created_at', startDate)
      }

      if (endDate) {
        query = query.lte('created_at', endDate)
      }

      // Pagination
      query = query.range(offset, offset + limit - 1)

      const { data, error, count } = await query

      if (error) {
        throw error
      }

      // Format the response
      const history = data?.map(row => ({
        id: row.id,
        modelId: row.model_id,
        providerId: row.provider_id,
        oldInputPrice: row.old_input_price ? parseFloat(row.old_input_price) : null,
        oldOutputPrice: row.old_output_price ? parseFloat(row.old_output_price) : null,
        newInputPrice: parseFloat(row.new_input_price),
        newOutputPrice: parseFloat(row.new_output_price),
        changePercentInput: row.change_percent_input ? parseFloat(row.change_percent_input) : null,
        changePercentOutput: row.change_percent_output ? parseFloat(row.change_percent_output) : null,
        changedBy: row.changed_by,
        changeSource: row.change_source,
        changeReason: row.change_reason,
        metadata: row.metadata,
        createdAt: row.created_at
      })) || []

      // Get summary statistics
      const statsQuery = supabase
        .from('model_pricing_history')
        .select('changed_by, count', { count: 'exact' })

      if (modelId) statsQuery.eq('model_id', modelId)
      if (providerId) statsQuery.eq('provider_id', providerId)

      const { count: totalCount } = await statsQuery

      return NextResponse.json({
        history,
        pagination: {
          limit,
          offset,
          total: totalCount || 0,
          hasMore: (offset + limit) < (totalCount || 0)
        },
        filters: {
          modelId,
          providerId,
          startDate,
          endDate
        }
      })
    } catch (error) {
      console.error('[Admin API] History error:', error)
      return NextResponse.json(
        {
          error: 'Failed to fetch pricing history',
          details: error instanceof Error ? error.message : 'Unknown error'
        },
        { status: 500 }
      )
    }
  })
}