'use client'

import { useState } from 'react'

import { ArrowRight, Calculator, CheckCircle2, TrendingDown } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Subscription options with realistic pricing
const AI_SUBSCRIPTIONS = [
  {
    id: 'chatgpt-plus',
    name: 'ChatGPT Plus',
    provider: 'OpenAI',
    monthlyPrice: 20,
    icon: '🤖',
    color: 'bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300',
  },
  {
    id: 'chatgpt-pro',
    name: 'ChatGPT Pro',
    provider: 'OpenAI',
    monthlyPrice: 200,
    icon: '🚀',
    color: 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300',
  },
  {
    id: 'claude-pro',
    name: 'Claude Pro',
    provider: 'Anthropic',
    monthlyPrice: 20,
    icon: '🧠',
    color: 'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300',
  },
  {
    id: 'gemini-advanced',
    name: 'Gemini Advanced',
    provider: 'Google',
    monthlyPrice: 19.99,
    icon: '✨',
    color: 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300',
  },
  {
    id: 'copilot-pro',
    name: 'Copilot Pro',
    provider: 'Microsoft',
    monthlyPrice: 20,
    icon: '💡',
    color: 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300',
  },
] as const

// Usage profiles with estimated tokens per month
const USAGE_PROFILES = [
  {
    id: 'light',
    name: 'Light User',
    description: 'A few questions per week',
    estimatedInputTokens: 50000, // ~50k tokens/month
    estimatedOutputTokens: 50000,
    emoji: '🌱',
  },
  {
    id: 'medium',
    name: 'Medium User',
    description: 'Regular daily usage',
    estimatedInputTokens: 200000, // ~200k tokens/month
    estimatedOutputTokens: 200000,
    emoji: '🌿',
  },
  {
    id: 'heavy',
    name: 'Heavy User',
    description: 'Multiple conversations daily',
    estimatedInputTokens: 500000, // ~500k tokens/month
    estimatedOutputTokens: 500000,
    emoji: '🌳',
  },
  {
    id: 'power',
    name: 'Power User',
    description: 'Constant professional use',
    estimatedInputTokens: 1000000, // ~1M tokens/month
    estimatedOutputTokens: 1000000,
    emoji: '🚀',
  },
] as const

// Pricing for our platform (average across popular models)
const OUR_PRICING = {
  // Weighted average of popular models (GPT-4o, Claude 3.5 Sonnet, Gemini 2.0)
  inputPricePer1kTokens: 0.0015, // Average: ~$0.0015
  outputPricePer1kTokens: 0.006, // Average: ~$0.006
}

