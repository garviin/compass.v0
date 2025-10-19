'use client'

import { useEffect, useState } from 'react'

import {
  Activity,
  AlertCircle,
  Bell,
  CheckCircle2,
  Clock,
  Database,
  Info,
  RefreshCw,
  XCircle} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SystemStatus {
  status: 'healthy' | 'degraded' | 'critical'
  healthScore: number
  issues: string[]
  database: {
    totalModels: number
    activeModels: number
    inactiveModels: number
    staleModels: number
    recentChanges: number
    lastSync?: {
      timestamp: string
      triggeredBy: string
      source: string
    }
  }
  providers: {
    registered: number
    available: number
    health: Array<{
      providerId: string
      name: string
      status: string
      modelCount: number
    }>
  }
  alerts: {
    slack: { enabled: boolean }
    email: { enabled: boolean, recipients: number }
  }
  sync: {
    enabled: boolean
    frequency: string
    nextRun: string
  }
}

interface PricingHistory {
  id: string
  modelId: string
  providerId: string
  oldInputPrice?: number
  oldOutputPrice?: number
  newInputPrice: number
  newOutputPrice: number
  changePercentInput?: number
  changePercentOutput?: number
  changedBy: string
  changeReason?: string
  createdAt: string
}

export default function AdminPricingDashboard() {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [history, setHistory] = useState<PricingHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'providers' | 'history' | 'config'>('providers')

  useEffect(() => {
    fetchStatus()
    fetchHistory()
  }, [])

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/admin/pricing/status')
      if (!response.ok) {
        throw new Error('Failed to fetch status')
      }
      const data = await response.json()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/admin/pricing/history?limit=10')
      if (!response.ok) {
        throw new Error('Failed to fetch history')
      }
      const data = await response.json()
      setHistory(data.history || [])
    } catch (err) {
      console.error('Failed to fetch history:', err)
    }
  }

  const triggerSync = async (dryRun: boolean = false) => {
    setSyncing(true)
    setSyncResult(null)
    setError(null)

    try {
      const response = await fetch('/api/admin/pricing/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun })
      })

      if (!response.ok) {
        throw new Error('Sync failed')
      }

      const result = await response.json()
      setSyncResult(result)

      // Refresh status and history after sync
      if (!dryRun && result.success) {
        await fetchStatus()
        await fetchHistory()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />
      case 'degraded':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />
      default:
        return <Info className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      healthy: 'default',
      degraded: 'secondary',
      critical: 'destructive'
    }
    return (
      <Badge variant={variants[status] || 'outline'}>
        {status.toUpperCase()}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Pricing Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Monitor and manage AI model pricing synchronization
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-red-500 bg-red-50 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {syncResult && (
        <div className={`mb-6 p-4 border rounded-lg ${syncResult.success ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'}`}>
          <div className="flex items-start gap-3">
            <Activity className={`h-4 w-4 mt-0.5 ${syncResult.success ? 'text-green-500' : 'text-red-500'}`} />
            <div>
              <h3 className={`font-medium ${syncResult.success ? 'text-green-900' : 'text-red-900'}`}>
                Sync {syncResult.dryRun ? 'Preview' : 'Complete'}
              </h3>
              <p className={`text-sm mt-1 ${syncResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {syncResult.success ? (
                  <>
                    Successfully processed {syncResult.providers.successful} providers.
                    {syncResult.changes.applied > 0 && ` Applied ${syncResult.changes.applied} changes.`}
                    {syncResult.dryRun && ' (Dry run - no changes applied)'}
                  </>
                ) : (
                  `Sync failed: ${syncResult.errors?.join(', ')}`
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Status Overview */}
      {status && (
        <div className="grid gap-6 mb-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                System Health
                {getStatusIcon(status.status)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.healthScore}%</div>
              {getStatusBadge(status.status)}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Database className="h-4 w-4" />
                Models
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.database.activeModels}</div>
              <p className="text-xs text-muted-foreground">
                {status.database.totalModels} total / {status.database.staleModels} stale
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Recent Changes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{status.database.recentChanges}</div>
              <p className="text-xs text-muted-foreground">Last 24 hours</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Next Sync
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {status.sync.enabled
                  ? new Date(status.sync.nextRun).toLocaleString()
                  : 'Disabled'}
              </div>
              <p className="text-xs text-muted-foreground">{status.sync.frequency}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Issues Alert */}
      {status?.issues && status.issues.length > 0 && (
        <div className="mb-6 p-4 border border-red-500 bg-red-50 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-red-900">System Issues</h3>
              <ul className="list-disc list-inside mt-2 text-sm text-red-700">
                {status.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <Button
              variant={activeTab === 'providers' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('providers')}
            >
              Providers
            </Button>
            <Button
              variant={activeTab === 'history' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('history')}
            >
              Change History
            </Button>
            <Button
              variant={activeTab === 'config' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('config')}
            >
              Configuration
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => triggerSync(true)}
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Activity className="h-4 w-4 mr-2" />
              )}
              Preview Sync
            </Button>
            <Button
              onClick={() => triggerSync(false)}
              disabled={syncing}
            >
              {syncing ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Now
            </Button>
          </div>
        </div>

        {activeTab === 'providers' && (
          <Card>
            <CardHeader>
              <CardTitle>Provider Status</CardTitle>
              <CardDescription>
                Active pricing providers and their health status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {status?.providers.health.map(provider => (
                  <div
                    key={provider.providerId}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {provider.modelCount} models
                      </p>
                    </div>
                    <Badge
                      variant={provider.status === 'healthy' ? 'default' : 'destructive'}
                    >
                      {provider.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'history' && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Price Changes</CardTitle>
              <CardDescription>
                Last 10 pricing updates across all providers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {history.map(change => (
                  <div
                    key={change.id}
                    className="flex flex-col gap-2 p-4 border rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{change.modelId}</p>
                        <p className="text-sm text-muted-foreground">
                          {change.providerId} • {new Date(change.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        {change.changePercentInput && (
                          <Badge variant={change.changePercentInput > 0 ? 'destructive' : 'default'}>
                            {change.changePercentInput > 0 ? '+' : ''}{change.changePercentInput.toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Changed by: </span>
                      {change.changedBy}
                      {change.changeReason && (
                        <span className="text-muted-foreground"> • {change.changeReason}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'config' && (
          <Card>
            <CardHeader>
              <CardTitle>System Configuration</CardTitle>
              <CardDescription>
                Current settings for pricing synchronization
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Alert Channels
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span>Slack Notifications</span>
                    <Badge variant={status?.alerts.slack.enabled ? 'default' : 'secondary'}>
                      {status?.alerts.slack.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded">
                    <span>Email Notifications</span>
                    <Badge variant={status?.alerts.email.enabled ? 'default' : 'secondary'}>
                      {status?.alerts.email.enabled
                        ? `${status.alerts.email.recipients} recipients`
                        : 'Disabled'}
                    </Badge>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Sync Schedule
                </h3>
                <div className="p-3 border rounded">
                  <div className="flex items-center justify-between">
                    <span>Automated Sync</span>
                    <Badge variant={status?.sync.enabled ? 'default' : 'secondary'}>
                      {status?.sync.enabled ? status.sync.frequency : 'Disabled'}
                    </Badge>
                  </div>
                  {status?.sync.enabled && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Next run: {new Date(status.sync.nextRun).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {status?.database.lastSync && (
                <div>
                  <h3 className="font-medium mb-3">Last Sync</h3>
                  <div className="p-3 border rounded space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Time: </span>
                      {new Date(status.database.lastSync.timestamp).toLocaleString()}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Triggered by: </span>
                      {status.database.lastSync.triggeredBy}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Source: </span>
                      {status.database.lastSync.source}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}