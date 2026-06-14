import { describe, it, expect } from 'vitest'
import { agentStatusLabel } from '../src/components/AgentStatusBar'

describe('agentStatusLabel', () => {
  it('показывает фазу размышления', () => {
    expect(agentStatusLabel('thinking', undefined, 'qwen2.5-coder:7b')).toBe(
      'qwen2.5-coder думает…'
    )
  })

  it('показывает фазу записи', () => {
    expect(agentStatusLabel('writing')).toBe('Пишу ответ…')
  })

  it('переводит имя инструмента', () => {
    expect(agentStatusLabel('tool', 'list_directory')).toBe('Смотрю структуру проекта')
  })

  it('показывает размер очереди', () => {
    expect(agentStatusLabel('thinking', undefined, 'qwen2.5-coder:7b', 2)).toBe(
      'qwen2.5-coder думает… · в очереди 2'
    )
  })
})
