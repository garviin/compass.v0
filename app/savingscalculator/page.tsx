import { Metadata } from 'next'

import { SavingsCalculator } from './components/savings-calculator'

export const metadata: Metadata = {
  title: 'Savings Calculator - Morphic',
  description:
    'Calculate how much you can save by switching to pay-as-you-go AI instead of expensive subscriptions.',
}

export default function SavingsCalculatorPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            AI Subscription Savings Calculator
          </h1>
          <p className="text-muted-foreground">
            Discover how much you can save by switching from expensive monthly
            subscriptions to our pay-as-you-go model. Only pay for what you
            use.
          </p>
        </div>
        <SavingsCalculator />
      </div>
    </div>
  )
}
