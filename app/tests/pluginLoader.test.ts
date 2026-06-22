import { describe, it, expect } from 'vitest'
import { loadPlugins, validatePlugin } from '../electron/main/pluginLoader'

describe('PluginLoader', () => {
  it('should load plugins from ~/.codeviper/plugins', () => {
    const plugins = loadPlugins()
    console.log(`Loaded ${plugins.length} plugins`)
    plugins.forEach((p) => {
      console.log(`- ${p.name}: ${p.description}`)
      console.log(`  Tools: ${p.tools.map((t) => t.function.name).join(', ')}`)
    })
  })

  it('should validate plugin structure', () => {
    const validPlugin = {
      name: 'test',
      description: 'Test plugin',
      tools: [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'Test tool',
            parameters: { type: 'object' }
          }
        }
      ]
    }
    expect(validatePlugin(validPlugin)).toBe(true)
  })

  it('should reject invalid plugins', () => {
    expect(validatePlugin({ name: 'test' })).toBe(false)
    expect(validatePlugin(null)).toBe(false)
    expect(validatePlugin(undefined)).toBe(false)
  })
})
