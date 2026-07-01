# Интеграции и автоматизация

> Дополнение к [вики](https://github.com/rkfsociety/CodeViper/wiki). Подробности по инструментам — [Инструменты агента](https://github.com/rkfsociety/CodeViper/wiki/Инструменты-агента).

Кратко о возможностях, которые не помещаются в [README](../README.md). Назад в [README](../README.md).

## LiteRouter

Настройки → «Модель» → `LiteRouter`.

Для текстовых моделей используется OpenAI-совместимый proxy:

- Base URL: `https://api.literouter.com/v1`
- API key: ключ LiteRouter
- Стартовая модель: `deepseek:free`

CodeViper сохраняет LiteRouter как отдельный облачный провайдер, а не через `custom`, поэтому у него свои поля API key / base URL и отдельный выбор в списке провайдеров.

## MCP

Настройки → «Интеграции» → MCP.

**HTTP-серверы:** URL и «+ Добавить» — инструменты с префиксом `mcp_`, манифест `/.well-known/mcp`, вызов `/tools/call` и отправка результата на `/tools/result`.

**Шаблоны stdio:** кнопки **+ filesystem** и **+ fetch** добавляют в `settings.json` готовый JSON (формат Cursor `mcp.json`: `command`, `args`, опционально `env`). Для `filesystem` в `args` подставляется путь текущего проекта чата или `.`. Запись сохраняется в поле `mcpStdioServers`; удаление — кнопка «Удалить» у карточки шаблона.

## P2P «Поделиться мощностью»

Настройки → «Интеграции». ECDH-шифрование промптов, маршрутизация `POST /tasks/route`, баланс кредитов в статус-баре (чип **⚡ P2P N кр.**), списание/начисление при relay задачи.

## Самоулучшение

Автоправки CodeViper коммитятся в ветку `agent/self-improve` (настраивается в «Поведение → Автоматизация»), не в `master`. Примеры сценариев — [example-prompts.md](example-prompts.md).

## Коллективная память

Глобальные знания синхронизируются в `docs/collective/ViperMemory.md` на GitHub; в статус-баре — чип **☁️ Память → agent/self-improve**.

**Нужно одно из двух:** git-клон CodeViper (авто: при первой синхронизации `git clone` в `%APPDATA%/CodeViper/source`, как установщик; dev-клон; или вручную «Корень git-репозитория») **или** авторизация GitHub — `gh auth login` (scope `repo`) **или** Personal Access Token в Настройки → Интеграции. Путь `gitRepoRoot` прописывается автоматически после успешного clone.

## Автообновление

Установщик (packaged): `electron-updater` + GitHub Releases — первая проверка через 5 с после запуска, далее каждые **30 минут**; баннер с прогрессом загрузки (%, объём, скорость, ETA) и кнопкой «Перезапустить и обновить». **Windows:** `CodeViper-Setup-*.exe` требует UAC (установка для всех пользователей, `perMachine`). Перед установкой приложение завершает воркеры и агентов; на Windows при сбое `quitAndInstall` запускается установщик из `%LOCALAPPDATA%\codeviper-updater\pending\`. Лог: `%APPDATA%\CodeViper\logs\update-*.ndjson`. Разработка из исходников: git fetch каждые **10 минут** и перезапуск через лаунчер.

## Прочее

- **Claude:** system + tools кэшируются (`cache_control: ephemeral`) — ниже стоимость облачных запросов.
- **Git-чекпоинт:** перед первым изменяющим инструментом — stash; кнопка **«Откатить всё»** в чате.
- **Секреты:** API-ключи и `.env` маскируются (`***REDACTED***`) в логах и контексте.
- **`node_modules`:** проверяется только если в `package.json` есть зависимости — пустой файл не блокирует запрос.
