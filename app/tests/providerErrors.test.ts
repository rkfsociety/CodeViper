import { describe, it, expect } from 'vitest'
import {
  formatProviderHttpError,
  isProviderBillingError,
  isProviderFallbackRetryableError,
  ProviderBillingError,
  throwProviderHttpError
} from '../shared/providerErrors'

describe('providerErrors', () => {
  it('402 и insufficient balance — billing', () => {
    expect(isProviderBillingError(402, 'Insufficient Balance')).toBe(true)
    const msg = formatProviderHttpError(402, 'Insufficient Balance')
    expect(msg).toContain('Недостаточно средств')
    expect(msg).toContain('402')
  })

  it('throwProviderHttpError бросает ProviderBillingError для 402', () => {
    expect(() => throwProviderHttpError(402, 'Insufficient Balance')).toThrow(ProviderBillingError)
  })

  it('401 без billing-текста — обычная ошибка', () => {
    expect(isProviderBillingError(401, 'Invalid API key')).toBe(false)
    expect(() => throwProviderHttpError(401, 'Invalid API key')).toThrow(Error)
    expect(() => throwProviderHttpError(401, 'Invalid API key')).not.toThrow(ProviderBillingError)
  })

  it('isProviderFallbackRetryableError: 429 и 5xx — да, 401 и billing — нет', () => {
    expect(isProviderFallbackRetryableError(new Error('OpenAI API error 429: rate limit'))).toBe(
      true
    )
    expect(isProviderFallbackRetryableError(new Error('OpenAI API error 503: unavailable'))).toBe(
      true
    )
    expect(isProviderFallbackRetryableError(new Error('OpenAI API error 401: bad key'))).toBe(false)
    expect(isProviderFallbackRetryableError(new ProviderBillingError('HTTP 402'))).toBe(false)
  })
})
