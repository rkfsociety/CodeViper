#!/usr/bin/env node
/**
 * Удаление старых GitHub Releases по шаблону тега.
 *
 * Usage:
 *   node scripts/prune-github-releases.mjs --tag-pattern '^v[0-9]' --keep 5 [--exclude v0.3.6]
 *   node scripts/prune-github-releases.mjs --tag-pattern '^nightly-' --keep 0
 *   DRY_RUN=1 node scripts/prune-github-releases.mjs ...
 */

import { execSync } from 'child_process'

export const DEFAULT_STABLE_KEEP = 5

/** @param {string} tag */
export function parseSemverTag(tag) {
  const m = tag.match(/^v(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** @param {string} a @param {string} b */
export function compareSemverTagsDesc(a, b) {
  const pa = parseSemverTag(a)
  const pb = parseSemverTag(b)
  if (pa && pb) {
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pb[i] - pa[i]
    }
    return 0
  }
  if (pa) return -1
  if (pb) return 1
  return b.localeCompare(a)
}

/**
 * @param {Array<{ tagName: string }>} releases
 * @param {RegExp} tagPattern
 * @param {number} keep
 * @param {string | undefined} exclude
 */
export function selectReleasesToDelete(releases, tagPattern, keep, exclude) {
  const filtered = releases
    .map((r) => r.tagName)
    .filter((tag) => tagPattern.test(tag) && tag !== exclude)
    .sort(compareSemverTagsDesc)

  if (keep <= 0) return filtered
  return filtered.slice(keep)
}

function parseArgs(argv) {
  let tagPattern = /^v[0-9]/
  let keep = DEFAULT_STABLE_KEEP
  let exclude
  let repo = process.env.GITHUB_REPOSITORY

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--tag-pattern') {
      tagPattern = new RegExp(argv[++i])
    } else if (arg === '--keep') {
      keep = Number(argv[++i])
    } else if (arg === '--exclude') {
      exclude = argv[++i]
    } else if (arg === '--repo') {
      repo = argv[++i]
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/prune-github-releases.mjs [options]

Options:
  --tag-pattern REGEX   Шаблон тега (default: ^v[0-9])
  --keep N              Сколько последних релизов оставить (default: ${DEFAULT_STABLE_KEEP}, 0 = удалить все)
  --exclude TAG         Тег, который нельзя удалять
  --repo OWNER/REPO     Репозиторий (default: GITHUB_REPOSITORY)
`)
      process.exit(0)
    }
  }

  if (!repo) {
    console.error('❌ Укажите --repo или задайте GITHUB_REPOSITORY')
    process.exit(1)
  }
  if (!Number.isFinite(keep) || keep < 0) {
    console.error('❌ --keep должен быть неотрицательным числом')
    process.exit(1)
  }

  return { tagPattern, keep, exclude, repo }
}

function listReleases(repo) {
  const raw = execSync(
    `gh release list --repo ${repo} --limit 500 --json tagName`,
    { encoding: 'utf8' }
  )
  return JSON.parse(raw)
}

function deleteRelease(repo, tag, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] Удалить: ${tag}`)
    return
  }
  execSync(`gh release delete "${tag}" --repo ${repo} --yes --cleanup-tag`, {
    stdio: 'inherit'
  })
}

export function pruneGithubReleases(options) {
  const { tagPattern, keep, exclude, repo, dryRun = false } = options
  const releases = listReleases(repo)
  const toDelete = selectReleasesToDelete(releases, tagPattern, keep, exclude)

  if (toDelete.length === 0) {
    console.log(`✓ Нет релизов для удаления (${tagPattern}, keep=${keep})`)
    return { deleted: [], kept: releases.filter((r) => tagPattern.test(r.tagName)).length }
  }

  console.log(`Удаляем ${toDelete.length} релиз(ов), оставляем ${keep}: ${toDelete.join(', ')}`)
  for (const tag of toDelete) {
    try {
      deleteRelease(repo, tag, dryRun)
    } catch (err) {
      console.warn(`⚠️ Не удалось удалить ${tag}: ${err instanceof Error ? err.message : err}`)
    }
  }

  return { deleted: toDelete }
}

function main() {
  const dryRun = process.env.DRY_RUN === '1'
  const options = parseArgs(process.argv)
  pruneGithubReleases({ ...options, dryRun })
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('prune-github-releases.mjs') ||
    process.argv[1].endsWith('prune-github-releases'))

if (isMain) {
  main()
}
