<p align="center">
  <img src="app/resources/icon.png" alt="CodeViper" width="96" />
</p>

<h1 align="center">CodeViper</h1>

<p align="center">
  Локальный AI-агент для программирования с графическим интерфейсом.<br>
  Работает через <a href="https://ollama.com">Ollama</a> или облачные API — без подписок, без слежки.
</p>

<p align="center">
  <a href="https://github.com/rkfsociety/CodeViper/releases"><img src="https://img.shields.io/github/v/release/rkfsociety/CodeViper?style=flat-square&color=7EE787&label=релиз" alt="Release" /></a>
  <img src="https://img.shields.io/badge/платформа-Windows-0078D4?style=flat-square" alt="Windows" />
  <img src="https://img.shields.io/badge/Electron-36-47848F?style=flat-square" alt="Electron" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/лицензия-MIT-A371F7?style=flat-square" alt="MIT" /></a>
</p>

---

Вы описываете задачу — агент сам читает файлы, вносит правки, запускает команды и отчитывается. Работает локально через Ollama или подключается к DeepSeek, OpenAI, Anthropic, Gemini, OpenRouter. Для Claude (Anthropic) системный промпт и каталог инструментов кэшируются между шагами ReAct (`cache_control: ephemeral`) — ниже стоимость и латентность облачных запросов. Перед первым изменяющим инструментом прогона сохраняется git-чекпоинт; кнопка **«Откатить всё»** в чате возвращает проект к исходному состоянию. API-ключи и значения из `.env` автоматически маскируются (`***REDACTED***`) в логах, облачном контексте и коллективной памяти. В поле ввода чата `@` открывает автодополнение путей файлов проекта (как в Cursor).

## Быстрый старт

