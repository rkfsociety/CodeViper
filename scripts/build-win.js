import { cpSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const outputDir = join(tmpdir(), 'CodeViper-dist')
const projectRoot = process.cwd()

const result = spawnSync(
  'npx',
  ['electron-builder', '--win', 'portable', `--config.directories.output=${outputDir}`],
  { stdio: 'inherit', shell: true }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

let copied: string | null = null

for (const file of readdirSync(outputDir)) {
  if (!file.endsWith('.exe')) continue
  if (!file.includes('portable')) continue

  const dest = join(projectRoot, 'CodeViper.exe')
  try {
    cpSync(join(outputDir, file), dest, { force: true })
    copied = dest
    break
  } catch {
    const alt = join(projectRoot, 'CodeViper-new.exe')
    cpSync(join(outputDir, file), alt, { force: true })
    copied = alt
    console.warn('CodeViper.exe занят — сохранено как CodeViper-new.exe')
    break
  }
}

if (!copied || !existsSync(copied)) {
  console.error('Не найден portable .exe в', outputDir)
  process.exit(1)
}

console.log('\nГотово:')
console.log(' -', copied)
console.log('\nЗапускай двойным кликом по CodeViper.exe')
