import { describe, it, expect } from 'vitest'
import type { AgentSkill } from '../src/types'
import {
  extractEmbeddedToolCalls,
  sanitizeAssistantContent,
  looksLikeEmbeddedToolCall
} from '../shared/toolCalls'
import { applySearchReplace, parseToolBool, FileEditError } from '../shared/fileEdit'
import {
  normalizeModelName,
  modelsMatch,
  analyzeTask,
  selectModelForTask,
  shouldUseAutoModel
} from '../shared/modelRouter'
import {
  MUTATING_TOOLS,
  taskLikelyNeedsMutation,
  taskLikelyNeedsTools,
  claimsActionCompleted,
  looksLikeAdviceInsteadOfAction,
  shouldRetryForMissingTools
} from '../shared/actionVerification'
import {
  getModelContextLimitTokens,
  computeContextUsage,
  estimateTokensFromChars
} from '../shared/contextLimits'
import { scoreSkill, shouldApplySkill, truncateSkillInstructions } from '../shared/skillMatching'
import { normalizePermissionMode, toolRequiresConfirm } from '../shared/permissions'
import { isThinkingModel } from '../shared/reasoning'

describe('toolCalls', () => {
  it('извлекает встроенный вызов из json-блока', () => {
    const text = 'Сейчас прочитаю.\n```json\n{"name":"read_file","arguments":{"path":"/a.ts"}}\n```'
    const { toolCalls } = extractEmbeddedToolCalls(text)
    expect(toolCalls).toHaveLength(1)
    expect(toolCalls[0].name).toBe('read_file')
    expect(toolCalls[0].arguments.path).toBe('/a.ts')
  })

  it('извлекает вызов из префикса tool_response', () => {
    const text = 'tool_response {"name":"list_directory","arguments":{}}'
    const { toolCalls, content } = extractEmbeddedToolCalls(text)
    expect(toolCalls.map((c) => c.name)).toEqual(['list_directory'])
    expect(content).toBe('')
  })

  it('игнорирует неизвестные имена инструментов', () => {
    const { toolCalls } = extractEmbeddedToolCalls('{"name":"not_a_tool","arguments":{}}')
    expect(toolCalls).toHaveLength(0)
  })

  it('sanitizeAssistantContent убирает json-вызов и оставляет текст', () => {
    expect(
      sanitizeAssistantContent('```json\n{"name":"read_file","arguments":{"path":"x"}}\n```')
    ).toBe('')
    expect(sanitizeAssistantContent('обычный ответ')).toBe('обычный ответ')
  })

  it('looksLikeEmbeddedToolCall отличает чистый вызов от текста', () => {
    expect(looksLikeEmbeddedToolCall('{"name":"read_file","arguments":{"path":"x"}}')).toBe(true)
    expect(looksLikeEmbeddedToolCall('просто текст')).toBe(false)
  })
})

describe('fileEdit', () => {
  it('заменяет одно вхождение', () => {
    const { content, replacements } = applySearchReplace('a b c', 'b', 'X')
    expect(content).toBe('a X c')
    expect(replacements).toBe(1)
  })

  it('replace_all заменяет все вхождения', () => {
    const { content, replacements } = applySearchReplace('x x x', 'x', 'y', true)
    expect(content).toBe('y y y')
    expect(replacements).toBe(3)
  })

  it('бросает при пустом/совпадающем/ненайденном/неоднозначном', () => {
    expect(() => applySearchReplace('a', '', 'b')).toThrow(FileEditError)
    expect(() => applySearchReplace('a', 'a', 'a')).toThrow(FileEditError)
    expect(() => applySearchReplace('a', 'zzz', 'b')).toThrow(/не найден/)
    expect(() => applySearchReplace('a a', 'a', 'b')).toThrow(/2 раз/)
  })

  it('parseToolBool распознаёт истинные значения', () => {
    expect(parseToolBool('true')).toBe(true)
    expect(parseToolBool('1')).toBe(true)
    expect(parseToolBool('YES')).toBe(true)
    expect(parseToolBool('false')).toBe(false)
    expect(parseToolBool(undefined)).toBe(false)
  })
})

