import { redirect } from 'next/navigation'

import { requireAdmin } from '@/lib/auth/admin-middleware'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check if user is admin
  const adminUser = await requireAdmin()

  if (!adminUser) {
    // Redirect to login or home if not admin
    redirect('/auth/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Admin Panel</h2>
              <p className="text-sm text-muted-foreground">
                Logged in as: {adminUser.email}
              </p>
            </div>
            <nav className="flex gap-4">
              <a
                href="/admin/pricing"
                className="text-sm font-medium hover:underline"
              >
                Pricing
              </a>
              <a
                href="/"
                className="text-sm font-medium hover:underline"
              >
                Back to App
              </a>
            </nav>
          </div>
        </div>
      </div>
      <main>{children}</main>
    </div>
  )
}