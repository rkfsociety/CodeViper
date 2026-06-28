# Память проекта (уроки и решения)

Краткие записи после разбора багов и инцидентов. Агент читает этот файл при работе в репозитории.

Формат: `YYYY-MM-DD · тема — суть`

---

- **2026-06-28 · GitHub issues** — в коммите писать `closes #N` или `fix #N`; упоминание `(issue #22)` issue не закрывает. Если фикс уже в master — `gh issue close N`.
- **2026-06-27 · grep/list самоулучшение** — `grep_codeviper_files` / `grep_files` падали на `undefined.trim()` без `query`; `list_codeviper_directory` давал `app/app/…` — исправлено `normalizeCodeViperPath` + optional chaining (ab39a66).
