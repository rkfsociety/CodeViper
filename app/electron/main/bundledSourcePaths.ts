import { app } from 'electron'
import { join } from 'path'
import { BUNDLED_SOURCE_APP_DIR_NAME, BUNDLED_SOURCE_DIR_NAME } from '../../shared/constants'

export function getBundledSourceRoot(): string {
  return join(app.getPath('userData'), BUNDLED_SOURCE_DIR_NAME)
}

export function getBundledSourceAppRoot(): string {
  return join(getBundledSourceRoot(), BUNDLED_SOURCE_APP_DIR_NAME)
}
