import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  agentStatusLabel,
  formatIndexProgressChip,
  formatP2pOfflineLabel
} from '../src/components/AgentStatusBar'
import { isIndexProgressLabel } from '../electron/main/progress'

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

  it('показывает метрики генерации', () => {
    expect(
      agentStatusLabel('thinking', undefined, 'qwen2.5-coder:7b', 0, {
        evalCount: 42,
        evalDurationSec: 2,
        tokensPerSec: 21
      })
    ).toBe('qwen2.5-coder думает… · 21.0 tok/s · 2.0с')
  })
})

describe('formatIndexProgressChip', () => {
  it('форматирует чип индексации', () => {
    expect(formatIndexProgressChip(42)).toBe('Индекс 42%')
    expect(formatIndexProgressChip(0)).toBe('Индекс 0%')
  })
})

describe('formatP2pOfflineLabel', () => {
  it('возвращает текст чипа offline', () => {
    expect(formatP2pOfflineLabel()).toBe('P2P offline')
  })
})

describe('isIndexProgressLabel', () => {
  it('распознаёт метки индексации', () => {
    expect(isIndexProgressLabel('Индексация: сканирование…')).toBe(true)
    expect(isIndexProgressLabel('Поиск по коду: foo')).toBe(false)
  })
})
