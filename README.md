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

Локальный AI-агент с GUI: читает проект, дерево файлов, side-by-side diff при preview правок, ищет символы по AST (`find_symbol`), правит файлы, запускает команды, git-откат, самоулучшение. Ollama, DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter.

## Быстрый старт

**Требования:** Windows 10/11, [Node.js 18+](https://nodejs.org), 8 ГБ RAM.

```powershell
git clone https://github.com/rkfsociety/CodeViper.git
cd CodeViper/app && npm install
```

Двойной клик на **`CodeViper.cmd`**. Ошибка — **`CodeViper.cmd console`**. Подробнее — [вики · Быстрый старт](https://github.com/rkfsociety/CodeViper/wiki/Быстрый-старт).

## Документация

### [Вики проекта](https://github.com/rkfsociety/CodeViper/wiki) — основной источник

| | |
|---|---|
| [Быстрый старт](https://github.com/rkfsociety/CodeViper/wiki/Быстрый-старт) | [Провайдеры моделей](https://github.com/rkfsociety/CodeViper/wiki/Провайдеры-моделей) |
| [Инструменты агента](https://github.com/rkfsociety/CodeViper/wiki/Инструменты-агента) | [Память и самообучение](https://github.com/rkfsociety/CodeViper/wiki/Память-и-самообучение) |
| [История чатов](https://github.com/rkfsociety/CodeViper/wiki/История-чатов) | [Архитектура](https://github.com/rkfsociety/CodeViper/wiki/Архитектура) |
| [Разработка](https://github.com/rkfsociety/CodeViper/wiki/Разработка) | [Безопасность](https://github.com/rkfsociety/CodeViper/wiki/Безопасность) |

### В репозитории

| | |
|---|---|
| [Демонстрации (GIF)](docs/demos.md) | [Примеры запросов](docs/example-prompts.md) |
| [Интеграции (MCP, P2P)](docs/integrations.md) | [API (TypeDoc)](https://rkfsociety.github.io/CodeViper/) |
| [ROADMAP](ROADMAP.md) | промпт: `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper` |

## Участие

[Issues](https://github.com/rkfsociety/CodeViper/issues) · [CONTRIBUTING.md](CONTRIBUTING.md) (ReAct, новый инструмент) · PR приветствуются.

## Лицензия

[MIT](LICENSE)
