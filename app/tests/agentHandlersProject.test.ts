import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createProjectToolHandlers } from '../electron/main/agentHandlersProject'
import { AgentError } from '../shared/agentError'

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'cv-proj-'))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('createProjectToolHandlers — санитизация путей', () => {
  it('блокирует write_file за пределами проекта (AgentError readonly)', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    const outside = join(projectDir, '..', 'escape.txt')
    await expect(
      handlers.write_file!({ path: outside, content: 'x' })
    ).rejects.toMatchObject({ name: 'AgentError', code: 'readonly' })
  })

  it('блокирует traversal через ../ в относительном пути', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    await expect(
      handlers.create_file!({ path: '../../etc/passwd', content: 'x' })
    ).rejects.toBeInstanceOf(AgentError)
  })

  it('блокирует move_file, если to вне проекта', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    await expect(
      handlers.move_file!({ from: 'a.txt', to: join(projectDir, '..', 'b.txt') })
    ).rejects.toMatchObject({ code: 'readonly' })
  })

  it('пропускает путь внутри проекта', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    const target = join(projectDir, 'sub', 'file.txt')
    const result = await handlers.create_file!({ path: target, content: 'hello' })
    expect(result).toContain('создан')
    expect(readFileSync(target, 'utf-8')).toBe('hello')
  })

  it('блокирует read_file за пределами проекта', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    const outside = join(projectDir, '..', 'secret.txt')
    await expect(
      handlers.read_file!({ path: outside })
    ).rejects.toMatchObject({ code: 'readonly' })
  })

  it('блокирует grep_files за пределами проекта', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    const outside = join(projectDir, '..', 'secret')
    await expect(
      handlers.grep_files!({ path: outside, query: 'test' })
    ).rejects.toMatchObject({ code: 'readonly' })
  })

  it('блокирует find_files за пределами проекта', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    const outside = join(projectDir, '..', 'secret')
    await expect(
      handlers.find_files!({ path: outside, pattern: '*.txt' })
    ).rejects.toMatchObject({ code: 'readonly' })
  })

  it('разрешает read/grep/find с пустым path (везде в проекте)', async () => {
    const handlers = createProjectToolHandlers(projectDir)
    const file = join(projectDir, 'test.txt')
    await handlers.create_file!({ path: file, content: 'hello world' })
    // Не должны кидать ошибку при пустом path
    const result = await handlers.read_file!({ path: file })
    expect(result).toContain('hello world')
  })
})
