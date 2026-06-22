import { existsSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join, extname } from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

export interface PluginToolSchema {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface PluginMetadata {
  name: string
  description: string
  version?: string
  author?: string
}

export interface Plugin {
  name: string
  description: string
  tools: PluginToolSchema[]
  version?: string
  author?: string
}

const PLUGINS_DIR = join(homedir(), '.codeviper', 'plugins')

/**
 * Загрузить все плагины из ~/.codeviper/plugins/*.js
 * Плагин должен экспортировать: { name, description, tools: [...] }
 */
export function loadPlugins(): Plugin[] {
  const plugins: Plugin[] = []

  if (!existsSync(PLUGINS_DIR)) {
    return plugins
  }

  try {
    const files = readdirSync(PLUGINS_DIR)
    for (const file of files) {
      if (extname(file) !== '.js') continue

      const filePath = join(PLUGINS_DIR, file)
      const stat = statSync(filePath)
      if (!stat.isFile()) continue

      try {
        const plugin = require(filePath) as Plugin | { default: Plugin }
        const pluginModule = 'default' in plugin ? plugin.default : plugin

        if (
          !pluginModule ||
          typeof pluginModule !== 'object' ||
          !pluginModule.name ||
          !pluginModule.description ||
          !Array.isArray(pluginModule.tools)
        ) {
          console.warn(`Plugin ${file} has invalid structure, skipping`)
          continue
        }

        plugins.push(pluginModule)
        console.warn(`Loaded plugin: ${pluginModule.name}`)
      } catch (err) {
        console.error(`Failed to load plugin ${file}:`, err)
      }
    }
  } catch (err) {
    console.error(`Failed to read plugins directory ${PLUGINS_DIR}:`, err)
  }

  return plugins
}

/**
 * Валидировать структуру плагина перед загрузкой
 */
export function validatePlugin(plugin: unknown): plugin is Plugin {
  if (!plugin || typeof plugin !== 'object') return false

  const p = plugin as Record<string, unknown>
  if (typeof p.name !== 'string' || typeof p.description !== 'string') return false

  if (!Array.isArray(p.tools)) return false

  return p.tools.every((tool: unknown) => {
    if (!tool || typeof tool !== 'object') return false
    const t = tool as Record<string, unknown>
    if (t.type !== 'function' || !t.function) return false
    const f = t.function as Record<string, unknown>
    return (
      typeof f.name === 'string' &&
      typeof f.description === 'string' &&
      f.parameters &&
      typeof f.parameters === 'object'
    )
  })
}

/**
 * Получить путь к директории плагинов для открытия в файловом менеджере
 */
export function getPluginsDirectory(): string {
  return PLUGINS_DIR
}
