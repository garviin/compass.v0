/**
 * Admin Authentication Middleware
 *
 * Protects admin routes and ensures only authorized users can access them
 */

import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export interface AdminUser {
  id: string
  email: string
  role: string
}

/**
 * Check if user is an admin
 */
export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient()

    // Check user metadata for admin role
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return false
    }

    // Check if user has admin role in metadata
    const isAdminUser = user.user_metadata?.role === 'admin' ||
                       user.email?.endsWith('@yourdomain.com') || // Your domain
                       process.env.ADMIN_EMAILS?.split(',').includes(user.email || '') || false

    return Boolean(isAdminUser)
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

/**
 * Admin middleware for API routes
 */
export async function withAdminAuth(
  request: NextRequest,
  handler: (req: NextRequest, user: AdminUser) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    // Check for API key authentication (for cron jobs, external systems)
    const apiKey = request.headers.get('x-api-key')
    if (apiKey && apiKey === process.env.ADMIN_API_KEY) {
      // API key auth - create synthetic admin user
      const adminUser: AdminUser = {
        id: 'api-key',
        email: 'api@system',
        role: 'admin'
      }
      return handler(request, adminUser)
    }

    // Check for session authentication
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      )
    }

    // Check if user is admin
    const adminStatus = await isAdmin(user.id)
    if (!adminStatus) {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required' },
        { status: 403 }
      )
    }

    const adminUser: AdminUser = {
      id: user.id,
      email: user.email || '',
      role: 'admin'
    }

    // Call the handler with authenticated admin user
    return handler(request, adminUser)
  } catch (error) {
    console.error('Admin auth middleware error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Simple admin check for server components
 */
export async function requireAdmin(): Promise<AdminUser | null> {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
      return null
    }

    const adminStatus = await isAdmin(user.id)
    if (!adminStatus) {
      return null
    }

    return {
      id: user.id,
      email: user.email || '',
      role: 'admin'
    }
  } catch (error) {
    console.error('Error checking admin access:', error)
    return null
  }
}