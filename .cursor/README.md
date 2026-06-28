# Память и правила агента CodeViper

Cursor подхватывает контекст из этого каталога автоматически.

## Где что лежит

| Файл / каталог | Назначение |
|----------------|------------|
| **`.cursor/rules/*.mdc`** | Постоянные правила агента (`alwaysApply: true` или по `globs`) |
| **`.cursor/skills/*/SKILL.md`** | Skills для явного вызова (`/trace-debug`, `@trace-debug`) |
| **`.cursor/memories.md`** | Уроки из багов и инцидентов — дополнять после разбора |
| **`AGENTS.md`** | ROADMAP, самоулучшение, формат задач |
| **`CLAUDE.md`** | Полная архитектура, TS, команды разработки |

## Правила (`.cursor/rules/`)

| Файл | Когда |
|------|--------|
| `agent-workflow.mdc` | Git, сборка, коммит, пуш, язык ответов |
| `roadmap.mdc` | ROADMAP / ROADMAP_DONE, переиндексация |
| `github-issues.mdc` | Закрытие issues через `closes #N` |
| `large-tasks-decompose.mdc` | Большие задачи → только в ROADMAP |
| `user-launch.mdc` | Проверка UI через установленный `.exe` |
| `release-workflow.mdc` | Релиз оболочки, теги, CI |
| `versioning.mdc` | Когда менять `version` |
| `readme.mdc` | Актуальность README |
| `portable-node.mdc` | Portable Node для самопересборки |
| `typescript-app.mdc` | Код в `app/` — архитектура и TS |
| `trace-reports.mdc` | Трейсы — чинить агента, не ROADMAP за CodeViper |

## Skills (`.cursor/skills/`)

| Skill | Вызов | Назначение |
|-------|-------|------------|
| `trace-debug` | `/trace-debug` или `@trace-debug` | Разбор JSON-трейсов CodeViper, фикс агента + тест + memories |

## Как добавить «память»

1. **Повторяющееся правило** → новый или правка `.mdc` в `rules/`.
2. **Разовый урок** (баг, инцидент, «запомни») → строка в `memories.md` с датой.
3. **Архитектура / детали кода** → `CLAUDE.md` или `docs/`.

После правок в `rules/` или `memories.md` — коммит и пуш (пользователь тянет runtime с GitHub).
