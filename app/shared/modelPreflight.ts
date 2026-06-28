/** Ошибка preflight-проверки модели перед прогоном агента. */
export class ModelPreflightError extends Error {
  readonly code = 'MODEL_PREFLIGHT'

  constructor(
    message: string,
    readonly httpStatus?: number
  ) {
    super(message)
    this.name = 'ModelPreflightError'
  }
}

export function formatListModelsHttpError(
  status: number,
  providerLabel: string,
  model: string
): string {
  if (status === 404) {
    return `Модель «${model}» или endpoint ListModels не найден (HTTP 404). Проверьте имя модели и настройки провайдера ${providerLabel}.`
  }
  if (status === 401 || status === 403) {
    return `Ошибка авторизации провайдера ${providerLabel} (HTTP ${status}). Проверьте API-ключ.`
  }
  return `Preflight ListModels ${providerLabel}: HTTP ${status}. Модель «${model}».`
}
