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
| **Оболочка** — Electron bootstrap, IPC, трей, установщик NSIS | `CodeViper.exe` в Program Files | Новый `CodeViper-Setup-*.exe` (релиз `vX.Y.Z`) |
| **UI + agent runtime** — окно, настройки, tool handlers, промпты | Клон `%APPDATA%/CodeViper/source/app/out` | `git pull` на `master` → сборка → **перезапуск** `.exe` |

Оболочка `.exe` меняется редко. Исправления интерфейса и агента после push на `master` **не требуют** переустановки — достаточно обновления клона и перезапуска (при включённом **«Обновлять runtime с GitHub»**).

### Требования

- **Git for Windows** в PATH — установщик делает `git clone` / `git pull` при установке; без Git установка прервётся.
- Каталог клона создаётся автоматически: **`%APPDATA%/CodeViper/source`** (репозиторий CodeViper целиком, рабочий код в `source/app/`).

### Что происходит при запуске `.exe`

1. При старте (если включено **«Обновлять runtime с GitHub»** в Настройки → Поведение → Автоматизация): `git pull --ff-only` в `%APPDATA%/CodeViper/source`.
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

После зелёного CI на `master` workflow **auto-shell-release** сравнивает коммиты с последним тегом `v*`. Если затронута только логика агента (handlers, tests, docs) — тег не создаётся. Если изменились renderer, preload, IPC bootstrap, Electron/NSIS — автоматически `vX.Y.Z` и сборка установщика. Пропуск: `[skip-release]` в сообщении коммита. Классификатор: `scripts/shell-release-paths.mjs`. После публикации релиза CI оставляет **5 последних** стабильных `v*` на GitHub Releases, остальные удаляются (`scripts/prune-github-releases.mjs`).

### Ручное обновление клона

```powershell
git -C "$env:APPDATA\CodeViper\source" pull --ff-only
cd "$env:APPDATA\CodeViper\source\app"
npm install
npm run build
```

Затем перезапустите CodeViper из ярлыка.

### Nightly-сборки (Beta)

Каждый день в **00:00 UTC** workflow [`.github/workflows/nightly.yml`](https://github.com/rkfsociety/CodeViper/blob/master/.github/workflows/nightly.yml) собирает установщики **так же**, как стабильный Release: черновик релиза → три платформы → публикация. Тег `nightly-YYYY-MM-DD`, предыдущие nightly удаляются.

В приложении: **Настройки → Beta-версии** — канал `beta` и `allowPrerelease` подхватывают nightly с GitHub Releases.

Перед сборкой nightly подменяет `app/package.json` → `version: YYYY.MM.DD`; артефакты загружаются в тег `nightly-YYYY.MM.DD` через `gh release upload` (не в стабильный `vX.Y.Z`).

Ручной прогон: **Actions → Nightly Release → Run workflow**.

Подробности архитектуры — [architecture.md](architecture.md), [вики](https://github.com/rkfsociety/CodeViper/wiki/Архитектура). Назад в [README](../README.md).
