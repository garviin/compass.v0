/**
 * Currency localization service
 * Handles currency formatting, locale detection, and currency information
 */

export type SupportedCurrency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'CAD'
  | 'AUD'
  | 'JPY'
  | 'CHF'
  | 'CNY'
  | 'INR'
  | 'MXN'
  | 'BRL'
  | 'ZAR'
  | 'SGD'
  | 'HKD'
  | 'NZD'
  | 'SEK'
  | 'NOK'
  | 'DKK'
  | 'PLN'
  | 'CZK'
  | 'HUF'
  | 'RON'
  | 'TRY'
  | 'ILS'
  | 'CLP'
  | 'PHP'
  | 'AED'
  | 'SAR'
  | 'THB'
  | 'IDR'
  | 'MYR'
  | 'KRW'
  | 'TWD'
  | 'VND'

export interface CurrencyInfo {
  code: SupportedCurrency
  name: string
  symbol: string
  decimalPlaces: number
  locale: string
}

/**
 * Currency information for all supported currencies
 */
export const CURRENCY_INFO: Record<SupportedCurrency, CurrencyInfo> = {
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimalPlaces: 2,
    locale: 'en-US'
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimalPlaces: 2,
    locale: 'de-DE'
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    decimalPlaces: 2,
    locale: 'en-GB'
  },
  CAD: {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'CA$',
    decimalPlaces: 2,
    locale: 'en-CA'
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    decimalPlaces: 2,
    locale: 'en-AU'
  },
  JPY: {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    decimalPlaces: 0,
    locale: 'ja-JP'
  },
  CHF: {
    code: 'CHF',
    name: 'Swiss Franc',
    symbol: 'CHF',
    decimalPlaces: 2,
    locale: 'de-CH'
  },
  CNY: {
    code: 'CNY',
    name: 'Chinese Yuan',
    symbol: '¥',
    decimalPlaces: 2,
    locale: 'zh-CN'
  },
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    decimalPlaces: 2,
    locale: 'en-IN'
  },
  MXN: {
    code: 'MXN',
    name: 'Mexican Peso',
    symbol: 'MX$',
    decimalPlaces: 2,
    locale: 'es-MX'
  },
  BRL: {
    code: 'BRL',
    name: 'Brazilian Real',
    symbol: 'R$',
    decimalPlaces: 2,
    locale: 'pt-BR'
  },
  ZAR: {
    code: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    decimalPlaces: 2,
    locale: 'en-ZA'
  },
  SGD: {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'S$',
    decimalPlaces: 2,
    locale: 'en-SG'
  },
  HKD: {
    code: 'HKD',
    name: 'Hong Kong Dollar',
    symbol: 'HK$',
    decimalPlaces: 2,
    locale: 'zh-HK'
  },
  NZD: {
    code: 'NZD',
    name: 'New Zealand Dollar',
    symbol: 'NZ$',
    decimalPlaces: 2,
    locale: 'en-NZ'
  },
  SEK: {
    code: 'SEK',
    name: 'Swedish Krona',
    symbol: 'kr',
    decimalPlaces: 2,
    locale: 'sv-SE'
  },
  NOK: {
    code: 'NOK',
    name: 'Norwegian Krone',
    symbol: 'kr',
    decimalPlaces: 2,
    locale: 'no-NO'
  },
  DKK: {
    code: 'DKK',
    name: 'Danish Krone',
    symbol: 'kr',
    decimalPlaces: 2,
    locale: 'da-DK'
  },
  PLN: {
    code: 'PLN',
    name: 'Polish Zloty',
    symbol: 'zł',
    decimalPlaces: 2,
    locale: 'pl-PL'
  },
  CZK: {
    code: 'CZK',
    name: 'Czech Koruna',
    symbol: 'Kč',
    decimalPlaces: 2,
    locale: 'cs-CZ'
  },
  HUF: {
    code: 'HUF',
    name: 'Hungarian Forint',
    symbol: 'Ft',
    decimalPlaces: 0,
    locale: 'hu-HU'
  },
  RON: {
    code: 'RON',
    name: 'Romanian Leu',
    symbol: 'lei',
    decimalPlaces: 2,
    locale: 'ro-RO'
  },
  TRY: {
    code: 'TRY',
    name: 'Turkish Lira',
    symbol: '₺',
    decimalPlaces: 2,
    locale: 'tr-TR'
  },
  ILS: {
    code: 'ILS',
    name: 'Israeli Shekel',
    symbol: '₪',
    decimalPlaces: 2,
    locale: 'he-IL'
  },
  CLP: {
    code: 'CLP',
    name: 'Chilean Peso',
    symbol: 'CLP$',
    decimalPlaces: 0,
    locale: 'es-CL'
  },
  PHP: {
    code: 'PHP',
    name: 'Philippine Peso',
    symbol: '₱',
    decimalPlaces: 2,
    locale: 'en-PH'
  },
  AED: {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'د.إ',
    decimalPlaces: 2,
    locale: 'ar-AE'
  },
  SAR: {
    code: 'SAR',
    name: 'Saudi Riyal',
    symbol: '﷼',
    decimalPlaces: 2,
    locale: 'ar-SA'
  },
  THB: {
    code: 'THB',
    name: 'Thai Baht',
    symbol: '฿',
    decimalPlaces: 2,
    locale: 'th-TH'
  },
  IDR: {
    code: 'IDR',
    name: 'Indonesian Rupiah',
    symbol: 'Rp',
    decimalPlaces: 0,
    locale: 'id-ID'
  },
  MYR: {
    code: 'MYR',
    name: 'Malaysian Ringgit',
    symbol: 'RM',
    decimalPlaces: 2,
    locale: 'ms-MY'
  },
  KRW: {
    code: 'KRW',
    name: 'South Korean Won',
    symbol: '₩',
    decimalPlaces: 0,
    locale: 'ko-KR'
  },
  TWD: {
    code: 'TWD',
    name: 'Taiwan Dollar',
    symbol: 'NT$',
    decimalPlaces: 0,
    locale: 'zh-TW'
  },
  VND: {
    code: 'VND',
    name: 'Vietnamese Dong',
    symbol: '₫',
    decimalPlaces: 0,
    locale: 'vi-VN'
  }
}

