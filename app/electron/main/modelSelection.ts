import type { SystemCapabilities } from './systemStats'

export interface ModelCapabilities {
  name: string
  sizeGB: number
  contextLength: number
  parameterSize: string
  isSupported: boolean
  reason?: string // причина если не поддерживается
  recommendedFor?: string // на каком устройстве рекомендуется
}

/**
 * Определить требуемую RAM для модели на основе размера и контекста.
 * Формула: modelSize * 1.5 (для активирования) + contextSize * 2MB на 1k токенов
 */
function estimateRequiredRAM(modelSizeGB: number, contextLength: number): number {
  const modelRAM = modelSizeGB * 1.5 // памяти для активирования модели + буферы
  const contextRAM = (contextLength / 1024) * 2 // ~2MB на 1k токенов
  return modelRAM + contextRAM
}

/**
 * Проверить может ли система потянуть модель
 */
export function canSystemHandleModel(
  modelSizeGB: number,
  contextLength: number,
  systemCapabilities: SystemCapabilities
): boolean {
  // Оставляем 20% памяти для ОС и других приложений
  const availableRAM = systemCapabilities.ramGB * 0.8

  if (contextLength > 32000 && systemCapabilities.ramGB < 16) {
    // Большой контекст требует много памяти
    return false
  }

  const requiredRAM = estimateRequiredRAM(modelSizeGB, Math.min(contextLength, 4096))
  return requiredRAM < availableRAM
}

/**
 * Обогатить список моделей информацией о совместимости
 */
export function enrichModelCapabilities(
  models: Array<{
    name: string
    size: number
    details?: { parameter_size?: string; context_length?: number }
  }>,
  systemCapabilities: SystemCapabilities
): ModelCapabilities[] {
  return models.map((model) => {
    const sizeGB = model.size / (1024 * 1024 * 1024)
    const contextLength = model.details?.context_length ?? 2048
    const isSupported = canSystemHandleModel(sizeGB, contextLength, systemCapabilities)

    let reason: string | undefined
    if (contextLength > 32000 && systemCapabilities.ramGB < 16) {
      reason = `Контекст ${contextLength}k требует ≥16GB RAM (у вас ${systemCapabilities.ramGB}GB)`
    } else if (!isSupported) {
      const required = estimateRequiredRAM(sizeGB, Math.min(contextLength, 4096))
      reason = `Требуется ${required.toFixed(1)}GB (доступно ${(systemCapabilities.ramGB * 0.8).toFixed(1)}GB)`
    }

    let recommendedFor: string | undefined
    if (systemCapabilities.ramGB >= 32) {
      recommendedFor = 'Workstation (32GB+)'
    } else if (systemCapabilities.ramGB >= 16) {
      recommendedFor = 'High-end PC (16GB)'
    } else if (systemCapabilities.ramGB >= 8) {
      recommendedFor = 'Mid-range PC (8GB)'
    } else {
      recommendedFor = 'Low-end PC (<8GB)'
    }

    return {
      name: model.name,
      sizeGB: Math.round(sizeGB * 10) / 10,
      contextLength,
      parameterSize: model.details?.parameter_size ?? 'unknown',
      isSupported,
      reason,
      recommendedFor
    }
  })
}
