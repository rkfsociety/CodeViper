#!/usr/bin/env node
/**
 * Скачивает portable Node.js LTS с nodejs.org в app/resources/node/.
 * Пропускает загрузку, если нужная версия уже установлена.
 *
 * Запуск из app/: npm run setup-node
 */

import { execFileSync } from 'child_process'
import { createWriteStream, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { pipeline } from 'stream/promises'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const NODE_DIR = join(ROOT, 'app', 'resources', 'node')
const VERSION_FILE = join(NODE_DIR, '.node-version')

function getNodePlatform() {
  switch (process.platform) {
    case 'win32':
      return 'win'
    case 'darwin':
      return 'darwin'
    case 'linux':
      return 'linux'
    default:
      throw new Error(`Неподдерживаемая платформа: ${process.platform}`)
  }
}

function getNodeArch() {
  switch (process.arch) {
    case 'x64':
      return 'x64'
    case 'arm64':
      return 'arm64'
    default:
      throw new Error(`Неподдерживаемая архитектура: ${process.arch}`)
  }
}

function normalizeVersion(version) {
  const trimmed = version.trim()
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`
}

function getArchiveName(version, platform, arch) {
  const ver = normalizeVersion(version)
  if (platform === 'win') {
    return `node-${ver}-win-${arch}.zip`
  }
  if (platform === 'darwin') {
    return `node-${ver}-darwin-${arch}.tar.gz`
  }
  return `node-${ver}-linux-${arch}.tar.xz`
}

function hasNodeBinary(platform) {
  if (platform === 'win') {
    return existsSync(join(NODE_DIR, 'node.exe'))
  }
  return existsSync(join(NODE_DIR, 'bin', 'node'))
}

function getInstalledVersion() {
  if (!existsSync(VERSION_FILE)) {
    return null
  }
  return readFileSync(VERSION_FILE, 'utf8').trim()
}

async function getLatestLtsVersion() {
  try {
    const res = await fetch('https://nodejs.org/dist/index.json')
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const versions = await res.json()
    const lts = versions.find((entry) => entry.lts !== false)
    if (!lts?.version) {
      throw new Error('LTS-версия не найдена в index.json')
    }
    return normalizeVersion(lts.version)
  } catch (error) {
    console.warn(`index.json недоступен (${error.message}), пробую latest-lts-version`)
    const res = await fetch('https://nodejs.org/dist/latest-lts-version/')
    if (!res.ok) {
      throw new Error(`Не удалось получить LTS-версию: HTTP ${res.status}`)
    }
    return normalizeVersion(await res.text())
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Ошибка загрузки ${url}: HTTP ${res.status}`)
  }
  if (!res.body) {
    throw new Error(`Пустой ответ при загрузке ${url}`)
  }
  await pipeline(res.body, createWriteStream(dest))
}

function extractArchive(archivePath, destDir) {
  execFileSync('tar', ['-xf', archivePath, '-C', destDir], { stdio: 'inherit' })
}

function installExtractedNode(extractedDir, version) {
  if (existsSync(NODE_DIR)) {
    rmSync(NODE_DIR, { recursive: true, force: true })
  }
  mkdirSync(NODE_DIR, { recursive: true })
  cpSync(extractedDir, NODE_DIR, { recursive: true })
  writeFileSync(VERSION_FILE, `${version}\n`, 'utf8')
}

async function main() {
  const platform = getNodePlatform()
  const arch = getNodeArch()
  const latestVersion = await getLatestLtsVersion()
  const installedVersion = getInstalledVersion()

  if (installedVersion === latestVersion && hasNodeBinary(platform)) {
    console.log(`Node.js ${latestVersion} (${platform}-${arch}) уже установлен в app/resources/node/`)
    return
  }

  const archiveName = getArchiveName(latestVersion, platform, arch)
  const downloadUrl = `https://nodejs.org/dist/${latestVersion}/${archiveName}`
  const extractedFolderName = archiveName.replace(/\.(zip|tar\.gz|tar\.xz)$/, '')

  console.log(`Скачиваю Node.js LTS ${latestVersion} (${platform}-${arch})...`)
  console.log(downloadUrl)

  const tempDir = mkdtempSync(join(tmpdir(), 'codeviper-node-'))
  const archivePath = join(tempDir, archiveName)

  try {
    await downloadFile(downloadUrl, archivePath)
    extractArchive(archivePath, tempDir)

    const extractedDir = join(tempDir, extractedFolderName)
    if (!existsSync(extractedDir)) {
      const entries = readdirSync(tempDir).filter((name) => name.startsWith('node-'))
      if (entries.length !== 1) {
        throw new Error(`Не найдена папка распаковки: ${extractedFolderName}`)
      }
      installExtractedNode(join(tempDir, entries[0]), latestVersion)
    } else {
      installExtractedNode(extractedDir, latestVersion)
    }

    console.log(`Node.js ${latestVersion} установлен в app/resources/node/`)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
