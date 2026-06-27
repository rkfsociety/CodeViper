#!/usr/bin/env node
/**
 * Создаёт обязательные метки GitHub Issues, если их ещё нет.
 * Запуск из корня репозитория (нужен gh auth login):
 *   node scripts/ensure-github-labels.mjs
 *   DRY_RUN=1 node scripts/ensure-github-labels.mjs
 */

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { resolve } from 'path'

/** @type {Array<{ name: string; description: string; color: string }>} */
export const REQUIRED_LABELS = [
  {
    name: 'trace-report',
    description: 'Автоотчёт трейса агента из панели «Трасса»',
    color: '6f42c1'
  }
]

const REPO = process.env.GITHUB_REPOSITORY ?? 'rkfsociety/CodeViper'
const dryRun = process.env.DRY_RUN === '1'

/** @param {string} cmd */
function run(cmd) {
  if (dryRun) {
    console.log(`[dry-run] ${cmd}`)
    return ''
  }
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

/** @returns {Set<string>} */
function listExistingLabels() {
  const out = run(`gh label list --repo ${REPO} --limit 500 --json name`)
  try {
    const rows = JSON.parse(out)
    return new Set(rows.map((r) => r.name))
  } catch {
    const lines = out.split('\n').filter(Boolean)
    return new Set(lines.map((line) => line.split('\t')[0]))
  }
}

function main() {
  const existing = listExistingLabels()
  let created = 0

  for (const label of REQUIRED_LABELS) {
    if (existing.has(label.name)) {
      console.log(`ok: ${label.name}`)
      continue
    }
    const cmd = [
      'gh label create',
      JSON.stringify(label.name),
      '--description',
      JSON.stringify(label.description),
      '--color',
      label.color,
      '--repo',
      REPO
    ].join(' ')
    run(cmd)
    console.log(`created: ${label.name}`)
    created++
  }

  console.log(created > 0 ? `Готово: создано ${created}` : 'Все метки на месте')
}

const scriptPath = fileURLToPath(import.meta.url)
if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) {
  main()
}