**Требования:** Windows 10/11, [Node.js 18+](https://nodejs.org), 8 ГБ RAM.

```powershell
git clone https://github.com/rkfsociety/CodeViper.git
cd CodeViper/app && npm install
```

Для сборки установщика (`npm run dist`) portable Node.js LTS скачивается автоматически в `app/resources/node/` (`npm run setup-node`) и включается в дистрибутив в папку `node/`.

Затем двойной клик на **`CodeViper.cmd`** в корне репозитория.

Если при запуске появляется ошибка «npm run start завершился с кодом 1» — запустите **`CodeViper.cmd console`**: лаунчер пересоберёт `out/`, если исходники новее сборки, и покажет полный лог в окне. Подробности — в `%LOCALAPPDATA%\CodeViper\dev.log`.

## Примеры запросов

Скопируйте промпт в чат — агент сам выберет инструменты (поиск, правка, команды, веб). В поле ввода `@` подставляет путь к файлу проекта.

### Поиск по коду

**Вы:** Где в проекте вызывается `loadSettings` и что возвращает эта функция?

**Агент:** `grep_files` / `search_in_project` → `read_file` в `settings.ts` → краткий ответ со списком вызовов и сигнатурой.

---

**Вы:** Найди все React-компоненты, в названии которых есть `Modal`, и перечисли их пропсы.

**Агент:** `find_files` по `*Modal*.tsx` → `read_multiple_files` → таблица «компонент → пропсы».

### Правка файлов

**Вы:** В `AgentStatusBar.tsx` добавь тултип к чипу P2P: «Баланс кредитов P2P-сети». Не трогай остальную логику.

**Агент:** `read_file` → `edit_file` → `npm run typecheck` в `app/` → отчёт об изменении.

---

**Вы:** Тест `contextLimits.test.ts` падает на Windows — найди причину и почини.

**Агент:** `run_command` (`npm test -- contextLimits`) → анализ вывода → правка → повторный прогон теста.

### Самоулучшение CodeViper

**Вы:** Выполни пункт 6 из ROADMAP.md — самоулучшение CodeViper.

**Агент:** читает пункт (цель / файлы / действие / проверка) → `set_self_improvement_plan` → правки → `npm run typecheck` и `npm run build` → коммит в `agent/self-improve` → перенос пункта в «✅ Сделано».

---

**Вы:** Прочитай ROADMAP.md и предложи три самых простых пункта для первого самоулучшения. Ничего не меняй.

**Агент:** `read_file` → разбор пунктов `[S]` → список с обоснованием сложности.

### Веб и внешние API

**Вы:** Найди в документации Fastify 5, как включить rate limit, и покажи минимальный пример для нашего `server/p2p/`.

**Агент:** `web_search` → `read_file` в `server/p2p/` → фрагмент кода с пояснением (без коммита, если не просили).

---

**Вы:** Какие breaking changes в Electron 36 по сравнению с 35? Есть ли что-то критичное для `BrowserWindow`?

**Агент:** `web_search` по релиз-нотам → сводка по пунктам, релевантным для `app/electron/main/`.

### Git и команды

**Вы:** Покажи `git diff` по незакоммиченным файлам в `app/electron/main/` и кратко опиши, что изменилось.

**Агент:** `git_status` → `git_diff` с фильтром пути → человекочитаемое резюме.

## Документация

Подробности — в [вики проекта](https://github.com/rkfsociety/CodeViper/wiki):

- [🚀 Быстрый старт](https://github.com/rkfsociety/CodeViper/wiki/Быстрый-старт)
- [🤖 Провайдеры моделей](https://github.com/rkfsociety/CodeViper/wiki/Провайдеры-моделей)
- [🛠 Инструменты агента](https://github.com/rkfsociety/CodeViper/wiki/Инструменты-агента)
- [🧠 Память и самообучение](https://github.com/rkfsociety/CodeViper/wiki/Память-и-самообучение)
- [🏗 Архитектура](https://github.com/rkfsociety/CodeViper/wiki/Архитектура)
- [📋 Дорожная карта](ROADMAP.md) — 24 задачи в формате для самообучения (цель / файлы / действие / проверка); промпт: `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper`

Поддержка MCP-серверов: настройки → «Интеграции» → MCP; инструменты с префиксом `mcp_`, вызов `/tools/call` и отправка результата на `/tools/result`.

P2P «Поделиться мощностью»: настройки → «Интеграции»; ECDH-шифрование промптов; маршрутизация `POST /tasks/route`; баланс кредитов в статус-баре агента (чип **⚡ P2P N кр.**), списание/начисление при relay задачи.

Самоулучшение: автоправки коммитятся в ветку `agent/self-improve` (настраивается в «Поведение → Автоматизация»), не в `master`. Задачи — [ROADMAP.md](ROADMAP.md): пункт «N · …» + цель/файлы/действие/проверка; промпт `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper`.

Коллективная память: глобальные знания автоматически синхронизируются в `docs/collective/ViperMemory.md` на GitHub; в статус-баре агента — чип **☁️ Память → agent/self-improve**.

**Автообновление:** установщик (packaged) — `electron-updater` + GitHub Releases, баннер «Перезапустить и обновить»; разработка из исходников — git fetch `app/` и перезапуск через лаунчер.

Перед запуском агента в Node-проекте проверяется наличие `node_modules` **только если** в `package.json` объявлены зависимости (`dependencies`, `devDependencies` и т.д.) — пустой `package.json` не блокирует запрос.

## Разработка и тесты

```bash
cd app
npm test                    # все unit-тесты
npm test -- nodeLlama       # тесты модуля nodeLlama (unit, без GGUF)
```

Интеграционные тесты `nodeLlama` пропускаются без `TEST_GGUF_PATH`. Для запуска с реальной моделью:

```bash
TEST_GGUF_PATH=/path/to/model.gguf npm test -- nodeLlama
```

После `npm install` нативный модуль нужно собрать: `npm run rebuild`.

## Участие

Баги и предложения — в [Issues](https://github.com/rkfsociety/CodeViper/issues). PR приветствуются.

## Лицензия

[MIT](LICENSE)
