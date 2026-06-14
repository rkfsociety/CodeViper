import { cpSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const outputDir = join(tmpdir(), 'CodeViper-dist')
const projectRoot = process.cwd()

const result = spawnSync(
  'npx',
  ['electron-builder', '--win', `--config.directories.output=${outputDir}`],
  { stdio: 'inherit', shell: true }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const copied = []

for (const file of readdirSync(outputDir)) {
  if (!file.endsWith('.exe')) continue

  let destName = file
  if (file.includes('portable')) destName = 'CodeViper.exe'
  else if (file.includes('Setup')) destName = 'CodeViper-Setup.exe'

  const dest = join(projectRoot, destName)
  try {
    cpSync(join(outputDir, file), dest, { force: true })
    copied.push(dest)
  } catch (error) {
    if (destName === 'CodeViper.exe') {
      const alt = join(projectRoot, 'CodeViper-new.exe')
      cpSync(join(outputDir, file), alt, { force: true })
      copied.push(alt)
      console.warn('CodeViper.exe занят — сохранено как CodeViper-new.exe')
    } else {
      throw error
    }
  }
}

if (!copied.length) {
  console.error('Не найдены .exe в', outputDir)
  process.exit(1)
}

console.log('\nГотово (корень проекта):')
for (const file of copied) {
  console.log(' -', file)
}

if (!existsSync(copied[0])) {
  process.exit(1)
}
