import { describe, it, expect } from 'vitest'
import {
  formatProviderHttpError,
  isProviderBillingError,
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
})
