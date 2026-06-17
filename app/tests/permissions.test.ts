import { describe, it, expect } from 'vitest'
import { toolRequiresConfirm } from '../shared/permissions'

describe('toolRequiresConfirm', () => {
  it('bypass — всегда false', () => {
    expect(toolRequiresConfirm('bypass', 'write_file')).toBe(false)
    expect(toolRequiresConfirm('bypass', 'run_command')).toBe(false)
    expect(toolRequiresConfirm('bypass', 'read_file')).toBe(false)
  })

  it('ask — все мутирующие инструменты требуют подтверждения', () => {
    expect(toolRequiresConfirm('ask', 'write_file')).toBe(true)
    expect(toolRequiresConfirm('ask', 'run_command')).toBe(true)
    expect(toolRequiresConfirm('ask', 'create_skill')).toBe(true)
    expect(toolRequiresConfirm('ask', 'delete_file')).toBe(true)
  })

  it('ask — read-only инструменты не требуют подтверждения', () => {
    expect(toolRequiresConfirm('ask', 'read_file')).toBe(false)
    expect(toolRequiresConfirm('ask', 'list_directory')).toBe(false)
    expect(toolRequiresConfirm('ask', 'grep_files')).toBe(false)
    expect(toolRequiresConfirm('ask', 'git_status')).toBe(false)
  })

  it('acceptEdits — правки файлов не требуют подтверждения', () => {
    expect(toolRequiresConfirm('acceptEdits', 'write_file')).toBe(false)
    expect(toolRequiresConfirm('acceptEdits', 'edit_file')).toBe(false)
    expect(toolRequiresConfirm('acceptEdits', 'create_file')).toBe(false)
    expect(toolRequiresConfirm('acceptEdits', 'delete_file')).toBe(false)
  })

  it('acceptEdits — команды и создание модели требуют подтверждения', () => {
    expect(toolRequiresConfirm('acceptEdits', 'run_command')).toBe(true)
    expect(toolRequiresConfirm('acceptEdits', 'run_codeviper_command')).toBe(true)
    expect(toolRequiresConfirm('acceptEdits', 'create_ollama_model')).toBe(true)
  })

  it('acceptEdits — навыки и память не требуют подтверждения', () => {
    expect(toolRequiresConfirm('acceptEdits', 'create_skill')).toBe(false)
    expect(toolRequiresConfirm('acceptEdits', 'remember')).toBe(false)
  })
})
