import { fileURLToPath } from 'url'
import { dirname } from 'path'

/** Тестируемый резолвер: __dirname (asar/dev) или import.meta.url (ESM live runtime). */
export function resolveElectronMainDir(
  dirnameValue: string | undefined,
  importMetaUrl: string
): string {
  if (dirnameValue) return dirnameValue
  return dirname(fileURLToPath(importMetaUrl))
}

/**
 * Директория out/main для путей к *.js воркерам.
 * В live runtime (ESM-бандл из git-клона) глобальный __dirname недоступен.
 */
export function getElectronMainDir(): string {
  return resolveElectronMainDir(
    typeof __dirname !== 'undefined' ? __dirname : undefined,
    import.meta.url
  )
}
