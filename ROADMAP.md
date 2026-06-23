# Дорожная карта CodeViper

Планы развития и список выполненного. Назад в [README](README.md).

> **Принцип чтения:** задачи сгруппированы в цепочки — внутри каждой группы строгий порядок сверху вниз. Следующий шаг начинать только после завершения предыдущего. Между группами порядок произвольный.


### Формат задач для самообучения агента

Каждый пункт в «📋 В планах» следует **одному шаблону** — агент читает `ROADMAP.md` и строит `set_self_improvement_plan` без уточнений.

**Шаблон пункта:**

```text
N · [S/M/L/XL] · Краткое название
- Цель: один измеримый результат
- Файлы: конкретные пути (app/electron/main/…, app/src/…)
- Действие: одна атомарная правка
- Проверка: npm run typecheck | npm test -- … | сценарий в UI
```

**Промпт:** `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper.`

**Правила:** нумерация сквозная (1…69); внутри цепочки — строго по порядку; один пункт = один прогон самоулучшения; после проверки — `complete_self_improvement_item`.

## 📋 В планах

> Нумерация сквозная. Сложность: S / M / L / XL. Приоритет указан в конце пункта.

### 🔗 Установленный CodeViper — самообновление без краша

### 🔗 node-llama-cpp + Оркестратор

**1 · M · Обёртка nodeLlama.ts** — приор. Low  
- **Цель:** модуль с `loadModel`, `complete`, `unloadModel`, singleton  
- **Файлы:** `app/electron/main/nodeLlama.ts` (новый)  
- **Действие:** реализовать `NodeLlamaHandle`, ленивая инициализация  
- **Проверка:** `npm run typecheck`

**2 · S · Тест nodeLlama** — приор. Low  
- **Цель:** vitest-тест с `TEST_GGUF_PATH`, skip без пути  
- **Файлы:** `app/tests/nodeLlama.test.ts`, `README.md`  
- **Действие:** тест `loadModel → complete → unloadModel`; инструкция в README  
- **Проверка:** `npm test -- nodeLlama` (skip без env)

**3 · M · Выбор GGUF в настройках** — приор. Low  
- **Цель:** кнопка выбора `*.gguf`, путь в `AgentSettings.orchestratorModelPath`  
- **Файлы:** `app/src/components/SettingsModal.tsx`, `app/electron/main/settings.ts`, `app/src/types.ts`  
- **Действие:** `dialog.showOpenDialog` + поле в Zod-схеме  
- **Проверка:** UI сохраняет путь после выбора файла

**4 · L · orchestratorModel.ts** — приор. Low  
- **Цель:** `analyze(message)` → `{ plan, rephrased, isComplex }` JSON без стриминга  
- **Файлы:** `app/electron/main/orchestratorModel.ts` (новый)  
- **Действие:** singleton на `nodeLlama`, парсинг JSON ответа  
- **Проверка:** `npm run typecheck`; unit-тест с моком nodeLlama

**5 · M · Скачивание GGUF по умолчанию** — приор. Low  
- **Цель:** при первом включении оркестратора — загрузка Qwen2.5-1.5B в userData с прогрессом  
- **Файлы:** `app/electron/main/orchestratorModel.ts`, `SettingsModal.tsx`  
- **Действие:** download + `onProgressEvent`; кнопка «Скачать»  
- **Проверка:** прогресс в UI; файл появляется в `userData/orchestrator/`

**6 · S · UI секция «Оркестратор»** — приор. Low  
- **Цель:** тумблер `orchestratorEnabled`, поле `minMessageLength` (80), «Удалить модель»  
- **Файлы:** `SettingsModal.tsx`, `settings.ts`, `types.ts`  
- **Действие:** секция на вкладке «Модель»  
- **Проверка:** настройки сохраняются после перезапуска

**7 · M · Интеграция в AgentRunner** — приор. Low  
- **Цель:** перед прогоном — `analyze()`, plan в системный промпт, rephrased при `isComplex`  
- **Файлы:** `app/electron/main/agent.ts`  
- **Действие:** вызов оркестратора при `orchestratorEnabled`  
- **Проверка:** чип «Планирую…» в `AgentStatusBar`; `npm run typecheck`

### 🔗 P2P-вычисления

> Пункты 9–10 — код сервера в репозитории (`server/p2p/`); деплой VPS — вручную пользователем.

**8 · XL · REST API сигнального сервера** — приор. Low  
- **Цель:** API `POST /nodes/register`, `GET /nodes/available`, `DELETE /nodes/{id}`  
- **Файлы:** `server/p2p/` (новый каталог), `package.json` в корне или в server  
- **Действие:** Node + Express/Fastify + Redis для реестра узлов  
- **Проверка:** `curl` регистрации тестового узла локально

**9 · XL · Auth на сигнальном сервере** — приор. Low  
- **Цель:** JWT после email/GitHub OAuth; лимиты по токену  
- **Файлы:** `server/p2p/auth.ts`  
- **Действие:** регистрация + middleware  
- **Проверка:** запрос без токена → 401

**10 · M · Тумблер «Поделиться мощностью»** — приор. Low  
- **Цель:** UI + `POST /nodes/register` с GPU/RAM/моделью  
- **Файлы:** `SettingsModal.tsx`, `app/electron/main/p2pClient.ts` (новый), `settings.ts`  
- **Действие:** тумблер + регистрация узла  
- **Проверка:** mock-сервер принимает register

**11 · S · Диалог согласия P2P** — приор. Low  
- **Цель:** модалка при первом включении: что передаётся, лимиты, отказ блокирует режим  
- **Файлы:** `app/src/components/P2PConsentModal.tsx` (новый), `SettingsModal.tsx`  
- **Действие:** показ один раз, флаг в settings  
- **Проверка:** без согласия тумблер не активен