export function SavingsCalculator() {
  const [selectedUsageProfile, setSelectedUsageProfile] = useState<
    (typeof USAGE_PROFILES)[number]['id']
  >('medium')
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<string[]>(
    ['chatgpt-plus']
  )
  const [showBreakdown, setShowBreakdown] = useState(false)

  const usageProfile = USAGE_PROFILES.find(p => p.id === selectedUsageProfile)!

  // Calculate total subscription cost
  const totalSubscriptionCost = AI_SUBSCRIPTIONS.filter(sub =>
    selectedSubscriptions.includes(sub.id)
  ).reduce((sum, sub) => sum + sub.monthlyPrice, 0)

  // Calculate pay-as-you-go cost
  const inputCost =
    (usageProfile.estimatedInputTokens / 1000) *
    OUR_PRICING.inputPricePer1kTokens
  const outputCost =
    (usageProfile.estimatedOutputTokens / 1000) *
    OUR_PRICING.outputPricePer1kTokens
  const totalPayAsYouGoCost = inputCost + outputCost

  // Calculate savings
  const monthlySavings = totalSubscriptionCost - totalPayAsYouGoCost
  const yearlySavings = monthlySavings * 12
  const savingsPercentage =
    totalSubscriptionCost > 0
      ? (monthlySavings / totalSubscriptionCost) * 100
      : 0

  const toggleSubscription = (subscriptionId: string) => {
    setSelectedSubscriptions(prev =>
      prev.includes(subscriptionId)
        ? prev.filter(id => id !== subscriptionId)
        : [...prev, subscriptionId]
    )
  }

  return (
    <div className="space-y-6">
      {/* Configuration Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Usage Profile Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Your Usage Profile
            </CardTitle>
            <CardDescription>
              How often do you use AI chatbots?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={selectedUsageProfile}
              onValueChange={value =>
                setSelectedUsageProfile(
                  value as (typeof USAGE_PROFILES)[number]['id']
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USAGE_PROFILES.map(profile => (
                  <SelectItem key={profile.id} value={profile.id}>
                    <div className="flex items-center gap-2">
                      <span>{profile.emoji}</span>
                      <div className="flex flex-col">
                        <span className="font-medium">{profile.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {profile.description}
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mt-4 rounded-lg bg-muted p-4">
              <p className="text-sm font-medium">Estimated monthly usage:</p>
              <p className="text-xs text-muted-foreground mt-1">
                ~{(usageProfile.estimatedInputTokens / 1000).toFixed(0)}K input
                tokens, ~
                {(usageProfile.estimatedOutputTokens / 1000).toFixed(0)}K
                output tokens
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Your Current Subscriptions</CardTitle>
            <CardDescription>
              Select the AI services you currently subscribe to
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {AI_SUBSCRIPTIONS.map(subscription => (
                <div
                  key={subscription.id}
                  className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => toggleSubscription(subscription.id)}
                >
                  <Checkbox
                    checked={selectedSubscriptions.includes(subscription.id)}
                    onCheckedChange={() => toggleSubscription(subscription.id)}
                  />
                  <div className="flex-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{subscription.icon}</span>
                      <div>
                        <Label className="font-medium cursor-pointer">
                          {subscription.name}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {subscription.provider}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">
                        ${subscription.monthlyPrice}/mo
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results Section */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-green-600" />
            Your Potential Savings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {/* Subscription Cost */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Current Subscriptions
              </p>
              <p className="text-3xl font-bold">
                ${totalSubscriptionCost.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">per month</p>
            </div>

            {/* Arrow */}
            <div className="flex items-center justify-center">
              <ArrowRight className="h-8 w-8 text-muted-foreground" />
            </div>

            {/* Pay-as-you-go Cost */}
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">With Morphic</p>
              <p className="text-3xl font-bold text-green-600">
                ${totalPayAsYouGoCost.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground">per month</p>
            </div>
          </div>

          {/* Savings Highlight */}
          {monthlySavings > 0 ? (
            <div className="mt-6 rounded-lg bg-green-100 dark:bg-green-950 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <p className="font-semibold text-green-900 dark:text-green-100">
                  You could save:
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2 mt-3">
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    ${monthlySavings.toFixed(2)}/month
                  </p>
                  <Badge
                    variant="secondary"
                    className="mt-1 bg-green-200 dark:bg-green-900 text-green-800 dark:text-green-200"
                  >
                    {savingsPercentage.toFixed(0)}% savings
                  </Badge>
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">
                    ${yearlySavings.toFixed(2)}/year
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    Annual savings
                  </p>
                </div>
              </div>
            </div>
          ) : monthlySavings < 0 ? (
            <div className="mt-6 rounded-lg bg-blue-100 dark:bg-blue-950 p-4">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                For your usage level, pay-as-you-go gives you unlimited access
                to multiple AI models for just $
                {totalPayAsYouGoCost.toFixed(2)}/month - no subscription
                limits!
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                Select your subscriptions above to see your potential savings
              </p>
            </div>
          )}

          {/* Breakdown Toggle */}
          <div className="mt-6">
            <Button
              variant="outline"
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="w-full"
            >
              {showBreakdown ? 'Hide' : 'Show'} Cost Breakdown
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      {showBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Cost Breakdown</CardTitle>
            <CardDescription>
              How we calculate your savings with pay-as-you-go pricing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Subscription Breakdown */}
              <div>
                <h3 className="font-semibold mb-3">
                  Your Current Subscriptions
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead className="text-right">
                        Monthly Cost
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSubscriptions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground"
                        >
                          No subscriptions selected
                        </TableCell>
                      </TableRow>
                    ) : (
                      AI_SUBSCRIPTIONS.filter(sub =>
                        selectedSubscriptions.includes(sub.id)
                      ).map(sub => (
                        <TableRow key={sub.id}>
                          <TableCell className="font-medium">
                            {sub.icon} {sub.name}
                          </TableCell>
                          <TableCell>{sub.provider}</TableCell>
                          <TableCell className="text-right">
                            ${sub.monthlyPrice.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    <TableRow className="font-semibold">
                      <TableCell colSpan={2}>Total Subscriptions</TableCell>
                      <TableCell className="text-right">
                        ${totalSubscriptionCost.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Pay-as-you-go Breakdown */}
              <div>
                <h3 className="font-semibold mb-3">
                  Pay-as-you-go with Morphic
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usage Type</TableHead>
                      <TableHead>Estimated Tokens</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">
                        Input (Prompts)
                      </TableCell>
                      <TableCell>
                        {(usageProfile.estimatedInputTokens / 1000).toFixed(0)}
                        K tokens
                      </TableCell>
                      <TableCell>
                        ${OUR_PRICING.inputPricePer1kTokens.toFixed(4)}/1K
                      </TableCell>
                      <TableCell className="text-right">
                        ${inputCost.toFixed(4)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">
                        Output (Responses)
                      </TableCell>
                      <TableCell>
                        {(usageProfile.estimatedOutputTokens / 1000).toFixed(0)}
                        K tokens
                      </TableCell>
                      <TableCell>
                        ${OUR_PRICING.outputPricePer1kTokens.toFixed(4)}/1K
                      </TableCell>
                      <TableCell className="text-right">
                        ${outputCost.toFixed(4)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="font-semibold">
                      <TableCell colSpan={3}>
                        Total Pay-as-you-go Cost
                      </TableCell>
                      <TableCell className="text-right">
                        ${totalPayAsYouGoCost.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Summary */}
              <div className="rounded-lg bg-muted p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Monthly Difference:</span>
                  <span
                    className={`text-lg font-bold ${
                      monthlySavings > 0
                        ? 'text-green-600'
                        : monthlySavings < 0
                          ? 'text-red-600'
                          : ''
                    }`}
                  >
                    {monthlySavings > 0 ? '-' : monthlySavings < 0 ? '+' : ''}$
                    {Math.abs(monthlySavings).toFixed(2)}
                  </span>
                </div>
                {monthlySavings > 0 && (
                  <p className="text-xs text-muted-foreground mt-2">
                    That&apos;s ${yearlySavings.toFixed(2)} saved annually by
                    only paying for what you use!
                  </p>
                )}
              </div>

              {/* Additional Info */}
              <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/50 p-4">
                <h4 className="font-semibold text-sm mb-2 text-blue-900 dark:text-blue-100">
                  Why pay-as-you-go?
                </h4>
                <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    Access to 24+ AI models (GPT-4, Claude, Gemini, and more)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    No usage limits or rate restrictions
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    Only pay for actual tokens used
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    Switch between models based on your needs
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
