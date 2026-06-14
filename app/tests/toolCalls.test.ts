import { describe, it, expect } from 'vitest'
import { extractEmbeddedToolCalls, looksLikeEmbeddedToolCall, sanitizeAssistantContent } from '../shared/toolCalls'

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
})

describe('looksLikeEmbeddedToolCall', () => {
  it('распознаёт сырой JSON tool call', () => {
    expect(looksLikeEmbeddedToolCall('{"name": "list_directory", "arguments": {}}')).toBe(true)
  })

  it('не помечает обычный ответ', () => {
    expect(looksLikeEmbeddedToolCall('Сейчас посмотрю структуру проекта.')).toBe(false)
  })
})

describe('sanitizeAssistantContent', () => {
  it('убирает битый префикс {"name', () => {
    expect(sanitizeAssistantContent('{"nameКонечно! Я изучил проект.')).toBe(
      'Конечно! Я изучил проект.'
    )
  })

  it('разворачивает prose из ```json блока', () => {
    expect(
      sanitizeAssistantContent('```json\nКонечно! Вот обзор проекта.\n```')
    ).toBe('Конечно! Вот обзор проекта.')
  })

  it('убирает валидный tool call JSON', () => {
    expect(sanitizeAssistantContent('{"name": "list_directory", "arguments": {}}')).toBe('')
  })
})
