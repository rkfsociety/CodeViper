# Память и правила агента CodeViper

Cursor подхватывает контекст из этого каталога автоматически.

## Где что лежит

| Файл / каталог | Назначение |
|----------------|------------|
| **`.cursor/rules/*.mdc`** | Постоянные правила агента (`alwaysApply: true` или по `globs`) |
| **`.cursor/skills/*/SKILL.md`** | Skills: авто-подключение по описанию или явный вызов (`/trace-debug`) |
| **`.cursor/README.md`** | Память из багов и инцидентов, а также короткие правила |
| **`AGENTS.md`** | ROADMAP, самоулучшение, формат задач |
| **`CLAUDE.md`** | Полная архитектура, TS, команды разработки |

## Правила (`.cursor/rules/`)

| Файл | Когда |
|------|--------|
| `agent-workflow.mdc` | Git: **коммит всегда**, push по запросу; сборка; язык ответов |
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
| `trace-debug` | авто при трейсе / `trace-report`; также `/trace-debug` | Разбор JSON-трейсов CodeViper, фикс агента + тест + memories |

## Как добавить «память»

1. **Повторяющееся правило** → новый или правка `.mdc` в `rules/`.
2. **Разовый урок** (баг, инцидент, «запомни») → строка в этом файле с датой.
3. **Архитектура / детали кода** → `CLAUDE.md` или `docs/`.

После правок в `rules/` или этом файле — коммит; **push только по запросу** (runtime тянется с GitHub после push + pull в source).

## Память

2026-06-29 · **Git: коммит всегда, push по запросу** — пользователь (roman): после каждой задачи **обязательно `git commit`**; **`git push` только по явной просьбе**. Без push — напоминать про push + pull в `%APPDATA%\CodeViper\source`. Правила: `agent-workflow.mdc`, `AGENTS.md`, `CLAUDE.md`.

2026-06-30 · **Не сообщать про bypass branch rules после успешного push** — пользователь (roman): репозиторий его собственный; если `git push` в `master` уже прошёл, не писать отдельно про bypass branch rules, обязательный PR или check `build`. Правило: `agent-workflow.mdc`.

2026-06-29 · trace 1782748787537 — aria-live ROADMAP (qwen2.5-coder:7b, копипаст тела пункта): `app/components/` вместо `src/components/`; scope nudge «edit без read»; `create_codeviper_file` без content → trim crash; `set_self_improvement_plan` с `item_id`; 10× edit без old_string. Исправлено: автоплан при `isRoadmapItemBodyTask`, `components/`→`src/components/`, ENOENT hint с find, валидация content, scope nudge с find/read, ошибка item_id vs items.

2026-06-29 · runtime 7B/self-improve — preflight ListModels перед прогоном (`ModelPreflightError`, 404); детектор pseudo tool calls (`Инструмент X:`, inline JSON name/arguments); text-plan в self-improve → nudge+retry без incrementAttempt; `agentPromptLayers` — core для ≤8B, extended только ≥14B.

2026-06-29 · trace 1782686538797 (follow-up) — оркестратор: `responseMentionsToolsWithoutCall` → retry + `injectHardToolCallingSystemHint`, abort после 3 симуляций; compact nudges/prompts для моделей ≤8B (`isCompactPromptModel`).

2026-06-29 · e2e chat startup — `app/e2e/chat.test.ts` нельзя завязывать на хрупкий текстовый заголовок `Агент`/`Недавние` сразу после старта; для проверки чата нужно сначала открыть активный чат и ждать `section.panel-main textarea` / `model-picker-btn`, а историю чатов проверять через `section.panel-history .panel-header`.

2026-06-29 · ROADMAP UTF-8 incident — `ROADMAP.md` и хвост `ROADMAP_DONE.md` были испорчены через Windows/PowerShell pipeline: русский текст стал символами замены. Для ROADMAP запрещены shell-pipeline rewrite и `Out-String`; читать/писать только скриптом с явным UTF-8, после правки проверять отсутствие `U+FFFD`/серий вопросительных знаков/символов замены, последовательную нумерацию, счётчики README/ROADMAP, диапазоны S/M/L и `git diff --check`.

2026-06-30 В· user preference — не предлагать пользователю опциональные «следующим шагом могу...» или похожие развилки, если можно просто сразу исправить/починить проблему. При наличии исправления действовать без запроса подтверждения и без лишних развилок.

2026-06-30 В· hotkeys App.tsx — все горячие клавиши сосредоточены в едином `keydown`-обработчике в `app/src/App.tsx`; для разбора часто смотреть ветку `Ctrl+P`, `Ctrl+,`, `Ctrl+K`, `Ctrl+Shift+N`, `Ctrl+Shift+T`, `Ctrl+B`, `Ctrl+\`` и `?` вместе с `KeyboardShortcutsModal`.

2026-06-30 В· roadmap self-improvement — если пользователь присылает пункт из ROADMAP.md, это означает задачу на реализацию в агенте CodeViper, а не только на текстовый отчёт; сначала проверить, существует ли нужный tool/handler, и если нет — добавить его в код.

2026-06-30 В· roadmap encoding safety — длинные PowerShell-команды с кириллицей могут ломать текст в ROADMAP.md и ROADMAP_DONE.md; для таких правок безопаснее пересобирать файлы из чистой версии `git HEAD`, а не править их через длинные inline-строки.

2026-07-01 В· roadmap rewrite safety — если `ROADMAP/*.md` или `ROADMAP_DONE.md` начинают превращаться в `?`/mojibake, не править их shell-пайпами или массовыми replace. Правильный путь: полностью переписать файл чистым UTF-8 через один `apply_patch`, затем проверить чтение UTF-8-aware скриптом, пересчитать пункты/нумерацию и только потом коммитить.
