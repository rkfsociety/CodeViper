import { z } from 'zod'

const UpdateChannelStatusSchema = z.object({
  checked: z.boolean(),
  status: z.enum(['upToDate', 'available', 'downloading', 'ready', 'skipped', 'error']),
  version: z.string().optional(),
  commitsBehind: z.number().int().nonnegative().optional(),
  localHead: z.string().optional(),
  error: z.string().optional()
})

export const CheckForUpdatesResultSchema = z.object({
  ok: z.boolean(),
  currentVersion: z.string(),
  packaged: z.boolean(),
  release: UpdateChannelStatusSchema,
  runtime: UpdateChannelStatusSchema,
  message: z.string()
})

export type CheckForUpdatesResult = z.infer<typeof CheckForUpdatesResultSchema>

export function formatCheckForUpdatesMessage(result: CheckForUpdatesResult): string {
  const parts: string[] = []

  if (result.release.checked) {
    switch (result.release.status) {
      case 'ready':
        parts.push(
          result.release.version
            ? `Установщик v${result.release.version} скачан — перезапустите для установки`
            : 'Установщик скачан — перезапустите для установки'
        )
        break
      case 'downloading':
        parts.push(
          result.release.version
            ? `Загружается установщик v${result.release.version}…`
            : 'Загружается установщик…'
        )
        break
      case 'available':
        parts.push(
          result.release.version
            ? `Доступен установщик v${result.release.version}`
            : 'Доступно обновление установщика'
        )
        break
      case 'upToDate':
        parts.push(`Установщик v${result.currentVersion} актуален`)
        break
      case 'error':
        parts.push(result.release.error ?? 'Не удалось проверить установщик')
        break
      default:
        break
    }
  }

  if (result.runtime.checked) {
    switch (result.runtime.status) {
      case 'available':
        parts.push(
          result.packaged
            ? result.runtime.commitsBehind === 1
              ? 'На GitHub 1 новый коммит runtime'
              : `На GitHub ${result.runtime.commitsBehind ?? 'новые'} коммит(ов) runtime`
            : result.runtime.commitsBehind === 1
              ? 'На GitHub 1 новый коммит исходников'
              : `На GitHub ${result.runtime.commitsBehind ?? 'новые'} коммит(ов) исходников`
        )
        break
      case 'upToDate':
        parts.push(result.packaged ? 'Agent runtime актуален' : 'Исходники актуальны')
        break
      case 'error':
        parts.push(result.runtime.error ?? 'Не удалось проверить runtime')
        break
      default:
        break
    }
  }

  if (parts.length === 0) {
    if (!result.packaged) {
      return 'В dev-режиме проверяются только исходники на GitHub'
    }
    return 'Обновлений не найдено'
  }

  return parts.join('. ')
}
