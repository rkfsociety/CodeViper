# Участие в разработке CodeViper

Рады любому вкладу — баг-фиксам, новым функциям, улучшениям документации.

## Быстрый старт для разработки

```powershell
git clone https://github.com/Code-Viper-AI/CodeViper.git
cd CodeViper/app
npm install
npm run dev        # Запуск в режиме разработки (hot reload)
```

В режиме разработки открывается Electron-окно с DevTools.

## Структура проекта

```
app/
├── electron/
│   ├── main/          # Main process (Node.js)
│   │   ├── agent.ts           # Основной цикл агента (ReAct)
│   │   ├── agentContext.ts    # Построение контекста для LLM
│   │   ├── agentHandlers*.ts  # Обработчики инструментов агента
│   │   ├── providers/         # Провайдеры моделей (Ollama, OpenAI, …)
│   │   ├── settings.ts        # Загрузка/сохранение настроек
│   │   └── index.ts           # Точка входа Electron
│   └── preload/       # Preload-скрипт (IPC-мост)
├── src/               # Renderer process (React)
│   ├── components/    # UI-компоненты
│   ├── contexts/      # React Context (Agent, Chat, Queue)
│   └── hooks/         # Хуки
└── shared/            # Общий код (типы, утилиты)
```

## Перед отправкой PR

```powershell
cd app
npm run typecheck   # Проверка типов TypeScript
npm run build       # Сборка (папка out/ должна быть актуальной)
```

Коммиты на русском языке, в формате `тип: описание` (`fix:`, `feat:`, `perf:`, `docs:`).

## Как добавить нового провайдера модели

1. Создайте `app/electron/main/providers/myProvider.ts`, реализовав интерфейс `ModelProvider`
2. Зарегистрируйте в `modelRuntime.ts`
3. Добавьте пункт в `SettingsModal.tsx` (выбор провайдера)
4. Добавьте поле API-ключа в `types.ts` и `settings.ts`

Пример: смотрите `openaiProvider.ts` — он же используется для DeepSeek и OpenRouter.

## Как добавить инструмент агента

1. Добавьте описание инструмента в `agentTools.ts` (JSON Schema)
2. Добавьте обработчик в `agentHandlersProject.ts` (или создайте новый файл `agentHandlersMy.ts`)
3. Зарегистрируйте в `getToolHandlers()` в `agent.ts`

## Вопросы

Пишите в [Discussions](https://github.com/Code-Viper-AI/CodeViper/discussions) или создавайте [Issue](https://github.com/Code-Viper-AI/CodeViper/issues).
