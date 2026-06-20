<p align="center">
  <img src="app/resources/icon.png" alt="CodeViper" width="96" />
</p>

<h1 align="center">CodeViper</h1>

<p align="center">
  Локальный AI-агент для программирования с графическим интерфейсом.<br>
  Работает на вашем железе через <a href="https://ollama.com">Ollama</a> или через облачные API — без подписок, без лимитов, без слежки.
</p>

<p align="center">
  <a href="https://github.com/rkfsociety/CodeViper/releases"><img src="https://img.shields.io/github/v/release/rkfsociety/CodeViper?style=flat-square&color=7EE787&label=релиз" alt="Release" /></a>
  <img src="https://img.shields.io/badge/платформа-Windows-0078D4?style=flat-square" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-36-47848F?style=flat-square" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square" alt="TypeScript" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/лицензия-MIT-A371F7?style=flat-square" alt="MIT" /></a>
</p>

---

## Что это

Вы описываете задачу в чате — агент сам читает нужные файлы, вносит правки, запускает команды в терминале и отчитывается о результате. Никаких копипаст, никаких ручных правок — только описание на русском языке.

Работает **полностью локально** через [Ollama](https://ollama.com) или подключается к **облачным API** — DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter (400+ моделей). Исходный код открыт: агент может читать и улучшать сам себя.

## Возможности

| | |
|---|---|
| 🤖 **ReAct-агент** | Цикл рассуждение → инструмент → результат с авто-восстановлением после ошибок |
| 🏠 **Локальные модели** | Любая модель через Ollama: Qwen, DeepSeek, Llama, Mistral, Gemma и другие |
| ☁️ **Облачные модели** | DeepSeek, OpenAI, Anthropic Claude, Google Gemini, OpenRouter (400+ моделей) |
| 🛠 **Инструменты агента** | Чтение/запись/поиск файлов, grep, терминал, git, GitHub Issues/PR |
| 🧠 **Память и самообучение** | Агент запоминает факты, рефлексирует после задач, улучшает собственный код |
| 💬 **История чатов** | Папки, поиск, теги, drag-and-drop, привязка чата к проекту |
| 📎 **Вложения** | Файлы, скриншоты (Ctrl+V), drag-and-drop; мультимодальный ввод |
| ✅ **Todo-список** | Агент ведёт список задач прямо в чате — видно прогресс по шагам |
| 🔒 **Режимы доступа** | Спрашивать всё / принимать правки / полный автопилот |
| 📊 **Мониторинг** | CPU, GPU, RAM в реальном времени прямо в интерфейсе |
| ✍️ **Саморедактирование** | Агент читает и улучшает собственный исходный код CodeViper |

## Быстрый старт

**Требования:** Windows 10/11, [Node.js 18+](https://nodejs.org), 8 ГБ RAM.
Для локальных моделей — [Ollama](https://ollama.com). Для облака — API-ключ провайдера.

```powershell
git clone https://github.com/rkfsociety/CodeViper.git
cd CodeViper/app
npm install
```

Далее — двойной клик на **`CodeViper.cmd`** в корне репозитория.

> С консолью: `CodeViper.cmd console`

### Первая настройка

1. Нажмите шестерёнку ⚙ в правом верхнем углу
2. Выберите провайдер: **Ollama** (локально) или облачный API
3. Выберите модель и укажите путь к вашему проекту

Рекомендуемые локальные модели: `qwen2.5-coder:7b`, `deepseek-coder-v2:16b`, `qwq:32b`.

## Провайдеры

| Провайдер | Ключ | Описание |
|---|---|---|
| Ollama | не нужен | Локально, любые модели через Ollama |
| DeepSeek | `sk-...` | deepseek-chat, deepseek-reasoner |
| OpenAI-совместимый | `sk-...` | Любой OpenAI-совместимый API |
| Anthropic | `sk-ant-...` | Claude 3.5/3.7, streaming + tool use |
| Gemini | `AIza...` | Gemini 2.0/1.5, thinking, нативный REST |
| OpenRouter | `sk-or-...` | 400+ моделей: GPT-4o, Claude, Gemini, Llama |

## Архитектура

```
CodeViper/
├── app/
│   ├── electron/main/        # Main process: агент, провайдеры, инструменты
│   │   ├── agent.ts          # AgentRunner — основной цикл ReAct
│   │   ├── agentContext.ts   # Построение контекста, суммаризация
│   │   ├── contextSummarizer.ts  # Сжатие контекста, обрезка tool results
│   │   ├── modelRuntime.ts   # Абстракция провайдера моделей
│   │   ├── services.ts       # Файловые операции, LRU-кэш
│   │   └── tools/            # Инструменты агента (файлы, git, github, …)
│   ├── src/                  # Renderer: React-интерфейс
│   └── shared/               # Общие типы и утилиты
└── CodeViper.cmd              # Точка входа
```

## Документация

Подробная документация живёт в [вики проекта](https://github.com/rkfsociety/CodeViper/wiki):

- [🚀 Быстрый старт](https://github.com/rkfsociety/CodeViper/wiki/Быстрый-старт)
- [🤖 Провайдеры моделей](https://github.com/rkfsociety/CodeViper/wiki/Провайдеры-моделей)
- [🛠 Инструменты агента](https://github.com/rkfsociety/CodeViper/wiki/Инструменты-агента)
- [🧠 Память и самообучение](https://github.com/rkfsociety/CodeViper/wiki/Память-и-самообучение)
- [🔒 Безопасность](https://github.com/rkfsociety/CodeViper/wiki/Безопасность)
- [✏️ Саморедактирование](https://github.com/rkfsociety/CodeViper/wiki/Саморедактирование)
- [🏗 Архитектура](https://github.com/rkfsociety/CodeViper/wiki/Архитектура)
- [👨‍💻 Для разработчиков](CONTRIBUTING.md)
- [📋 Дорожная карта](ROADMAP.md)

## Участие в разработке

Баги и предложения — в [Issues](https://github.com/rkfsociety/CodeViper/issues).
Pull requests приветствуются, см. [CONTRIBUTING.md](CONTRIBUTING.md).

## Лицензия

[MIT](LICENSE) — используйте, форкайте, улучшайте.
