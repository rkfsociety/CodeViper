import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  detectFormatProjectCommand,
  formatFormatProjectResult
} from '../electron/main/formatProject'

describe('formatProject', () => {
  it('выбирает npm run format при скрипте в package.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-fmt-'))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { format: 'prettier --write .' } }),
      'utf8'
    )
    const plan = await detectFormatProjectCommand(dir, 'auto')
    expect('error' in plan).toBe(false)
    if ('error' in plan) return
    expect(plan.formatter).toBe('npm-format')
    expect(plan.command).toBe('npm run format')
  })

  it('выбирает prettier при devDependency', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-fmt-'))
    await writeFile(
      join(dir, 'package.json'),
      JSON.stringify({ devDependencies: { prettier: '^3.0.0' } }),
      'utf8'
    )
    const plan = await detectFormatProjectCommand(dir, 'auto')
    expect('error' in plan).toBe(false)
    if ('error' in plan) return
    expect(plan.formatter).toBe('prettier')
    expect(plan.command).toContain('prettier --write')
  })

  it('выбирает black для Python-проекта', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-fmt-'))
    await writeFile(join(dir, 'pyproject.toml'), '[tool.black]\n', 'utf8')
    const plan = await detectFormatProjectCommand(dir, 'auto')
    expect('error' in plan).toBe(false)
    if ('error' in plan) return
    expect(plan.formatter).toBe('black')
    expect(plan.command).toBe('black .')
  })

  it('уважает явный formatter', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cv-fmt-'))
    await writeFile(join(dir, 'pyproject.toml'), '', 'utf8')
    const plan = await detectFormatProjectCommand(dir, 'prettier', 'src')
    expect('error' in plan).toBe(false)
    if ('error' in plan) return
    expect(plan.command).toBe('npx prettier --write "src"')
  })

  it('форматирует успешный результат', () => {
    const text = formatFormatProjectResult('prettier', 'npx prettier --write .', 'done', '', 0)
    expect(text).toContain('Форматирование прошло')
    expect(text).toContain('done')
  })

  it('форматирует ошибку', () => {
    const text = formatFormatProjectResult('black', 'black .', '', 'command not found', 127)
    expect(text).toContain('Ошибка форматирования')
    expect(text).toContain('command not found')
  })
})
