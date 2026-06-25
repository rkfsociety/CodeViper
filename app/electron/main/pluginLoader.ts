import { existsSync, readdirSync, statSync, writeFileSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join, extname } from 'path'
import { createRequire } from 'module'
import * as esbuild from 'esbuild'

const require = createRequire(import.meta.url)

// Кэш скомпилированных плагинов: путь -> { mtime, compiled }
const pluginCompileCache = new Map<string, { mtime: number; compiled: string }>()

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
 * Скомпилировать TypeScript плагин в JavaScript
 */
function compileTypeScriptPlugin(filePath: string): string {
  const stat = statSync(filePath)
  const cached = pluginCompileCache.get(filePath)

  // Если кэш актуален, вернуть скомпилированный код
  if (cached && cached.mtime === stat.mtime.getTime()) {
    return cached.compiled
  }

  try {
    const result = esbuild.buildSync({
      entryPoints: [filePath],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
      external: ['electron', 'fs', 'path', 'os']
    })

    const compiled = result.outputFiles?.[0]?.text ?? ''
    pluginCompileCache.set(filePath, {
      mtime: stat.mtime.getTime(),
      compiled
    })

    return compiled
  } catch (err) {
    console.error(`Failed to compile plugin ${filePath}:`, err)
    throw err
  }
}

/**
 * Загрузить плагин из JavaScript или TypeScript файла
 */
function requirePlugin(filePath: string): Plugin | { default: Plugin } {
  const ext = extname(filePath)

  if (ext === '.ts') {
    // Компилировать TypeScript в JavaScript
    const compiled = compileTypeScriptPlugin(filePath)

    // Записать во временный файл и загрузить
    const tempFile = join(
      tmpdir(),
      `plugin-${Date.now()}-${Math.random().toString(36).slice(2)}.js`
    )
    writeFileSync(tempFile, compiled, 'utf8')

    try {
      delete require.cache[require.resolve(tempFile)]
      return require(tempFile) as Plugin | { default: Plugin }
    } finally {
      // Очистить временный файл
      try {
        require.cache[require.resolve(tempFile)] = undefined
      } catch {
        // Игнорировать ошибки при очистке
      }
    }
  }

  // Загрузить .js плагин напрямую
  return require(filePath) as Plugin | { default: Plugin }
}

/**
 * Загрузить все плагины из ~/.codeviper/plugins/*.js и *.ts
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
      const ext = extname(file)
      if (ext !== '.js' && ext !== '.ts') continue

      const filePath = join(PLUGINS_DIR, file)
      const stat = statSync(filePath)
      if (!stat.isFile()) continue

      try {
        const plugin = requirePlugin(filePath)
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

/**
 * Асинхронно предкомпилировать все TypeScript плагины и заполнить кэш.
 * Вызывать при старте приложения, чтобы последующие синхронные вызовы
 * loadPlugins() не блокировали event loop через esbuild.buildSync().
 */
export async function preloadPluginsAsync(): Promise<void> {
  if (!existsSync(PLUGINS_DIR)) return

  let files: string[]
  try {
    files = readdirSync(PLUGINS_DIR)
  } catch {
    return
  }

  const tsFiles = files.filter((f) => extname(f) === '.ts').map((f) => join(PLUGINS_DIR, f))

  await Promise.all(
    tsFiles.map(async (filePath) => {
      try {
        const stat = statSync(filePath)
        const cached = pluginCompileCache.get(filePath)
        if (cached && cached.mtime === stat.mtime.getTime()) return

        const result = await esbuild.build({
          entryPoints: [filePath],
          bundle: true,
          platform: 'node',
          format: 'cjs',
          write: false,
          external: ['electron', 'fs', 'path', 'os']
        })
        const compiled = result.outputFiles?.[0]?.text ?? ''
        pluginCompileCache.set(filePath, { mtime: stat.mtime.getTime(), compiled })
      } catch (err) {
        console.error(`Failed to precompile plugin ${filePath}:`, err)
      }
    })
  )
}
