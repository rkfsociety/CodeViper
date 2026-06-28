# Память проекта (уроки и решения)

Краткие записи после разбора багов и инцидентов. Агент читает этот файл при работе в репозитории.

Формат: `YYYY-MM-DD · тема — суть`

---

- **2026-06-28 · trace-reports** — JSON из `%APPDATA%\codeviper\traces\` пользователь шлёт, чтобы **починить агента CodeViper** (подсказки, редирект read_file→read_codeviper_file, валидация create/edit), а не чтобы Cursor выполнил ROADMAP за него. См. `.cursor/rules/trace-reports.mdc`.
- **2026-06-28 · GitHub issues** — если проблемы issue решены и фикс в master: **закрыть issue** (`closes #N` / `fix #N` в коммите с кодом, иначе `gh issue close N --comment "…"`). Упоминание `(issue #N)` issue не закрывает. После фикса trace-report — проверить, что ошибки устранены, и закрыть в том же прогоне или сразу после merge.
- **2026-06-27 · grep/list самоулучшение** — `grep_codeviper_files` / `grep_files` падали на `undefined.trim()` без `query`; `list_codeviper_directory` давал `app/app/…` — исправлено `normalizeCodeViperPath` + optional chaining (ab39a66).
