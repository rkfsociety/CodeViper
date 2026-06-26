# Самообучение и саморедактирование

> **Актуальная версия — [вики · Память и самообучение](https://github.com/rkfsociety/CodeViper/wiki/Память-и-самообучение).**

## Память и навыки

| Что | Где хранится |
|---|---|
| Глобальные знания | `%APPDATA%/CodeViper/ViperMemory.md` |
| Коллективные знания (все пользователи) | `docs/collective/ViperMemory.md` в репозитории → git ветка `agent/self-improve` |
| Знания проекта | `{проект}/.codeviper/ViperMemory.md` |
| Правила проекта | `{проект}/.codeviper/rules.md` |
| Навыки (skills) | `%APPDATA%/CodeViper/ViperSkills.md` |
| Данные навыков | `%APPDATA%/CodeViper/skill-data/` |
| Семантический индекс | `{проект}/.codeviper/embeddings.json` |

**Встроенные навыки** (`viper-*`): `viper-agent-core`, `viper-files`, `viper-codebase`, `viper-terminal`, `viper-git`, `viper-skills`, `viper-memory`, `viper-self-edit`, `viper-self-improvement`, `viper-model-training`. Удалить нельзя.

Перед задачей агент подгружает релевантные знания и навыки в системный промпт. Инструменты: `remember`, `search_memory` (векторный если установлен `nomic-embed-text`, иначе ключевые слова), `forget`, `create_skill`, `update_skill`.

После задачи **с изменениями** — автоматическая рефлексия (если включено «Самообучение»).

**Коллективная память:** глобальные знания (`remember`, рефлексия) при включённой настройке «Коллективная память на GitHub» автоматически дописываются в `docs/collective/ViperMemory.md` и пушатся в ветку `agent/self-improve`. Нужен git-клон репозитория или GitHub Token (`repo`) — см. [integrations.md](integrations.md). Все установки CodeViper подгружают этот файл в контекст агента.

## Саморедактирование CodeViper

Агент может улучшать **собственный код**:

| Инструмент | Действие |
|---|---|
| `read_codeviper_file` | Читать исходники |
| `list_codeviper_directory` | Структура приложения |
| `grep_codeviper_files`, `find_codeviper_files` | Поиск в коде |
| `create_codeviper_file` | Новый файл в `app/` |
| `edit_codeviper_file` | Точечная правка (old → new) |
| `write_codeviper_file` | Полная перезапись |
| `append_codeviper_file` | Дописать в конец |
| `run_codeviper_command` | Тесты: `npm run typecheck`, `npm test` |

После правок `electron/main/*` нужен **перезапуск** приложения.

## Автономное самоулучшение

```
Изучи код и начни улучшать себя
```

или по дорожной карте:

```
Выполни пункт N из ROADMAP.md — самоулучшение CodeViper
```

### Дорожная карта (ROADMAP.md)

Все задачи в разделе «📋 В планах» оформлены для самообучения:

```text
N · [S/M/L/XL] · Название — приор. High|Medium|Low
- Цель: один измеримый результат
- Файлы: app/electron/main/…, app/src/…
- Действие: одна атомарная правка
- Проверка: npm run typecheck | npm test -- … | UI
```

- **Сквозная нумерация** 1…N по всему разделу; после выполнения пункта — удалить из «В планах», перенумеровать с 1, запись в «✅ Сделано».
- **Цепочки** (`### 🔗 …`) — порядок строго сверху вниз.
- **Независимые** (`### ⚡ …`) — порядок произвольный.

### Цикл агента

Агент войдёт в режим автономного самоулучшения:

1. `read_codeviper_file` → `ROADMAP.md` (если задан пункт N) + файлы из поля **Файлы**
2. `set_self_improvement_plan` — шаги из **Действие** и **Проверка** (3–8 пунктов)
3. Правки кода → `run_codeviper_command` по **Проверке**
4. `complete_self_improvement_item` после каждого шага
5. Пункт ROADMAP переносится в «✅ Сделано»; автопуш в ветку `agent/self-improve`

Прогресс: системные сообщения в чате; план — `get_self_improvement_plan` (UI-чеклист — пункт ROADMAP 30).

## Адаптация моделей Ollama

CodeViper не делает GPU fine-tuning, но может создать **производную модель** из примеров:

1. Подготовь JSON/JSONL: `[{"user":"…","assistant":"…"}]` → `.codeviper/training/examples.json`
2. В чате: «обучи модель на examples.json» или «создай модель my-coder из qwen2.5-coder:7b»
3. Агент вызовет `preview_ollama_modelfile`, затем `create_ollama_model`
4. Выбери новую модель в Настройках
