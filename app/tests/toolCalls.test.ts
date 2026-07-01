import { describe, it, expect } from 'vitest'
import {
  extractEmbeddedToolCalls,
  looksLikeEmbeddedToolCall,
  looksLikePartialToolCallStream,
  sanitizeAssistantContent,
  visibleAssistantContent
} from '../shared/toolCalls'

describe('extractEmbeddedToolCalls', () => {
  it('парсит JSON tool call без markdown', () => {
    const raw = '{"name": "list_directory", "arguments": {}}'
    expect(extractEmbeddedToolCalls(raw)).toEqual({
      content: '',
      toolCalls: [{ name: 'list_directory', arguments: {} }]
    })
  })

  it('парсит tool call в markdown-блоке', () => {
    const raw = '```json\n{"name": "read_file", "arguments": {"path": "/a.ts"}}\n```'
    expect(extractEmbeddedToolCalls(raw)).toEqual({
      content: '',
      toolCalls: [{ name: 'read_file', arguments: { path: '/a.ts' } }]
    })
  })

  it('оставляет обычный текст', () => {
    const raw = 'Готово, файл обновлён.'
    expect(extractEmbeddedToolCalls(raw)).toEqual({
      content: raw,
      toolCalls: []
    })
  })

  it('игнорирует JSON с неизвестным инструментом', () => {
    const raw = '{"name": "unknown_tool", "arguments": {}}'
    expect(extractEmbeddedToolCalls(raw)).toEqual({
      content: raw,
      toolCalls: []
    })
  })

  it('парсит tool_response с вложенными arguments', () => {
    const raw =
      'Начну с пункта 1.\ntool_response {"name": "read_file", "arguments": {"path": "app/electron/main/agent.ts"}}'
    expect(extractEmbeddedToolCalls(raw)).toEqual({
      content: 'Начну с пункта 1.',
      toolCalls: [
        {
          name: 'read_file',
          arguments: { path: 'app/electron/main/agent.ts' }
        }
      ]
    })
  })

  it('парсит JSON tool call после prose (qwen text-based)', () => {
    const raw =
      'Сначала прочитаю agent.ts.\n\n{"name": "read_file", "arguments": {"path": "app/electron/main/agent.ts"}}'
    expect(extractEmbeddedToolCalls(raw)).toEqual({
      content: 'Сначала прочитаю agent.ts.',
      toolCalls: [{ name: 'read_file', arguments: { path: 'app/electron/main/agent.ts' } }]
    })
  })

  it('парсит несколько JSON tool calls с ведущей } (обрыв предыдущего стрима qwen)', () => {
    const raw =
      '}\n{"name": "read_file", "arguments": {"path": "app/electron/main/modelRuntime.ts"}}\n{"name": "read_file", "arguments": {"path": "app/src/components/SettingsModal/ModelTab.tsx"}}\n{"name": "read_file", "arguments": {"path": "app/tests/providers.integration.test.ts"}}'
    expect(extractEmbeddedToolCalls(raw)).toEqual({
      content: '',
      toolCalls: [
        { name: 'read_file', arguments: { path: 'app/electron/main/modelRuntime.ts' } },
        {
          name: 'read_file',
          arguments: { path: 'app/src/components/SettingsModal/ModelTab.tsx' }
        },
        {
          name: 'read_file',
          arguments: { path: 'app/tests/providers.integration.test.ts' }
        }
      ]
    })
  })
})

describe('looksLikeEmbeddedToolCall', () => {
  it('распознаёт сырой JSON tool call', () => {
    expect(looksLikeEmbeddedToolCall('{"name": "list_directory", "arguments": {}}')).toBe(true)
  })

  it('не помечает обычный ответ', () => {
    expect(looksLikeEmbeddedToolCall('Сейчас посмотрю структуру проекта.')).toBe(false)
  })
})

describe('looksLikePartialToolCallStream', () => {
  it('распознаёт незавершённый JSON tool call', () => {
    expect(
      looksLikePartialToolCallStream('{"name": "edit_file", "arguments": {"path": "a.ts"')
    ).toBe(true)
  })

  it('распознаёт незакрытый ```json блок', () => {
    expect(
      looksLikePartialToolCallStream('```json\n{"name": "read_file", "arguments": {"path": "x"')
    ).toBe(true)
  })

  it('не помечает обычный ответ', () => {
    expect(looksLikePartialToolCallStream('Сейчас посмотрю структуру проекта.')).toBe(false)
  })
})

describe('visibleAssistantContent', () => {
  it('при стриме скрывает незавершённый tool call', () => {
    expect(
      visibleAssistantContent('{"name": "edit_file", "arguments": {"path": "a.ts"', true)
    ).toBe('')
  })

  it('при стриме оставляет prose до JSON', () => {
    expect(
      visibleAssistantContent(
        'Сначала прочитаю файл.\n{"name": "read_file", "arguments": {"path": "a.ts"',
        true
      )
    ).toBe('Сначала прочитаю файл.')
  })
})

describe('sanitizeAssistantContent', () => {
  it('убирает битый префикс {"name', () => {
    expect(sanitizeAssistantContent('{"nameКонечно! Я изучил проект.')).toBe(
      'Конечно! Я изучил проект.'
    )
  })

  it('разворачивает prose из ```json блока', () => {
    expect(sanitizeAssistantContent('```json\nКонечно! Вот обзор проекта.\n```')).toBe(
      'Конечно! Вот обзор проекта.'
    )
  })

  it('убирает валидный tool call JSON', () => {
    expect(sanitizeAssistantContent('{"name": "list_directory", "arguments": {}}')).toBe('')
  })

  it('убирает незавершённый tool call JSON', () => {
    expect(sanitizeAssistantContent('{"name": "edit_file", "arguments": {"path": "a.ts"')).toBe('')
  })
})
