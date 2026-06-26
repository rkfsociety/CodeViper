# `.codeviperignore`

Файл в **корне проекта** — glob-паттерны, которые агент не видит в `list_directory` и дереве файлов в UI.

Читается **после** `.gitignore`, `.claudeignore` и `.cursorignore` (все источники объединяются).

## Пример

```gitignore
# Секреты и артефакты только для CodeViper
.env.local
**/secrets/
dist/
```

Один паттерн на строку; строки с `#` — комментарии.

## Где действует

- `list_directory` / `buildFileTree`
- панель дерева проекта (`ProjectTreePanel`)

`find_files` и `grep_files` пока **не** фильтруют по `.codeviperignore`.
