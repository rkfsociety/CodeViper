# Защита ветки `master`

Скрипт [`setup-branch-protection.ps1`](setup-branch-protection.ps1) настраивает
правила защиты ветки `master` на GitHub через `gh api`. Запускается один раз
(и повторно при изменении правил).

## Что включается

- **Запрет прямого push** — изменения попадают в `master` только через Pull Request.
- **Обязательный CI** — PR нельзя смержить, пока не прошёл статус-чек `build`
  (job из [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): typecheck → lint → tests → build).
  `strict: true` — ветка PR должна быть актуальна относительно `master`.
- **Ручной approve** — нужно минимум 1 одобрение ревьюера (`dismiss_stale_reviews: true`
  сбрасывает одобрения при новых коммитах).
- **Запрет force-push и удаления** ветки.

## Требования

- Установленный [GitHub CLI](https://cli.github.com) (`gh`).
- Авторизация: `gh auth login` (с правами **администратора** репозитория).

## Запуск

```powershell
# из корня репозитория; репозиторий определится автоматически
./docs/setup-branch-protection.ps1

# с явными параметрами
./docs/setup-branch-protection.ps1 -Repo rkfsociety/CodeViper -Branch master -Approvals 1
```

Проверить результат:

```powershell
gh api repos/rkfsociety/CodeViper/branches/master/protection
```

Снять защиту (если нужно):

```powershell
gh api --method DELETE repos/rkfsociety/CodeViper/branches/master/protection
```

## Важно про автоматизацию

По умолчанию `enforce_admins` **выключен**: правила применяются ко всем, кроме
администраторов. Это сознательно — чтобы автоматизация владельца
(`autoPushSelfEdits` и `commit_and_push_self_edits`, которые пушат прямо в
`master`) продолжала работать под токеном владельца.

Если запустить скрипт с флагом `-EnforceAdmins`, прямой push в `master` будет
запрещён **и владельцу**. Тогда самоправки агента нужно проводить только через
PR-флоу: `create_codeviper_branch` → правки → `commit_and_push_self_edits`
(коммит в ветку `agent/*`) → `create_codeviper_pr`.
