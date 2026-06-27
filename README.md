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
  <img src="https://img.shields.io/badge/Electron-42-47848F?style=flat-square" alt="Electron" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/лицензия-MIT-A371F7?style=flat-square" alt="MIT" /></a>
</p>

---

Локальный AI-агент с GUI: читает проект, скрываемое дерево файлов (кнопка «Файлы» в шапке), toast «Агент ждёт подтверждения» при preview/danger вне фокуса, side-by-side diff, стеклянная панель «Недавние» с pill-списком чатов и перетаскиваемым разделителем ширины, иконка в трее, toast при завершении агента, экспорт трейса агента в JSON (папка данных приложения, не репозиторий), отправка трейса в GitHub Issue через `gh` от имени агента (авто при ошибке + кнопка «На GitHub», нужен `gh auth login`), панели «Метрики» и «Трасса» с перетаскиваемым разделителем, ищет символы по AST (`find_symbol`), правит файлы, защита от «вечной разведки» и чтения вне списка «Файлы:» в ROADMAP, распознавание копипаста пункта ROADMAP как самоулучшения, запускает команды, git stash/pop и откат, самоулучшение. Ollama, DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter.

## Быстрый старт

**Требования:** Windows 10/11, [Node.js 18+](https://nodejs.org) (для запуска из исходников), 8 ГБ RAM.

**Установщик:** `CodeViper-Setup-*.exe` с [релизов](https://github.com/rkfsociety/CodeViper/releases) — ярлыки запускают `CodeViper.exe`; при установке запросит **права администратора (UAC)** и **[Git for Windows](https://git-scm.com)** в PATH (клон в `%APPDATA%/codeviper/source`). Если окно пустое или чёрное после обновления — переустановите **0.3.0+**, удалите `%APPDATA%\codeviper\GPUCache` и `%APPDATA%\codeviper\ShaderCache`, либо временно переименуйте `%USERPROFILE%\.codeviper\plugins`.

```powershell
git clone https://github.com/rkfsociety/CodeViper.git
cd CodeViper/app && npm install
```

Двойной клик на **`CodeViper.cmd`**. Ошибка — **`CodeViper.cmd console`**. Подробнее — [вики · Быстрый старт](https://github.com/rkfsociety/CodeViper/wiki/Быстрый-старт).

## Обновление без переустановки

Установщик клонирует репозиторий в **`%APPDATA%/CodeViper/source`** (нужен **Git for Windows**). При **автообновлении** без полной переустановки: `git pull` → сборка в `source/app` → баннер **«Перезапустить для применения»** — подтягиваются agent runtime и **интерфейс** (окно, настройки, селектор моделей) из клона. Тонкая оболочка `CodeViper.exe` меняется редко; новый установщик — только при смене Electron/NSIS или первой установке.

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
| [Интеграции (MCP, P2P, коллективная память — gh/git или token)](docs/integrations.md) | [Разработка и live runtime](docs/development.md) |
| [API (TypeDoc)](https://rkfsociety.github.io/CodeViper/) | [ROADMAP](ROADMAP.md) (134 задач) · [выполнено](ROADMAP_DONE.md) |

## Участие

[Discussions](https://github.com/rkfsociety/CodeViper/discussions) (вопросы, идеи) · [Issues](https://github.com/rkfsociety/CodeViper/issues) · [CONTRIBUTING.md](CONTRIBUTING.md) · PR приветствуются.

## Лицензия

[MIT](LICENSE)
