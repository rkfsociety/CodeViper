# Разработка и тесты

> **Актуальная версия — [вики · Разработка](https://github.com/rkfsociety/CodeViper/wiki/Разработка).**

Команды из папки `app/`:

```bash
npm run typecheck   # проверка типов
npm run build       # сборка main + renderer в out/
npm test            # все unit-тесты
npm test -- nodeLlama
npm run test:e2e    # Playwright + Electron
npm run lint
```

Метка **`trace-report`** на GitHub Issues нужна для кнопки «На GitHub» в панели трассы. Создать в репозитории: `node scripts/ensure-github-labels.mjs` (нужен `gh auth login`). Отправка трейса идёт через `gh gist create` и `gh issue create`. IPC «На GitHub» переопределяется из git-клона (`runtimeHandlers.js`), если установленный `.exe` (asar) старее runtime.

Трасса агента сохраняется в `%APPDATA%/CodeViper/traces/chats/{chatId}.json` и восстанавливается после перезапуска для того же чата (экспорт / отчёт на GitHub).

Интеграционные тесты `nodeLlama` пропускаются без `TEST_GGUF_PATH`:

```bash
TEST_GGUF_PATH=/path/to/model.gguf npm test -- nodeLlama
```

После `npm install` нативный модуль: `npm run rebuild`.

## Обновление без переустановки (live runtime)

### Установка vs live runtime

| Компонент | Где живёт | Как обновляется |
|-----------|-----------|-----------------|
| **Оболочка** — Electron bootstrap, IPC, трей, установщик NSIS | `CodeViper.exe` в Program Files | Новый `CodeViper-Setup-*.exe` (релиз `vX.Y.Z`) |
| **UI + agent runtime** — окно, настройки, tool handlers, промпты | Клон `%APPDATA%/CodeViper/source/app/out` | `git pull` на `master` → сборка → **перезапуск** `.exe` |

Оболочка `.exe` меняется редко. Исправления интерфейса и агента после push на `master` **не требуют** переустановки — достаточно обновления клона и перезапуска (при включённом **«Обновлять runtime с GitHub»**).

### Требования

- **Git for Windows** в PATH — установщик делает `git clone` / `git pull` при установке; без Git установка прервётся.
- Каталог клона создаётся автоматически: **`%APPDATA%/CodeViper/source`** (репозиторий CodeViper целиком, рабочий код в `source/app/`).

### Что происходит при запуске `.exe`

1. При старте (если включено **«Обновлять runtime с GitHub»** в Настройки → Поведение → Автоматизация): `git fetch origin master` и принудительный checkout `master` в `%APPDATA%/CodeViper/source` (локальные правки и ветка `agent/*` от самоулучшения сбрасываются — клон только для runtime).
2. При изменениях в `app/` — `npm install` (при необходимости) и `npm run build` в `source/app` (portable Node из оболочки).
3. Баннер **«Перезапустить для применения»** — после перезапуска handlers и **renderer/preload** загружаются из `source/app/out/`, а не из asar.
4. При ошибке pull/build — лог в `%APPDATA%/CodeViper/logs/`, работа продолжается из встроенного asar (fallback).

### Когда нужен полный релиз установщика

- Первая установка на машине.
- Смена Electron, NSIS, portable Node, подпись, иконки.
- Критичный баг **оболочки** (окно не открывается, IPC, трей).

### Когда релиз **не** нужен

- Фиксы UI (renderer), инструментов агента, handlers, промптов, ROADMAP после push на `master`.
- Документация, skills, collective memory (часто без перезапуска).

### Разработка из исходников

Для разработчиков репозитория — **`CodeViper.cmd`** и `npm run build` в локальном `app/`; live runtime из `%APPDATA%/CodeViper/source` используется **только packaged** `.exe`.

### Авто-релиз оболочки (CI)

После зелёного CI на `master` workflow **auto-shell-release** сравнивает коммиты с последним тегом `v*`. Если затронута только логика агента (handlers, tests, docs) — тег не создаётся. Если изменились renderer, preload, IPC bootstrap, Electron/NSIS — bump `version` в `app/package.json`, **push на master**, тег `vX.Y.Z` и `release.yml`. Если push версии на защищённый `master` не прошёл — job падает, тег **не** создаётся (иначе релиз собирается с orphan-коммита). **Release workflow:** один прогон за раз (`concurrency`), job `prepare` создаёт draft на GitHub, `electron-builder` заливает артефакты в draft (`releaseType: draft`), job `publish` снимает draft после проверки `latest.yml` и `.exe`. Пропуск: `[skip-release]` в сообщении коммита. Классификатор: `scripts/shell-release-paths.mjs`. После публикации на GitHub Releases остаётся **только один** стабильный `v*` — текущий; старые `v*` и любые `nightly-*` удаляются (`scripts/prune-github-releases.mjs`).

### Ручное обновление клона

```powershell
git -C "$env:APPDATA\CodeViper\source" fetch origin master
git -C "$env:APPDATA\CodeViper\source" checkout -f -B master origin/master
cd "$env:APPDATA\CodeViper\source\app"
npm install
npm run build
```

Затем перезапустите CodeViper из ярлыка.

Подробности архитектуры — [architecture.md](architecture.md), [вики](https://github.com/rkfsociety/CodeViper/wiki/Архитектура). Назад в [README](../README.md).
