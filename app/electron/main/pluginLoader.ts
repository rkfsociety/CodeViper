import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join, extname } from 'path'
import { createRequire } from 'module'
import { z } from 'zod'

const nodeRequire = createRequire(import.meta.url)

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

const PluginToolFunctionSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown())
})

const PluginToolEntrySchema = z.object({
  type: z.literal('function'),
  function: PluginToolFunctionSchema
})

export const PluginSchema = z.object({
  name: z.string(),
  description: z.string(),
  tools: z.array(PluginToolEntrySchema),
  version: z.string().optional(),
  author: z.string().optional()
})

const PLUGINS_DIR = join(homedir(), '.codeviper', 'plugins')

/**
 * Загрузить плагин из JavaScript файла
 */
function requirePlugin(filePath: string): Plugin | { default: Plugin } {
  const resolved = nodeRequire.resolve(filePath)
  delete nodeRequire.cache[resolved]
  return nodeRequire(filePath) as Plugin | { default: Plugin }
}

function parsePluginExport(raw: unknown, fileLabel: string): Plugin | null {
  const result = PluginSchema.safeParse(raw)
  if (result.success) {
    return result.data
  }

  const details = result.error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
  console.warn(`[plugins] ${fileLabel}: неверная структура (${details}), пропускаем`)
  return null
}

/**
 * Загрузить все плагины из указанной директории (*.js).
 * Плагин должен экспортировать: { name, description, tools: [...] }
 *
 * Примечание: TypeScript-плагины (.ts) не поддерживаются напрямую —
 * скомпилируйте их в .js перед использованием.
 */
export function loadPluginsFromDir(pluginsDir: string = PLUGINS_DIR): Plugin[] {
  const plugins: Plugin[] = []

  if (!existsSync(pluginsDir)) {
    return plugins
  }

  try {
    const entries = readdirSync(pluginsDir, { withFileTypes: true })
    for (const dirent of entries) {
      if (!dirent.isFile()) continue

      const file = dirent.name
      const ext = extname(file)

      if (ext === '.ts') {
        console.warn(
          `[plugins] Скип ${file}: TypeScript-плагины не поддерживаются напрямую. ` +
            `Скомпилируйте в .js и положите в ту же папку.`
        )
        continue
      }

      if (ext !== '.js') continue

      const filePath = join(pluginsDir, file)

      try {
        const plugin = requirePlugin(filePath)
        const pluginModule = 'default' in plugin ? plugin.default : plugin
        const parsed = parsePluginExport(pluginModule, file)
        if (!parsed) continue

        plugins.push(parsed)
        console.warn(`[plugins] Загружен: ${parsed.name}`)
      } catch (err) {
        console.error(`[plugins] Ошибка загрузки ${file}:`, err)
      }
    }
  } catch (err) {
    console.error(`[plugins] Ошибка чтения директории ${pluginsDir}:`, err)
  }

  return plugins
}

/**
 * Загрузить все плагины из ~/.codeviper/plugins/*.js
 */
export function loadPlugins(): Plugin[] {
  return loadPluginsFromDir(PLUGINS_DIR)
}

/**
 * Валидировать структуру плагина перед загрузкой
 */
export function validatePlugin(plugin: unknown): plugin is Plugin {
  return PluginSchema.safeParse(plugin).success
}

/**
 * Получить путь к директории плагинов для открытия в файловом менеджере
 */
export function getPluginsDirectory(): string {
  return PLUGINS_DIR
}
