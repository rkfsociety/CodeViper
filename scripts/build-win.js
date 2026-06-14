import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'

const outputDir = join(tmpdir(), 'CodeViper-dist')
const projectDist = join(process.cwd(), 'dist-electron')

const result = spawnSync(
  'npx',
  ['electron-builder', '--win', `--config.directories.output=${outputDir}`],
  { stdio: 'inherit', shell: true }
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

mkdirSync(projectDist, { recursive: true })

for (const file of readdirSync(outputDir)) {
  if (file.endsWith('.exe')) {
    cpSync(join(outputDir, file), join(projectDist, file), { force: true })
  }
}

const copied = readdirSync(projectDist).filter((f) => f.endsWith('.exe'))
if (!copied.length) {
  console.error('Не найдены .exe в', outputDir)
  process.exit(1)
}

console.log('\nГотово:')
for (const file of copied) {
  console.log(' -', join(projectDist, file))
}

if (!existsSync(join(projectDist, copied[0]!))) {
  process.exit(1)
}