**12 · M · Пауза P2P при нагрузке** — приор. Low  
- **Цель:** GPU>20% или CPU>15% → входящие P2P-задачи в паузу  
- **Файлы:** `app/electron/main/agent.ts`, `p2pClient.ts`, `systemStats.ts`  
- **Действие:** проверка перед приёмом задачи  
- **Проверка:** unit-тест с моком systeminformation

**13 · M · Лимит 3 входящих P2P-задач** — приор. Low  
- **Цель:** очередь с таймаутом 60 с, сверх лимита → 503  
- **Файлы:** `app/electron/main/p2pClient.ts`  
- **Действие:** счётчик активных + очередь  
- **Проверка:** тест на отклонение 4-й задачи

**14 · M · TLS + шифрование промптов** — приор. Low  
- **Цель:** WSS между узлами; ECDH для тела промпта  
- **Файлы:** `server/p2p/`, `app/electron/main/p2pClient.ts`  
- **Действие:** TLS certs; симметричный ключ сессии  
- **Проверка:** узел не читает чужой plaintext в логах

**15 · L · Маршрутизация задач на сервере** — приор. Low  
- **Цель:** поиск свободного узла с моделью; иначе `{ fallback: true }`  
- **Файлы:** `server/p2p/router.ts`  
- **Действие:** логика выбора узла  
- **Проверка:** интеграционный тест с 2 mock-узлами

**16 · L · Кредиты P2P в UI** — приор. Low  
- **Цель:** баланс кредитов на сервере, отображение в `AgentStatusBar`  
- **Файлы:** `server/p2p/credits.ts`, `AgentStatusBar.tsx`, `p2pClient.ts`  
- **Действие:** +N/−N за задачи; IPC статуса  
- **Проверка:** баланс обновляется после mock-задачи

### 🔗 Коллективное обучение и UI агента

> База в коде: ветка `agent/self-improve`, `docs/collective/ViperMemory.md`, чип ☁️.

**17 · M · Чеклист плана самоулучшения** — приор. Low  
- **Цель:** sticky чеклист `self_improve_plan` над полем ввода (не только system-msg)  
- **Файлы:** `app/src/components/SelfImprovePlanPanel.tsx`, `ChatPanel.tsx`  
- **Действие:** подписка на `self_improve_plan` stream  
- **Проверка:** пункты done/pending видны при самоулучшении

### ⚡ Независимые задачи

**18 · M · Docker dev-окружение** — приор. Low  
- **Цель:** Dockerfile Node 20 + Ollama; compose с hot reload  
- **Файлы:** `Dockerfile`, `docker-compose.yml`, `README.md`  
- **Действие:** образ + том исходников + `npm run dev`  
- **Проверка:** `docker compose up` поднимает приложение

**19 · M · Режим «Инкогнито»** — приор. Low  
- **Цель:** тумблер в топбаре; чаты и NDJSON-логи только в RAM  
- **Файлы:** `App.tsx`, `chats.ts`, `agentLogger.ts`, `settings.ts`  
- **Действие:** флаг `incognitoMode`; skip persist  
- **Проверка:** после перезапуска история инкогнито-чата пуста

**20 · S · README «Примеры запросов»** — приор. Low  
- **Цель:** 5–7 готовых диалогов (поиск, правка, самоулучшение, веб)  
- **Файлы:** `README.md`  
- **Действие:** новый раздел с промптами  
- **Проверка:** ревью текста

**21 · M · Скринкасты для README** — приор. Low  
- **Цель:** GIF/видео: поиск, самоулучшение, Ollama  
- **Файлы:** `docs/media/` (новый), `README.md`  
- **Действие:** добавить assets + ссылки  
- **Проверка:** файлы в репозитории, README ссылается

**22 · M · CONTRIBUTING.md** — приор. Low  
- **Цель:** диаграмма ReAct, ключевые модули, пример нового инструмента  
- **Файлы:** `CONTRIBUTING.md`  
- **Действие:** mermaid sequence + пошаговый гайд  
- **Проверка:** ревью документа

**23 · M · typedoc + GitHub Pages** — приор. Low  
- **Цель:** `npm run docs` генерирует API из JSDoc; деплой в Actions  
- **Файлы:** `package.json`, `.github/workflows/docs.yml` (новый), `typedoc.json`  
- **Действие:** typedoc config + workflow  
- **Проверка:** `npm run docs` локально без ошибок

### 🔗 Агент и проверки

**24 · S · Whitelist шаблонов команд** — приор. High  
- **Цель:** «Всегда разрешать» для паттернов (`npm test`, `git status`) поверх blocklist  
- **Файлы:** `app/electron/main/services.ts` (`validateCommand`), `settings.ts`, `SettingsModal.tsx` (Безопасность)  
- **Действие:** поле `commandAllowlist: string[]`; проверка allow перед deny  
- **Проверка:** `npm test -- validateCommand`; команда из allowlist не требует подтверждения


## ✅ Сделано

- UI правил проекта: кнопка 📋 в нижней панели чата открывает редактор `.codeviper/rules.md`; загрузка/сохранение через существующий IPC read-file/write-file; подсказка при отсутствии файла; агент учитывает rules.md через memory.ts
- Автопроверка после правок: после успешного `SELF_EDIT_FILE_TOOLS` при включённом `autoVerifyAfterEdit` — запуск `npm run typecheck` + `npm test` через `runCodeViperCommand`; вывод добавляется к tool_result в чате
- Whitelist шаблонов команд: поле `commandAllowlist` в настройках; `validateCommand` проверяет allowlist до blocklist; тесты добавлены
- Режим «Инкогнито»: тумблер в топбаре; чаты и NDJSON-логи только в RAM; после перезапуска история пуста
