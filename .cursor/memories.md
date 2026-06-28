# Память проекта (уроки и решения)

Краткие записи после разбора багов и инцидентов. Агент читает этот файл при работе в репозитории.

Формат: `YYYY-MM-DD · тема — суть`

---

- **2026-06-28 · trace 1782654852109** — ROADMAP п.1 (custom endpoint): 49 шагов / 1.8M ток → 429 OpenRouter; `grep_files` по `src/`/`electron/` давал «0 файлов» (искал в корне репо, не в app/); nudge «разведки» срабатывал один раз. Исправлено: `src/` в codeviper-путях, `grep_files`→`grep_codeviper_files` в самоулучшении, повтор nudge + abort на шаге 20.
- **2026-06-28 · trace 1782649828488** — самоулучшение ROADMAP п.1: агент искал несуществующий `ModelTab/providers/` и `src/` проекта вместо `read_codeviper_file`; прогон оборвался на DeepSeek HTTP 402 (2.5M токенов). Исправлено: корректные пути в ROADMAP, `resolveRoadmapFileHints` в `read_roadmap_item`, `ProviderBillingError` для 402.
- **2026-06-28 · GitHub issues** — если проблемы issue решены и фикс в master: **закрыть issue** (`closes #N` / `fix #N` в коммите с кодом, иначе `gh issue close N --comment "…"`). Упоминание `(issue #N)` issue не закрывает. После фикса trace-report — проверить, что ошибки устранены, и закрыть в том же прогоне или сразу после merge.
- **2026-06-27 · grep/list самоулучшение** — `grep_codeviper_files` / `grep_files` падали на `undefined.trim()` без `query`; `list_codeviper_directory` давал `app/app/…` — исправлено `normalizeCodeViperPath` + optional chaining (ab39a66).
