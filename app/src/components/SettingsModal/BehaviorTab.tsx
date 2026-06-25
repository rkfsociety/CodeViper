import styles from './SettingsModal.module.css'
import type { AgentSettings, GitSyncStrategy, PermissionMode } from '../../types'
import {
  GIT_SYNC_STRATEGIES,
  GIT_SYNC_STRATEGY_LABELS,
  PERMISSION_MODES,
  PERMISSION_MODE_LABELS
} from '../../types'
import { SettingItem, TOOL_GROUPS } from './shared'

interface Props {
  isActive: boolean
  isSearching: boolean
  settings: AgentSettings
  onSettingsChange: (patch: Partial<AgentSettings>) => void
}

export function BehaviorTab({ isActive, isSearching, settings, onSettingsChange }: Props) {
  if (!isActive && !isSearching) return null

  return (
    <>
      {/* ── Безопасность ── */}
      <SettingItem
        tab="behavior"
        label="Безопасность"
        desc="режим доступа запрещённые команды blocklist permission спрашивать принимать bypass"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Безопасность</div>
          <label>
            Режим доступа
            <select
              value={settings.permissionMode ?? 'bypass'}
              onChange={(e) =>
                onSettingsChange({ permissionMode: e.target.value as PermissionMode })
              }
            >
              {PERMISSION_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {PERMISSION_MODE_LABELS[mode]}
                </option>
              ))}
            </select>
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            <strong>Спрашивать всё</strong> — подтверждение перед каждой записью/командой.{' '}
            <strong>Принимать правки</strong> — файлы без вопросов, команды с подтверждением.{' '}
            <strong>Без подтверждений</strong> — агент действует сам.
          </div>

          <label>
            Запрещённые команды
            <textarea
              rows={4}
              placeholder={'npm publish\\.+--access public\ncurl .+ | bash\ndocker push'}
              value={(settings.commandBlocklist ?? []).join('\n')}
              onChange={(e) => {
                const lines = e.target.value.split('\n')
                onSettingsChange({ commandBlocklist: lines })
              }}
              style={{ fontFamily: 'monospace', resize: 'vertical' }}
            />
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Каждая строка — паттерн (подстрока или регулярное выражение). Совпадение блокирует
            команду. Применяется поверх встроенного списка.
          </div>

          <label>
            Всегда разрешать команды
            <textarea
              rows={4}
              placeholder={'npm test\ngit status\ngit diff'}
              value={(settings.commandAllowlist ?? []).join('\n')}
              onChange={(e) => {
                const lines = e.target.value.split('\n')
                onSettingsChange({ commandAllowlist: lines })
              }}
              style={{ fontFamily: 'monospace', resize: 'vertical' }}
            />
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Паттерны команд, которые всегда разрешены — даже если совпадают с запрещёнными.
            Проверяется до blocklist.
          </div>
        </div>
      </SettingItem>

      {/* ── Поведение агента ── */}
      <SettingItem
        tab="behavior"
        label="Поведение агента"
        desc="уточняющие вопросы глубокое рассуждение reasoning исключать только чтение readonly clarify deep"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Поведение агента</div>

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

      {/* ── Дополнительные инструкции ── */}
      <SettingItem
        tab="behavior"
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

      {/* ── Автоматизация ── */}
      <SettingItem
        tab="behavior"
        label="Автоматизация"
        desc="автокоммит git синхронизация push pull стратегия startup запуск stash rebase fast-forward"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Автоматизация</div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.autoPushSelfEdits !== false}
              onChange={(e) => onSettingsChange({ autoPushSelfEdits: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Автокоммит самоправок</span>
              <span className={styles.desc}>
                После самоулучшения — commit + push в ветку{' '}
                <code>{settings.selfImproveBranch?.trim() || 'agent/self-improve'}</code>, не в
                master
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.autoVerifyAfterEdit === true}
              onChange={(e) =>
                onSettingsChange({ autoVerifyAfterEdit: e.target.checked || undefined })
              }
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Автопроверка после правки</span>
              <span className={styles.desc}>
                После каждой успешной правки исходников CodeViper — запускать{' '}
                <code>npm run typecheck</code> и <code>npm test</code>; результат появляется как
                tool_result в чате
              </span>
            </span>
          </label>

          <div style={{ marginTop: '0.75rem' }}>
            <div className={styles.sectionLabel}>Ветка самоулучшения</div>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="agent/self-improve"
              value={settings.selfImproveBranch ?? ''}
              onChange={(e) => onSettingsChange({ selfImproveBranch: e.target.value || undefined })}
              spellCheck={false}
            />
            <div className={styles.hint}>
              Только <code>agent/*</code> — агент переключится в начале самоулучшения
            </div>
          </div>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.syncCollectiveMemory !== false}
              onChange={(e) => onSettingsChange({ syncCollectiveMemory: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Коллективная память на GitHub</span>
              <span className={styles.desc}>
                Глобальные знания (🧠 Запомнено) → <code>docs/collective/ViperMemory.md</code> в
                ветке <code>{settings.selfImproveBranch?.trim() || 'agent/self-improve'}</code>
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.autoCollectivePr === true}
              onChange={(e) => onSettingsChange({ autoCollectivePr: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Авто-PR после sync</span>
              <span className={styles.desc}>
                После успешного push коллективной памяти автоматически создаёт PR. Если PR уже
                открыт — сообщит об этом без ошибки.
              </span>
            </span>
          </label>

          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={settings.gitSyncOnStartup !== false}
              onChange={(e) => onSettingsChange({ gitSyncOnStartup: e.target.checked })}
            />
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
            <span className={styles.toggleContent}>
              <span className={styles.title}>Git-синхронизация при запуске</span>
              <span className={styles.desc}>
                При запуске CodeViper автоматически подтягивает обновления с GitHub
              </span>
            </span>
          </label>

          {settings.gitSyncOnStartup !== false && (
            <>
              <label>
                Стратегия синхронизации
                <select
                  value={settings.gitSyncStrategy ?? 'stash'}
                  onChange={(e) =>
                    onSettingsChange({ gitSyncStrategy: e.target.value as GitSyncStrategy })
                  }
                >
                  {GIT_SYNC_STRATEGIES.map((strategy) => (
                    <option key={strategy} value={strategy}>
                      {GIT_SYNC_STRATEGY_LABELS[strategy]}
                    </option>
                  ))}
                </select>
              </label>
              <div className={`${styles.hint} ${styles.hintInline}`}>
                <strong>Stash + reset</strong> — локальные правки прячутся в <code>git stash</code>,
                затем <code>reset --hard</code> на версию GitHub (приоритет у GitHub).{' '}
                <strong>Rebase</strong> — локальные коммиты переносятся поверх версии GitHub.{' '}
                <strong>Fast-forward only</strong> — обновление только если нет расхождений; иначе
                остаётся локальная версия (ничего не теряется).
                <br />
                При незакоммиченных изменениях лаунчер покажет предупреждение и спросит
                подтверждение перед синхронизацией.
              </div>
            </>
          )}
        </div>
      </SettingItem>

      {/* ── Инструменты агента ── */}
      <SettingItem
        tab="behavior"
        label="Инструменты агента"
        desc="отключить инструменты файлы git github gitlab память команды веб навыки todo индексация зависимости disabled tools"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Инструменты агента</div>
          <p className={styles.desc}>
            Снимите галочку с группы, чтобы скрыть её инструменты от агента. Изменения вступят в
            силу при следующем сообщении.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px' }}>
            {TOOL_GROUPS.map((group) => {
              const disabled = settings.disabledTools ?? []
              const allDisabled = group.tools.every((t) => disabled.includes(t))
              return (
                <label key={group.id} className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={!allDisabled}
                    onChange={(e) => {
                      const current = new Set(settings.disabledTools ?? [])
                      if (e.target.checked) {
                        group.tools.forEach((t) => current.delete(t))
                      } else {
                        group.tools.forEach((t) => current.add(t))
                      }
                      onSettingsChange({ disabledTools: [...current] })
                    }}
                  />
                  <span className={styles.track} aria-hidden="true">
                    <span className={styles.thumb} />
                  </span>
                  <span className={styles.toggleContent}>
                    <span className={styles.title}>{group.label}</span>
                    <span className={styles.desc}>{group.desc}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      </SettingItem>

      {/* ── Разработка ── */}
      <SettingItem
        tab="behavior"
        label="Разработка"
        desc="путь исходники codeviper source root override самоулучшение"
      >
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Разработка</div>
          <label>
            Путь к исходникам CodeViper
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="F:\\github\\CodeViper\\app"
                value={settings.sourceRootOverride ?? ''}
                onChange={(e) => onSettingsChange({ sourceRootOverride: e.target.value })}
                style={{ flex: 1 }}
              />
              <button
                onClick={async () => {
                  const path = await window.codeviper.selectFolder()
                  if (path) {
                    onSettingsChange({ sourceRootOverride: path })
                  }
                }}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  backgroundColor: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                Выбрать папку
              </button>
            </div>
          </label>
          <div className={`${styles.hint} ${styles.hintInline}`}>
            Абсолютный путь к папке <code>app/</code> исходников CodeViper. Если указан,
            используется вместо автоматического поиска. Оставьте пусто для автоматического поиска.
          </div>
        </div>
      </SettingItem>
    </>
  )
}
