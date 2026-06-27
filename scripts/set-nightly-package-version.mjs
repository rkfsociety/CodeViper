#!/usr/bin/env node
/**
 * Подмена app/package.json version для nightly-сборки.
 * Тег nightly-2026.06.27 → version 2026.06.27 + electron-builder tagNamePrefix nightly-
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const tag = process.env.NIGHTLY_TAG?.trim()
if (!tag?.startsWith('nightly-')) {
  console.error('NIGHTLY_TAG обязателен (например nightly-2026.06.27)')
  process.exit(1)
}

const version = tag.slice('nightly-'.length)
if (!/^\d{4}\.\d{2}\.\d{2}$/.test(version)) {
  console.error(`Неверный формат тега: ${tag} (ожидается nightly-YYYY.MM.DD)`)
  process.exit(1)
}

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'app', 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.version = version
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
console.log(`package.json version → ${version} (тег ${tag})`)
