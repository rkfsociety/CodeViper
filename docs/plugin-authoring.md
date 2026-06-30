# Авторство плагинов CodeViper

Краткий гайд: как добавить свои инструменты агенту через файлы в `~/.codeviper/plugins/`.

Плагин — это **CommonJS-модуль `.js`**, который экспортирует метаданные и **схемы инструментов** (как у встроенных tools в [`agentTools/`](../app/electron/main/agentTools/)). Загрузчик: [`pluginLoader.ts`](../app/electron/main/pluginLoader.ts).

---

## Куда класть файлы

| Платформа | Путь |
|-----------|------|
| Windows | `%USERPROFILE%\.codeviper\plugins\` |
| Linux / macOS | `~/.codeviper/plugins/` |

Открыть папку из приложения: **Настройки → Плагины → «Открыть папку»**.

В каталоге учитываются только **файлы верхнего уровня** `*.js`. Подпапки и другие расширения игнорируются.

---

## Схема плагина

Экспорт — объект `module.exports` или `export default` (после сборки в `.js`):

| Поле | Обязательно | Описание |
|------|-------------|----------|
| `name` | да | Уникальное имя плагина (для логов) |
| `description` | да | Краткое описание |
| `tools` | да | Массив схем инструментов |
| `version` | нет | Строка версии |
| `author` | нет | Автор |

Каждый элемент `tools` — объект в формате **OpenAI function calling**:

```json
{
  "type": "function",
  "function": {
    "name": "my_tool",
    "description": "Что делает инструмент",
    "parameters": {
      "type": "object",
      "properties": {
        "input": { "type": "string", "description": "Вход" }
      },
      "required": ["input"]
    }
  }
}
```

Поле `parameters` — JSON Schema (`type`, `properties`, `required`, …), как у встроенных tools. Имена инструментов не должны совпадать со встроенными (см. [`AGENT_TOOL_NAMES`](../app/shared/toolCalls.ts)).

Валидация при загрузке — Zod-схема `PluginSchema` в `pluginLoader.ts`. Некорректный файл пропускается с предупреждением в логе `[plugins]`.

---

## Минимальный рабочий пример

Файл `~/.codeviper/plugins/hello.js`:

```javascript
'use strict'

module.exports = {
  name: 'hello-plugin',
  description: 'Пример плагина с одним инструментом',
  version: '1.0.0',
  tools: [
    {
      type: 'function',
      function: {
        name: 'hello_world',
        description: 'Вернуть приветствие для переданного имени',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Имя для приветствия' }
          },
          required: ['name']
        }
      }
    }
  ]
}
```

**Проверка загрузки**

1. Сохраните файл в папку плагинов.
2. Запустите новый запрос агенту (новый прогон).
3. В логе main-процесса должно появиться: `[plugins] Загружен: hello-plugin`.
4. Схема `hello_world` попадает в список tools модели (см. trace / debug-лог агента).

Этот пример соответствует unit-тесту в [`pluginLoader.test.ts`](../app/tests/pluginLoader.test.ts).

---

## Hot-reload

Перезапуск всего `.exe` после правки плагина **не обязателен**.

1. **Сброс `require`-кэша** — при каждой загрузке `pluginLoader` удаляет запись из `require.cache` для файла плагина, поэтому на диске всегда читается актуальный `.js`.
2. **Перечитывание при прогоне** — `getAgentTools()` снова вызывает `loadPlugins()`; достаточно **нового сообщения агенту** (новый run), чтобы подтянуть изменения.
3. **Кэш схем** — преобразованные схемы кэшируются в `getAgentTools`; при смене имён/описаний tools создаётся новая запись. Для разработки можно вызвать `invalidatePluginToolsCache()` (см. [`agentTools/index.ts`](../app/electron/main/agentTools/index.ts)).

Отдельного file-watcher на папку плагинов нет: hot-reload срабатывает на **следующий прогон агента**, а не в середине уже идущего run.

---

## Ограничения

| Ограничение | Детали |
|-------------|--------|
| **Только `.js`** | Файлы `.ts` пропускаются с предупреждением; скомпилируйте TypeScript в `.js` и положите результат в ту же папку |
| **CommonJS** | `module.exports = { … }` или `module.exports = { default: { … } }`; ESM `import` в плагине без сборки не поддерживается |
| **Только схемы** | Плагин регистрирует **описания** tools для модели; **обработчики вызовов** из `.js` пока не подключаются — при вызове кастомного tool агент получит «Неизвестный инструмент» до появления runtime-обработчиков (см. пункты ROADMAP про plugin handlers) |
| **Один файл — один плагин** | Не сканируются вложенные каталоги |
| **Безопасность** | Плагин выполняется в main-процессе через `require`; не подключайте непроверенный код |
| **Text tool calls (Ollama)** | Имена plugin-tools **не** входят в `AGENT_TOOL_NAMES`; надёжнее cloud-провайдеры с нативными tool calls |

Для обхода «только схемы» сейчас используйте **MCP-сервер** ([`docs/integrations.md`](integrations.md)) или встроенные **Skills** (`read_skill` / `write_skill_data`).

---

## Отладка

- Настройки → Плагины → открыть папку и проверить расширение `.js`.
- Запуск с консолью (`CodeViper.cmd console`) — сообщения `[plugins] …`.
- Синтаксическая ошибка в файле: `[plugins] Ошибка загрузки <file>`.
- Общие проблемы: [`docs/troubleshooting.md`](troubleshooting.md#проблемы-с-плагинами).

---

## См. также

- [API инструментов агента](tools-api.md) — встроенные tools и соглашения по `parameters`
- [Интеграции (MCP)](integrations.md) — внешние tools с полноценным runtime
- Исходники: [`pluginLoader.ts`](../app/electron/main/pluginLoader.ts), [`agentTools/index.ts`](../app/electron/main/agentTools/index.ts)
