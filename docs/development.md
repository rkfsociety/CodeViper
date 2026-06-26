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

Интеграционные тесты `nodeLlama` пропускаются без `TEST_GGUF_PATH`:

```bash
TEST_GGUF_PATH=/path/to/model.gguf npm test -- nodeLlama
```

После `npm install` нативный модуль: `npm run rebuild`.

## Обновление без переустановки (live runtime)

### Установка vs live runtime

| Компонент | Где живёт | Как обновляется |
|-----------|-----------|-----------------|
| **Оболочка** — окно, IPC, трей, установщик NSIS | `CodeViper.exe` в Program Files | Новый `CodeViper-Setup-*.exe` (релиз `vX.Y.Z`) |
| **Agent runtime** — tool handlers, промпты, ROADMAP-логика | Клон `%APPDATA%/CodeViper/source/app` | `git pull` на `master` → сборка → **перезапуск** `.exe` |

Оболочка меняется редко. Исправления агента после блока 0 **не требуют** переустановки — достаточно обновления клона и перезапуска приложения.

### Требования

- **Git for Windows** в PATH — установщик делает `git clone` / `git pull` при установке; без Git установка прервётся.
- Каталог клона создаётся автоматически: **`%APPDATA%/CodeViper/source`** (репозиторий CodeViper целиком, рабочий код в `source/app/`).

### Что происходит при запуске `.exe`

1. При старте (если включено **«Обновлять runtime с GitHub»** в Настройки → Поведение → Автоматизация): `git pull --ff-only` в `%APPDATA%/CodeViper/source`.
2. При изменениях в `app/` — `npm install` (при необходимости) и `npm run build` в `source/app` (portable Node из оболочки).
3. Баннер **«Перезапустить для применения»** — после перезапуска handlers загружаются из `source/app/out/main/runtimeHandlers.js`, а не из asar.
4. При ошибке pull/build — лог в `%APPDATA%/CodeViper/logs/`, работа продолжается из встроенного asar (fallback).

### Когда нужен полный релиз установщика

- Первая установка на машине.
- Смена Electron, NSIS, portable Node, подпись, иконки.
- Критичный баг **оболочки** (окно не открывается, IPC, трей).

### Когда релиз **не** нужен

- Фиксы инструментов агента, handlers, промптов, ROADMAP после push на `master`.
- Документация, skills, collective memory (часто без перезапуска).

### Разработка из исходников

Для разработчиков репозитория — **`CodeViper.cmd`** и `npm run build` в локальном `app/`; live runtime из `%APPDATA%/CodeViper/source` используется **только packaged** `.exe`.

### Авто-релиз оболочки (CI)

После зелёного CI на `master` workflow **auto-shell-release** сравнивает коммиты с последним тегом `v*`. Если затронута только логика агента (handlers, tests, docs) — тег не создаётся. Если изменились renderer, preload, IPC bootstrap, Electron/NSIS — автоматически `vX.Y.Z` и сборка установщика. Пропуск: `[skip-release]` в сообщении коммита. Классификатор: `scripts/shell-release-paths.mjs`.

### Ручное обновление клона

```powershell
git -C "$env:APPDATA\CodeViper\source" pull --ff-only
cd "$env:APPDATA\CodeViper\source\app"
npm install
npm run build
```

Затем перезапустите CodeViper из ярлыка.

Подробности архитектуры — [architecture.md](architecture.md), [вики](https://github.com/rkfsociety/CodeViper/wiki/Архитектура). Назад в [README](../README.md).
