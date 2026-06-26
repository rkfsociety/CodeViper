#!/usr/bin/env node
/**
 * После зелёного CI на master: если изменилась оболочка — тег vX.Y.Z и push.
 * Runtime-only коммиты пропускаются (блок 0).
 *
 * Env:
 *   DRY_RUN=1 — только вывод, без commit/tag/push
 *   FORCE_SHELL_RELEASE=1 — игнорировать классификатор (ручной форс)
 *
 * Commit message [skip-release] — пропуск job (см. ci.yml).
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { classifyChangedFiles } from './shell-release-paths.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const pkgPath = join(root, 'app', 'package.json')
const dryRun = process.env.DRY_RUN === '1'
const force = process.env.FORCE_SHELL_RELEASE === '1'

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', cwd: root, stdio: opts.silent ? 'pipe' : 'inherit', ...opts })
}

function runQuiet(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function parseSemver(v) {
  const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

function lastReleaseTag() {
  const tags = runQuiet('git tag --list "v*" --sort=-version:refname')
  const lines = tags.split('\n').filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
  return lines[0] || ''
}

function changedFilesSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const out = runQuiet(`git diff --name-only ${range}`)
  return out ? out.split('\n').filter(Boolean) : []
}

/** package.json: только version / runtime deps → не shell; electron/build → shell */
function packageJsonNeedsShell(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD'
  const diff = runQuiet(`git diff ${range} -- app/package.json`)
  if (!diff) return false

  const shellKeys =
    /"electron"|"electron-builder"|"electron-updater"|"electron-vite"|"build"|"extraResources"|"nsis"|"publish"/
  const lines = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  const added = lines.map((l) => l.slice(1)).join('\n')

  if (shellKeys.test(added)) return true

  // Только version без electron-цепочки — не повод для авто-релиза (версию ставим при релизе)
  const nonVersion = lines.filter((l) => !/^\+\s*"version"/.test(l) && !/^\+\s*}/.test(l))
  return nonVersion.some((l) => shellKeys.test(l))
}

function bumpPatch(version) {
  const [maj, min, pat] = version.split('.').map(Number)
  return `${maj}.${min}.${pat + 1}`
}

function writeVersion(version) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

function main() {
  const tag = lastReleaseTag()
  const files = changedFilesSince(tag)
  let { needed, shellFiles, ignoredFiles, runtimeFiles } = classifyChangedFiles(files)

  // package.json отдельно: не всегда shell
  const pkgInShell = shellFiles.filter((f) => f === 'app/package.json')
  if (pkgInShell.length && !packageJsonNeedsShell(tag)) {
    shellFiles = shellFiles.filter((f) => f !== 'app/package.json')
    runtimeFiles.push('app/package.json')
    needed = shellFiles.length > 0
  }

  if (force) needed = true

  console.log(JSON.stringify({ tag: tag || null, needed, shellFiles, ignoredFiles, runtimeFiles }, null, 2))

  if (!needed) {
    console.log('→ Релиз оболочки не нужен (достаточно live runtime).')
    return
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  let version = pkg.version
  const tagVersion = tag ? tag.replace(/^v/, '') : '0.0.0'

  if (tag && compareSemver(version, tagVersion) <= 0) {
    version = bumpPatch(tagVersion)
    console.log(`→ Версия не выше последнего тега: bump ${tagVersion} → ${version}`)
    if (!dryRun) writeVersion(version)
  } else if (tag && runQuiet(`git tag --list "v${version}"`)) {
    version = bumpPatch(version)
    console.log(`→ Тег v${pkg.version} уже существует: bump → ${version}`)
    if (!dryRun) writeVersion(version)
  }

  const newTag = `v${version}`

  if (dryRun) {
    console.log(`DRY_RUN: создали бы тег ${newTag}`)
    return
  }

  if (versionChanged) {
    run('git add app/package.json')
    run(`git commit -m "chore(release): bump to ${version} [skip-release]"`)
    run('git push origin HEAD')
  }

  if (!runQuiet(`git tag --list ${newTag}`)) {
    run(`git tag ${newTag}`)
  }
  run(`git push origin ${newTag}`)

  console.log(`✓ Релиз запущен: тег ${newTag} → release.yml`)
}

main()
