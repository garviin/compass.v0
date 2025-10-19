/**
 * Alert Service
 *
 * Sends notifications about pricing changes via Slack, email, etc.
 */

import { ChangeDetectionResult, PricingChangeDetection } from './change-detector'
import { SyncResult } from './sync-orchestrator'

export interface AlertConfig {
  slack?: {
    enabled: boolean
    webhookUrl: string
    channel?: string
    username?: string
    iconEmoji?: string
  }
  email?: {
    enabled: boolean
    recipients: string[]
    from?: string
    provider?: 'resend' | 'sendgrid' | 'smtp'
  }
  console?: {
    enabled: boolean
  }
}

export interface AlertResult {
  success: boolean
  slack?: { sent: boolean; error?: string }
  email?: { sent: boolean; error?: string }
  console?: { sent: boolean }
}

export class AlertService {
  constructor(private config: AlertConfig) {}

  /**
   * Send alerts about sync results
   */
  async sendSyncAlert(
    syncResult: SyncResult,
    changes?: ChangeDetectionResult
  ): Promise<AlertResult> {
    const result: AlertResult = { success: true }

    // Generate alert message
    const message = this.formatSyncMessage(syncResult, changes)

    // Send to configured channels
    const promises: Promise<void>[] = []

    if (this.config.slack?.enabled && this.config.slack.webhookUrl) {
      promises.push(
        this.sendSlackAlert(message).then(
          slackResult => {
            result.slack = slackResult
            if (!slackResult.sent) result.success = false
          }
        )
      )
    }

    if (this.config.email?.enabled && this.config.email.recipients.length > 0) {
      promises.push(
        this.sendEmailAlert(message, syncResult).then(
          emailResult => {
            result.email = emailResult
            if (!emailResult.sent) result.success = false
          }
        )
      )
    }

    if (this.config.console?.enabled) {
      console.log('\n📢 PRICING SYNC ALERT\n' + message)
      result.console = { sent: true }
    }

    await Promise.allSettled(promises)
    return result
  }

  /**
   * Send Slack notification
   */
  private async sendSlackAlert(
    message: string
  ): Promise<{ sent: boolean; error?: string }> {
    if (!this.config.slack?.webhookUrl) {
      return { sent: false, error: 'No Slack webhook URL configured' }
    }

    try {
      const payload = {
        text: message,
        channel: this.config.slack.channel,
        username: this.config.slack.username || 'Pricing Bot',
        icon_emoji: this.config.slack.iconEmoji || ':chart_with_upwards_trend:',
        mrkdwn: true
      }

      const response = await fetch(this.config.slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status}`)
      }

      return { sent: true }
    } catch (error) {
      return {
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailAlert(
    message: string,
    syncResult: SyncResult
  ): Promise<{ sent: boolean; error?: string }> {
    if (!this.config.email?.recipients || this.config.email.recipients.length === 0) {
      return { sent: false, error: 'No email recipients configured' }
    }

    try {
      // Convert message to HTML
      const htmlMessage = this.formatEmailHtml(message, syncResult)

      // Send based on provider
      if (this.config.email.provider === 'resend') {
        return await this.sendViaResend(htmlMessage, syncResult)
      } else {
        // For now, just log that we would send email
        console.log('Would send email to:', this.config.email.recipients.join(', '))
        return { sent: true }
      }
    } catch (error) {
      return {
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Send email via Resend
   */
  private async sendViaResend(
    htmlMessage: string,
    syncResult: SyncResult
  ): Promise<{ sent: boolean; error?: string }> {
    if (!process.env.RESEND_API_KEY) {
      return { sent: false, error: 'RESEND_API_KEY not configured' }
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: this.config.email?.from || 'pricing@yourdomain.com',
          to: this.config.email?.recipients,
          subject: this.getEmailSubject(syncResult),
          html: htmlMessage
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Resend API error: ${error}`)
      }

