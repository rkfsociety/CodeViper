<p align="center">
  <img src="app/resources/icon.png" alt="CodeViper" width="96" />
</p>

<h1 align="center">CodeViper</h1>

<p align="center">
  Локальный AI-агент для программирования с графическим интерфейсом.<br>
  Работает через <a href="https://ollama.com">Ollama</a> или облачные API — без подписок, без слежки.
</p>

<p align="center">
  <a href="https://github.com/rkfsociety/CodeViper/releases"><img src="https://img.shields.io/github/v/release/rkfsociety/CodeViper?style=flat-square&color=7EE787&label=релиз" alt="Release" /></a>
  <img src="https://img.shields.io/badge/платформа-Windows-0078D4?style=flat-square" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-36-47848F?style=flat-square" alt="Electron" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/лицензия-MIT-A371F7?style=flat-square" alt="MIT" /></a>
</p>

---

Локальный AI-агент с GUI: читает проект, правит файлы, запускает команды, git-откат, самоулучшение по [ROADMAP](ROADMAP.md). Ollama, DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter.

## Быстрый старт

**Требования:** Windows 10/11, [Node.js 18+](https://nodejs.org), 8 ГБ RAM.

```powershell
git clone https://github.com/rkfsociety/CodeViper.git
cd CodeViper/app && npm install
```

Двойной клик на **`CodeViper.cmd`** в корне репозитория. Ошибка запуска — **`CodeViper.cmd console`** (лог в `%LOCALAPPDATA%\CodeViper\dev.log`). Установщик: `npm run dist` в `app/` (portable Node — `npm run setup-node`).

## Документация

| | |
|---|---|
| [Демонстрации (GIF)](docs/demos.md) | [Примеры запросов](docs/example-prompts.md) |
| [Использование](docs/usage.md) | [Провайдеры моделей](docs/models.md) |
| [Интеграции](docs/integrations.md) | [Самоулучшение](docs/self-improvement.md) |
| [Архитектура](docs/architecture.md) | [Разработка и тесты](docs/development.md) |

[Вики](https://github.com/rkfsociety/CodeViper/wiki) · [ROADMAP](ROADMAP.md) (23 задачи; промпт: `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper`)

## Участие

Баги и предложения — [Issues](https://github.com/rkfsociety/CodeViper/issues). PR приветствуются.

## Лицензия

[MIT](LICENSE)
