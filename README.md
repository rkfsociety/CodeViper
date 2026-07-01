<p align="center">
  <img src="app/resources/icon.png" alt="CodeViper" width="96" />
</p>

<h1 align="center">CodeViper</h1>

<p align="center">
  Локальный AI-агент для программирования с графическим интерфейсом.<br>
  Работает через <a href="https://ollama.com">Ollama</a> или облачные API — без подписок, без слежки.
</p>

<p align="center">
  <a href="https://github.com/rkfsociety/CodeViper/releases"><img src="https://img.shields.io/github/v/release/rkfsociety/CodeViper?style=flat-square&color=7EE787&label=Релиз" alt="Release" /></a>
  <img src="https://img.shields.io/badge/платформа-Windows-0078D4?style=flat-square" alt="Windows" />
  <img src="https://img.shields.io/badge/платформа-Linux-FCC624?style=flat-square" alt="Linux" />
  <img src="https://img.shields.io/badge/платформа-macOS-000000?style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/Electron-42-47848F?style=flat-square" alt="Electron" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/лицензия-MIT-A371F7?style=flat-square" alt="MIT" /></a>
</p>

---

Локальный AI-агент с GUI: читает и правит код, запускает команды и git, авто-форматирование проекта (`format_project`, Prettier/Black), AST-поиск медленных участков (`find_slow_code`), AST-поиск мёртвого кода (`find_dead_code`), проверка CVE в зависимостях (`check_cve`, NVD/OSV). При открытии проекта предупреждает о циклических импортах в чате, а из топбара открывает отдельные окна графов import/require и IPC/HTTP/FS. Перед прогоном — preflight имени модели (ListModels, HTTP 404). Для моделей ≤8B — компактный system prompt; extended-инструкции — от 14B. Провайдеры — Ollama, OpenAI, LiteRouter, custom endpoint (LM Studio, vLLM), Anthropic, Gemini, DeepSeek, OpenRouter; запасные модели при 429/5xx. Во время прогона размышления и планирование — в компактном скроллируемом блоке (~200px); после финального ответа блок скрывается. Задачи с «ревью» / «review» автоматически делегируются субагенту Reviewer, с «тесты» / «run tests» — субагенту Tester; в trace видны события `delegate_to_reviewer` / `delegate_to_tester`. Возможности и сценарии — в [вики](https://github.com/rkfsociety/CodeViper/wiki).

**Требования:** Windows 10/11, Linux или macOS, [Node.js 18+](https://nodejs.org) (из исходников), 8 ГБ RAM.

**Сборка из исходников:** доступна на всех платформах; нужен [Git](https://git-scm.com) в PATH.

```powershell
git clone https://github.com/rkfsociety/CodeViper.git
cd CodeViper/app && npm install
```

**Релизы по платформам:**

- Windows: [`CodeViper-Setup-*.exe`](https://github.com/rkfsociety/CodeViper/releases)
- Linux: [`CodeViper-*.AppImage`](https://github.com/rkfsociety/CodeViper/releases)
- macOS: [`CodeViper-*.dmg`](https://github.com/rkfsociety/CodeViper/releases)
- POSIX-лаунчер: [`CodeViper.sh`](https://github.com/rkfsociety/CodeViper/releases)

## Обновление без переустановки

Runtime (UI, агент) — git-клон в `%APPDATA%/CodeViper/source`, перезапуск `.exe` после обновления. Оболочку `.exe` меняют редко; CI-релиз — draft → артефакты всех ОС → публикация (см. [docs/development.md](docs/development.md)). Детали — [docs/development.md](docs/development.md) · [вики · Разработка](https://github.com/rkfsociety/CodeViper/wiki/Разработка).

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
| [Интеграции (MCP, P2P, коллективная память)](docs/integrations.md) | [Разработка и live runtime](docs/development.md) |
| [Авторство плагинов](docs/plugin-authoring.md) | схема tool, пример `.js`, hot-reload |
| [Устранение неполадок](docs/troubleshooting.md) | GPUCache, чёрный экран, плагины, portable Node |
| [API (TypeDoc)](https://rkfsociety.github.io/CodeViper/) | [ROADMAP](ROADMAP.md) (473 задач, 13 смысловых файлов в `ROADMAP/`) · [выполнено](ROADMAP_DONE.md) |

## Участие

[Discussions](https://github.com/rkfsociety/CodeViper/discussions) · [Issues](https://github.com/rkfsociety/CodeViper/issues) · [CONTRIBUTING.md](CONTRIBUTING.md)

## Лицензия

[MIT](LICENSE)