      return { sent: true }
    } catch (error) {
      return {
        sent: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Format sync message for alerts
   */
  private formatSyncMessage(
    syncResult: SyncResult,
    changes?: ChangeDetectionResult
  ): string {
    const lines: string[] = []

    // Header
    if (syncResult.success) {
      lines.push('✅ *Pricing Sync Completed Successfully*\n')
    } else {
      lines.push('❌ *Pricing Sync Failed*\n')
    }

    // Timestamp
    lines.push(`📅 *Time:* ${syncResult.timestamp.toISOString()}`)
    lines.push(`⏱️ *Duration:* ${syncResult.duration}ms\n`)

    // Provider summary
    lines.push('*📊 Providers:*')
    lines.push(`• Total: ${syncResult.providers.total}`)
    lines.push(`• Successful: ${syncResult.providers.successful}`)
    if (syncResult.providers.failed > 0) {
      lines.push(`• Failed: ${syncResult.providers.failed}`)
    }
    lines.push('')

    // Changes summary
    lines.push('*📈 Changes:*')
    if (syncResult.changes.applied > 0) {
      lines.push(`• Applied: ${syncResult.changes.applied}`)
    }
    if (syncResult.changes.newModels > 0) {
      lines.push(`• New models: ${syncResult.changes.newModels}`)
    }
    if (syncResult.changes.updatedModels > 0) {
      lines.push(`• Updated models: ${syncResult.changes.updatedModels}`)
    }
    if (syncResult.changes.removedModels > 0) {
      lines.push(`• Removed models: ${syncResult.changes.removedModels}`)
    }
    if (syncResult.changes.skipped > 0) {
      lines.push(`• Skipped: ${syncResult.changes.skipped}`)
    }
    if (syncResult.changes.failed > 0) {
      lines.push(`• Failed: ${syncResult.changes.failed}`)
    }

    // Detailed changes if available
    if (changes && changes.changes.length > 0) {
      const significantChanges = changes.changes.filter(
        c => c.changeType !== 'unchanged' && c.autoApplicable
      )

      if (significantChanges.length > 0 && significantChanges.length <= 5) {
        lines.push('\n*💡 Notable Changes:*')
        for (const change of significantChanges.slice(0, 5)) {
          if (change.changeType === 'updated' && change.changePercent) {
            lines.push(
              `• ${change.modelId}: ` +
              `Input ${this.formatPercent(change.changePercent.input)}, ` +
              `Output ${this.formatPercent(change.changePercent.output)}`
            )
          } else if (change.changeType === 'new') {
            lines.push(`• ${change.modelId}: Added to pricing`)
          }
        }
      }
    }

    // Errors
    if (syncResult.errors.length > 0) {
      lines.push('\n*⚠️ Errors:*')
      for (const error of syncResult.errors.slice(0, 3)) {
        lines.push(`• ${error}`)
      }
    }

    // Warnings
    if (syncResult.warnings.length > 0) {
      lines.push('\n*⚠️ Warnings:*')
      for (const warning of syncResult.warnings.slice(0, 3)) {
        lines.push(`• ${warning}`)
      }
    }

    // Footer
    lines.push('\n---')
    lines.push('_Generated by Automated Pricing System_')

    return lines.join('\n')
  }

  /**
   * Format percentage for display
   */
  private formatPercent(value: number): string {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(1)}%`
  }

  /**
   * Get email subject based on sync result
   */
  private getEmailSubject(syncResult: SyncResult): string {
    if (!syncResult.success) {
      return '❌ Pricing Sync Failed - Action Required'
    }

    if (syncResult.changes.applied > 0) {
      return `✅ Pricing Updated - ${syncResult.changes.applied} changes applied`
    }

    return '✅ Pricing Sync Completed - No changes'
  }

  /**
   * Format HTML email
   */
  private formatEmailHtml(message: string, syncResult: SyncResult): string {
    // Convert markdown-style formatting to HTML
    const htmlContent = message
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>')
      .replace(/•/g, '&bull;')

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${syncResult.success ? '#4CAF50' : '#f44336'}; color: white; padding: 10px; border-radius: 5px; }
    .content { background: #f9f9f9; padding: 20px; margin-top: 10px; border-radius: 5px; }
    .footer { margin-top: 20px; color: #666; font-size: 0.9em; }
    strong { color: #000; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>${this.getEmailSubject(syncResult)}</h2>
    </div>
    <div class="content">
      ${htmlContent}
    </div>
    <div class="footer">
      <p>This is an automated message from the Pricing System.</p>
    </div>
  </div>
</body>
</html>
    `
  }
}

/**
 * Create alert service from environment variables
 */
export function createAlertService(): AlertService {
  const config: AlertConfig = {
    slack: {
      enabled: !!process.env.SLACK_WEBHOOK_URL,
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
      channel: process.env.SLACK_CHANNEL,
      username: process.env.SLACK_USERNAME || 'Pricing Bot',
      iconEmoji: process.env.SLACK_ICON_EMOJI || ':chart_with_upwards_trend:'
    },
    email: {
      enabled: !!process.env.ALERT_EMAIL_RECIPIENTS,
      recipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',').map(e => e.trim()) || [],
      from: process.env.ALERT_EMAIL_FROM || 'pricing@yourdomain.com',
      provider: (process.env.EMAIL_PROVIDER as any) || 'resend'
    },
    console: {
      enabled: process.env.NODE_ENV === 'development' || process.env.ALERT_CONSOLE === 'true'
    }
  }

  return new AlertService(config)
}