describe('modelRouter', () => {
  it('normalizeModelName и modelsMatch', () => {
    expect(normalizeModelName('Qwen2.5-Coder:latest')).toBe('qwen2.5-coder')
    expect(modelsMatch('qwen2.5-coder', 'qwen2.5-coder:7b')).toBe(true)
    expect(modelsMatch('llama3.1:8b', 'qwen2.5-coder:7b')).toBe(false)
  })

  it('analyzeTask повышает сложность для самоулучшения и мутаций', () => {
    expect(analyzeTask('привет').difficulty).toBeLessThan(20)
    expect(analyzeTask('исправь баг в agent.ts').difficulty).toBeGreaterThan(
      analyzeTask('что это').difficulty
    )
  })

  it('selectModelForTask: null без моделей, единственная — она же', () => {
    expect(selectModelForTask('задача', [])).toBeNull()
    const one = selectModelForTask('задача', [{ name: 'qwen2.5-coder:7b', size: 5e9 }])
    expect(one?.model).toBe('qwen2.5-coder:7b')
  })

  it('selectModelForTask выбирает coder-модель для кода', () => {
    const installed = [
      { name: 'llama3.1:8b', size: 5e9 },
      { name: 'qwen2.5-coder:7b', size: 5e9 }
    ]
    const result = selectModelForTask('исправь typescript ошибку в компоненте', installed)
    expect(result?.model).toBe('qwen2.5-coder:7b')
  })

  it('shouldUseAutoModel учитывает флаг и число моделей', () => {
    expect(shouldUseAutoModel(false, 5)).toBe(false)
    expect(shouldUseAutoModel(true, 0)).toBe(false)
    expect(shouldUseAutoModel(true, 2)).toBe(true)
    expect(shouldUseAutoModel(undefined, 1)).toBe(true)
  })
})

describe('actionVerification', () => {
  it('MUTATING_TOOLS содержит мутирующие инструменты', () => {
    expect(MUTATING_TOOLS.has('write_file')).toBe(true)
    expect(MUTATING_TOOLS.has('run_command')).toBe(true)
    expect(MUTATING_TOOLS.has('read_file')).toBe(false)
  })

  it('taskLikelyNeedsMutation / taskLikelyNeedsTools', () => {
    expect(taskLikelyNeedsMutation('добавь функцию логина')).toBe(true)
    expect(taskLikelyNeedsMutation('как дела')).toBe(false)
    expect(taskLikelyNeedsTools('изучи проект')).toBe(true)
  })

  it('claimsActionCompleted ловит заявления о готовности, но не будущее время', () => {
    expect(claimsActionCompleted('Я создал файл')).toBe(true)
    expect(claimsActionCompleted('Готово.')).toBe(true)
    expect(claimsActionCompleted('Сейчас создаю файл')).toBe(false)
  })

  it('looksLikeAdviceInsteadOfAction ловит совет про Figma', () => {
    expect(looksLikeAdviceInsteadOfAction('Используйте Figma для дизайна')).toBe(true)
  })

  it('shouldRetryForMissingTools требует повтор при заявлении без инструментов', () => {
    expect(shouldRetryForMissingTools('добавь кнопку', 'Я добавил кнопку', new Set(), false)).toBe(
      true
    )
    expect(
      shouldRetryForMissingTools('добавь кнопку', 'Готово', new Set(['write_file']), true)
    ).toBe(false)
  })
})

