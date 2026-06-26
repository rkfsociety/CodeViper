import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadPluginsFromDir, validatePlugin } from '../electron/main/pluginLoader'

const validTool = {
  type: 'function' as const,
  function: {
    name: 'test_tool',
    description: 'Test tool',
    parameters: { type: 'object' }
  }
}

describe('PluginLoader', () => {
  it('should validate plugin structure', () => {
    const validPlugin = {
      name: 'test',
      description: 'Test plugin',
      tools: [validTool]
    }
    expect(validatePlugin(validPlugin)).toBe(true)
  })

  it('should reject invalid plugins', () => {
    expect(validatePlugin({ name: 'test' })).toBe(false)
    expect(validatePlugin(null)).toBe(false)
    expect(validatePlugin(undefined)).toBe(false)
  })

  it('should reject plugin tool without name', () => {
    expect(
      validatePlugin({
        name: 'test',
        description: 'Test plugin',
        tools: [
          {
            type: 'function',
            function: {
              description: 'missing name',
              parameters: {}
            }
          }
        ]
      })
    ).toBe(false)
  })
})

describe('loadPluginsFromDir', () => {
  let testDir: string
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'codeviper-plugins-'))
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    warnSpy.mockRestore()
  })

  it('skips plugin without name and loads valid plugins', () => {
    writeFileSync(
      join(testDir, 'invalid.js'),
      'module.exports = { description: "no name", tools: [] };'
    )
    writeFileSync(
      join(testDir, 'valid.js'),
      `module.exports = {
        name: "valid-plugin",
        description: "Valid plugin",
        tools: [{
          type: "function",
          function: {
            name: "valid_tool",
            description: "Works",
            parameters: { type: "object" }
          }
        }]
      };`
    )

    const plugins = loadPluginsFromDir(testDir)

    expect(plugins).toHaveLength(1)
    expect(plugins[0]?.name).toBe('valid-plugin')
    expect(plugins[0]?.tools[0]?.function.name).toBe('valid_tool')
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[plugins] invalid.js: неверная структура')
    )
    expect(warnSpy).toHaveBeenCalledWith('[plugins] Загружен: valid-plugin')
  })
})
