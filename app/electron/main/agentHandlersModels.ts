import type { AgentSettings } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { safeReadFile } from './services'
import { buildModelfile, parseTrainingData, prepareModelFromTrainingFile } from './ollamaModels'

export function createModelToolHandlers(
  projectPath: string,
  settings: AgentSettings,
  signal?: AbortSignal
): Partial<ToolHandlers> {
  return {
    preview_ollama_modelfile: async (args) => {
      const raw = await safeReadFile(projectPath, args.data_path)
      const examples = parseTrainingData(raw)
      if (!examples.length) {
        return 'Ошибка: в файле нет примеров {user, assistant} (JSON или JSONL).'
      }
      const modelfile = buildModelfile({
        baseModel: args.base_model,
        system: args.system,
        examples,
        temperature: args.temperature ? Number(args.temperature) : undefined
      })
      return `Примеров: ${examples.length}\n\n${modelfile}`
    },

    create_ollama_model: async (args) => {
      const raw = await safeReadFile(projectPath, args.data_path)
      const temperature = args.temperature ? Number(args.temperature) : undefined
      const result = await prepareModelFromTrainingFile({
        baseUrl: settings.ollamaUrl,
        baseModel: args.base_model,
        modelName: args.model_name,
        trainingRaw: raw,
        system: args.system,
        temperature: Number.isFinite(temperature) ? temperature : undefined,
        signal
      })
      return [
        `Модель создана: ${args.model_name}`,
        `Статус Ollama: ${result.status}`,
        `Примеров в Modelfile: ${result.exampleCount}`,
        'Выберите модель в настройках CodeViper или укажите в следующем запросе.',
        '',
        'Modelfile:',
        result.modelfile
      ].join('\n')
    }
  }
}
