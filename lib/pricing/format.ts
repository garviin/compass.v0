/**
 * Client-safe formatting utilities for pricing and tokens
 * These functions have no dependencies on server-only code
 */

import {
  formatCurrencyAmount,
  getCurrencyInfo,
  type SupportedCurrency
} from './currency-service'

/**
 * Format cost as currency string with locale-aware formatting
 * @param cost - The amount to format
 * @param currency - Currency code (ISO 4217)
 * @param locale - Optional locale override (defaults to currency's default locale)
 */
export function formatCost(
  cost: number,
  currency: string = 'USD',
  locale?: string
): string {
  // Use the new currency service if currency is supported
  if (currency in getCurrencyInfo(currency as SupportedCurrency)) {
    return formatCurrencyAmount(cost, currency as SupportedCurrency, locale)
  }

  // Fallback to basic Intl formatting for unsupported currencies
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }).format(cost)
  } catch (error) {
    console.error('Currency formatting error:', error)
    return `${currency} ${cost.toFixed(2)}`
  }
}

/**
 * Format cost as compact currency string (e.g., $1.5K, $2.3M)
 * Useful for displaying large amounts in limited space
 */
export function formatCompactCost(
  cost: number,
  currency: string = 'USD',
  locale?: string
): string {
  try {
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(cost)
  } catch (error) {
    console.error('Compact currency formatting error:', error)
    return formatCost(cost, currency, locale)
  }
}

/**
 * Format token count with locale-aware number formatting
 */
export function formatTokens(tokens: number, locale: string = 'en-US'): string {
  return new Intl.NumberFormat(locale).format(tokens)
}

/**
 * Format token count in compact form (e.g., 1.5K, 2.3M)
 */
export function formatCompactTokens(
  tokens: number,
  locale: string = 'en-US'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(tokens)
  } catch (error) {
    console.error('Compact token formatting error:', error)
    return formatTokens(tokens, locale)
  }
}
