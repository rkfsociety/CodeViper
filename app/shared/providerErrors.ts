/** HTTP-ошибки провайдера моделей: биллинг, понятные сообщения пользователю. */

export class ProviderBillingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderBillingError'
  }
}

const BILLING_DETAIL_RE =
  /insufficient balance|insufficient funds|payment required|quota exceeded|billing|credit balance/i

/** HTTP 402 или текст про баланс/оплату — не retry и не circuit breaker. */
export function isProviderBillingError(status: number, detail: string): boolean {
  if (status === 402) return true
  return BILLING_DETAIL_RE.test(detail)
}

export function formatProviderHttpError(status: number, detail: string): string {
  if (isProviderBillingError(status, detail)) {
    return `Недостаточно средств на балансе API (HTTP ${status}). Пополните баланс провайдера или смените модель в Настройки → Модель. Детали: ${detail}`
  }
  if (status === 401) {
    return `Неверный или просроченный API-ключ (HTTP 401). Проверьте ключ в Настройки → Модель. Детали: ${detail}`
  }
  return `OpenAI API error ${status}: ${detail}`
}

/** Бросает ProviderBillingError для ошибок биллинга; иначе обычный Error. */
export function throwProviderHttpError(status: number, detail: string): never {
  const message = formatProviderHttpError(status, detail)
  if (isProviderBillingError(status, detail)) {
    throw new ProviderBillingError(message)
  }
  throw new Error(message)
}