describe('contextLimits', () => {
  it('getModelContextLimitTokens по размеру модели', () => {
    expect(getModelContextLimitTokens('qwen2.5-coder:7b')).toBe(32_000)
    expect(getModelContextLimitTokens('qwen2.5-coder:32b')).toBe(64_000)
    expect(getModelContextLimitTokens('llama3.1:70b')).toBe(128_000)
    expect(getModelContextLimitTokens('unknown-model')).toBe(16_000)
  })

  it('computeContextUsage помечает необходимость суммаризации', () => {
    const small = computeContextUsage(1000, 'qwen2.5-coder:7b')
    expect(small.shouldSummarize).toBe(false)
    const big = computeContextUsage(estimateTokensFromChars(1) * 0 + 200_000, 'qwen2.5-coder:7b')
    expect(big.shouldSummarize).toBe(true)
    expect(big.usagePercent).toBeLessThanOrEqual(100)
  })
})

describe('skillMatching', () => {
  function makeSkill(patch: Partial<AgentSkill> = {}): AgentSkill {
    return {
      id: 'todo',
      name: 'Todo',
      description: 'Ведение списка задач',
      instructions: 'Шаги...',
      triggers: ['todo', 'список задач'],
      scope: 'global',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      useCount: 0,
      ...patch
    }
  }

  it('scoreSkill повышает балл при совпадении триггера', () => {
    const skill = makeSkill()
    expect(scoreSkill(skill, 'сделай todo по проекту')).toBeGreaterThanOrEqual(10)
    expect(scoreSkill(skill, 'погода завтра')).toBeLessThan(10)
  })

  it('shouldApplySkill: не применяет встроенные и не-global', () => {
    const skill = makeSkill()
    expect(shouldApplySkill(skill, 'todo список задач', false)).toBe(true)
    expect(shouldApplySkill(skill, 'todo', true)).toBe(false)
    expect(shouldApplySkill(makeSkill({ scope: 'project' }), 'todo список задач', false)).toBe(
      false
    )
  })

  it('truncateSkillInstructions обрезает длинный текст', () => {
    expect(truncateSkillInstructions('x'.repeat(10), 5)).toContain('обрезана')
    expect(truncateSkillInstructions('коротко', 100)).toBe('коротко')
  })
})

describe('permissions', () => {
  it('normalizePermissionMode валидирует значение', () => {
    expect(normalizePermissionMode('ask')).toBe('ask')
    expect(normalizePermissionMode('acceptEdits')).toBe('acceptEdits')
    expect(normalizePermissionMode('bypass')).toBe('bypass')
    expect(normalizePermissionMode('мусор')).toBe('bypass')
    expect(normalizePermissionMode(undefined)).toBe('bypass')
  })

  it('toolRequiresConfirm: bypass никогда не спрашивает', () => {
    expect(toolRequiresConfirm('bypass', 'write_file')).toBe(false)
    expect(toolRequiresConfirm('bypass', 'run_command')).toBe(false)
  })

  it('toolRequiresConfirm: ask спрашивает все мутации, но не чтение', () => {
    expect(toolRequiresConfirm('ask', 'write_file')).toBe(true)
    expect(toolRequiresConfirm('ask', 'run_command')).toBe(true)
    expect(toolRequiresConfirm('ask', 'read_file')).toBe(false)
  })

  it('toolRequiresConfirm: acceptEdits принимает правки, спрашивает команды', () => {
    expect(toolRequiresConfirm('acceptEdits', 'write_file')).toBe(false)
    expect(toolRequiresConfirm('acceptEdits', 'edit_file')).toBe(false)
    expect(toolRequiresConfirm('acceptEdits', 'run_command')).toBe(true)
  })
})

describe('reasoning', () => {
  it('isThinkingModel распознаёт think-модели', () => {
    expect(isThinkingModel('qwen3:8b')).toBe(true)
    expect(isThinkingModel('deepseek-r1:7b')).toBe(true)
    expect(isThinkingModel('qwq:32b')).toBe(true)
  })

  it('isThinkingModel: обычные модели — нет', () => {
    expect(isThinkingModel('qwen2.5-coder:7b')).toBe(false)
    expect(isThinkingModel('llama3.1:8b')).toBe(false)
  })
})
