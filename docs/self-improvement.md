# Самообучение и саморедактирование

## Память и навыки

| Что | Где хранится |
|---|---|
| Глобальные знания | `%APPDATA%/CodeViper/ViperMemory.md` |
| Знания проекта | `{проект}/.codeviper/ViperMemory.md` |
| Правила проекта | `{проект}/.codeviper/rules.md` |
| Навыки (skills) | `%APPDATA%/CodeViper/ViperSkills.md` |
| Данные навыков | `%APPDATA%/CodeViper/skill-data/` |
| Семантический индекс | `{проект}/.codeviper/embeddings.json` |

**Встроенные навыки** (`viper-*`): `viper-agent-core`, `viper-files`, `viper-codebase`, `viper-terminal`, `viper-git`, `viper-skills`, `viper-memory`, `viper-self-edit`, `viper-self-improvement`, `viper-model-training`. Удалить нельзя.

Перед задачей агент подгружает релевантные знания и навыки в системный промпт. Инструменты: `remember`, `search_memory` (векторный если установлен `nomic-embed-text`, иначе ключевые слова), `forget`, `create_skill`, `update_skill`.

После задачи **с изменениями** — автоматическая рефлексия (если включено «Самообучение»).

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

Агент войдёт в режим автономного самоулучшения:
1. Изучит исходники
2. Создаст план через `set_self_improvement_plan` (3–8 пунктов)
3. Выполняет пункты до конца (`complete_self_improvement_item`)
4. Останавливается когда все пункты done или достигнут лимит шагов

Прогресс отображается системными сообщениями в чате.

## Адаптация моделей Ollama

CodeViper не делает GPU fine-tuning, но может создать **производную модель** из примеров:

1. Подготовь JSON/JSONL: `[{"user":"…","assistant":"…"}]` → `.codeviper/training/examples.json`
2. В чате: «обучи модель на examples.json» или «создай модель my-coder из qwen2.5-coder:7b»
3. Агент вызовет `preview_ollama_modelfile`, затем `create_ollama_model`
4. Выбери новую модель в Настройках