/**
 * Get currency info for a given currency code
 */
export function getCurrencyInfo(
  currency: SupportedCurrency
): CurrencyInfo | null {
  return CURRENCY_INFO[currency] || null
}

/**
 * Format amount with currency using locale-aware formatting
 */
export function formatCurrencyAmount(
  amount: number,
  currency: SupportedCurrency,
  locale?: string
): string {
  const currencyInfo = getCurrencyInfo(currency)
  const useLocale = locale || currencyInfo?.locale || 'en-US'

  try {
    return new Intl.NumberFormat(useLocale, {
      style: 'currency',
      currency,
      minimumFractionDigits: currencyInfo?.decimalPlaces ?? 2,
      maximumFractionDigits: currencyInfo?.decimalPlaces ?? 2
    }).format(amount)
  } catch (error) {
    // Fallback to simple formatting if Intl fails
    console.error('Currency formatting error:', error)
    return `${currencyInfo?.symbol || currency} ${amount.toFixed(currencyInfo?.decimalPlaces ?? 2)}`
  }
}

/**
 * Detect user's preferred currency from browser locale
 * This is a best-effort guess based on common locale-currency mappings
 */
export function detectCurrencyFromLocale(locale: string): SupportedCurrency {
  const localeLower = locale.toLowerCase()

  // Map common locales to currencies
  const localeMap: Record<string, SupportedCurrency> = {
    'en-us': 'USD',
    'en-gb': 'GBP',
    'en-ca': 'CAD',
    'en-au': 'AUD',
    'en-nz': 'NZD',
    'en-sg': 'SGD',
    'en-in': 'INR',
    'en-za': 'ZAR',
    'en-ph': 'PHP',
    'de-de': 'EUR',
    'de-ch': 'CHF',
    'fr-fr': 'EUR',
    'fr-ca': 'CAD',
    'fr-ch': 'CHF',
    'es-es': 'EUR',
    'es-mx': 'MXN',
    'es-cl': 'CLP',
    'pt-br': 'BRL',
    'ja-jp': 'JPY',
    'zh-cn': 'CNY',
    'zh-tw': 'TWD',
    'zh-hk': 'HKD',
    'ko-kr': 'KRW',
    'sv-se': 'SEK',
    'no-no': 'NOK',
    'da-dk': 'DKK',
    'pl-pl': 'PLN',
    'cs-cz': 'CZK',
    'hu-hu': 'HUF',
    'ro-ro': 'RON',
    'tr-tr': 'TRY',
    'he-il': 'ILS',
    'ar-ae': 'AED',
    'ar-sa': 'SAR',
    'th-th': 'THB',
    'id-id': 'IDR',
    'ms-my': 'MYR',
    'vi-vn': 'VND'
  }

  // Try exact match first
  if (localeMap[localeLower]) {
    return localeMap[localeLower]
  }

  // Try language-only match (e.g., 'en' -> 'USD')
  const language = localeLower.split('-')[0]
  const languageDefaults: Record<string, SupportedCurrency> = {
    en: 'USD',
    de: 'EUR',
    fr: 'EUR',
    es: 'EUR',
    pt: 'BRL',
    ja: 'JPY',
    zh: 'CNY',
    ko: 'KRW',
    sv: 'SEK',
    no: 'NOK',
    da: 'DKK',
    pl: 'PLN',
    cs: 'CZK',
    hu: 'HUF',
    ro: 'RON',
    tr: 'TRY',
    he: 'ILS',
    ar: 'AED',
    th: 'THB',
    id: 'IDR',
    ms: 'MYR',
    vi: 'VND'
  }

  return languageDefaults[language] || 'USD'
}

/**
 * Get list of all supported currencies
 */
export function getSupportedCurrencies(): CurrencyInfo[] {
  return Object.values(CURRENCY_INFO)
}

/**
 * Check if a currency code is supported
 */
export function isSupportedCurrency(
  currency: string
): currency is SupportedCurrency {
  return currency in CURRENCY_INFO
}

/**
 * Get browser locale (client-side only)
 */
export function getBrowserLocale(): string {
  if (typeof window === 'undefined') {
    return 'en-US'
  }

  return (
    navigator.language ||
    (navigator.languages && navigator.languages[0]) ||
    'en-US'
  )
}

/**
 * Get suggested currency based on browser locale
 */
export function getSuggestedCurrency(): SupportedCurrency {
  const locale = getBrowserLocale()
  return detectCurrencyFromLocale(locale)
}
