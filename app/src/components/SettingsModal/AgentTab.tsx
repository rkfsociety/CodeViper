import styles from './SettingsModal.module.css'
import type { AgentSettings } from '../../types'
import { SettingItem } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function AgentTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  if (!isActive && !isSearching) return null

  return (
    <>
      <SettingItem
        tab="agent"
        label="Поведение агента"
        desc="уточняющие вопросы глубокое рассуждение reasoning исключать только чтение readonly clarify deep план planBeforeExecute оркестратор"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Поведение агента</div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.planBeforeExecute === true}
              onChange={(e) =>
                onSettingsChange({ planBeforeExecute: e.target.checked || undefined })
              }
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Сначала показать план</span>
              <span className={styles.desc}>
                Основная модель формирует нумерованный план до вызова инструментов; выполнение
                начинается после подтверждения. Если включён оркестратор (вкладка «Модель») — план
                строит модель планировщика
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.clarifyMode === true}
              onChange={(e) => onSettingsChange({ clarifyMode: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Уточняющие вопросы</span>
              <span className={styles.desc}>
                При неоднозначной задаче агент сначала задаёт вопросы, а потом приступает
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.deepReasoning === true}
              onChange={(e) => onSettingsChange({ deepReasoning: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Глубокое рассуждение</span>
              <span className={styles.desc}>
                Для think-моделей (qwen3, deepseek-r1, qwq) включает режим рассуждения, для
                остальных усиливает промпт. Точнее, но медленнее
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.excludeThinkingFromHistory !== false}
              onChange={(e) => onSettingsChange({ excludeThinkingFromHistory: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Исключать reasoning из истории</span>
              <span className={styles.desc}>
                Убирает блоки &lt;think&gt;…&lt;/think&gt; из истории при построении контекста.
                Экономит 20–50% токенов для think-моделей (DeepSeek-R1, QwQ, Qwen3)
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.showLiveThinking === true}
              onChange={(e) => onSettingsChange({ showLiveThinking: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Показывать reasoning в чате</span>
              <span className={styles.desc}>
                Устарело: во время прогона текст размышлений всегда в компактном блоке (~200px).
                Настройка сохранена для совместимости.
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.readonlyMode === true}
              onChange={(e) => onSettingsChange({ readonlyMode: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Только чтение</span>
              <span className={styles.desc}>
                Блокирует все инструменты записи; агент может только читать файлы и искать по коду
              </span>
            </span>
          </label>

          <label>
            Лимит стоимости за прогон (USD)
            <input
              type="number"
              min={0}
              step={0.01}
              placeholder="0 — без лимита"
              value={settings.maxCostPerRunUsd ?? ''}
              onChange={(e) => {
                const raw = e.target.value.trim()
                onSettingsChange({
                  maxCostPerRunUsd: raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0)
                })
              }}
            />
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Для облачных моделей: прогон останавливается, когда оценочная стоимость (
            <code>estimatedCostUsd</code>) превышает лимит. Ollama — бесплатно, лимит не
            применяется.
          </div>

          <label>
            Запасные модели (fallback)
            <textarea
              rows={3}
              placeholder={'gpt-4o-mini\ndeepseek-chat'}
              value={(settings.fallbackModels ?? []).join('\n')}
              onChange={(e) =>
                onSettingsChange({
                  fallbackModels: e.target.value
                    .split(/[\n,]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                })
              }
            />
            <span className={styles.hint}>
              По одной модели на строку (или через запятую). При HTTP 429 или 5xx агент пробует
              следующую модель того же провайдера.
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.scriptSandboxEnabled === true}
              onChange={(e) => onSettingsChange({ scriptSandboxEnabled: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Песочница для скриптов</span>
              <span className={styles.desc}>
                Запускать run_script в Docker-контейнере: без сети, mount только projectPath.
                Требует Docker Desktop. Fallback на локальный запуск при недоступности Docker.
              </span>
            </span>
          </label>
        </div>
      </SettingItem>

      <SettingItem
        tab="agent"
        label="Дополнительные инструкции"
        desc="системный промпт кастомный инструкции system prompt custom instructions"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Дополнительные инструкции</div>
          <p className={styles.desc}>
            Текст дописывается в конец системного промпта агента. Используй для добавления правил,
            стиля ответов или ограничений.
          </p>
          <textarea
            className={styles.customPromptTextarea}
            placeholder="Например: всегда отвечай кратко и только по делу. Не используй markdown-заголовки."
            value={settings.customSystemPrompt ?? ''}
            onChange={(e) => onSettingsChange({ customSystemPrompt: e.target.value })}
            rows={5}
            spellCheck={false}
          />
        </div>
      </SettingItem>
    </>
  )
}
