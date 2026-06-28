import { useEffect, useRef, useState } from 'react'
import type { AgentSettings, AgentContextPreview, OllamaModel } from '../../types'
import { GEMINI_FREE_MODELS } from '../../../shared/constants'
import { formatRecentProjectLabel } from '../../../shared/recentProjects'
import { getModelPickerHint } from '../../../shared/recommendedModels'
import { formatProjectLabel } from './helpers'
import styles from '../ChatPanel.module.css'

interface Props {
  projectPath: string | null
  recentProjects?: string[]
  settings: AgentSettings
  busy: boolean
  runModel: string
  displayModels: OllamaModel[]
  showLearningPanel: boolean
  showRulesPanel: boolean
  showRoadmapPanel: boolean
  showQuickBar: boolean
  modelPickerOpen: boolean
  modelPickerRef: React.RefObject<HTMLDivElement | null>
  contextPopoverOpen: boolean
  contextPopoverRef: React.RefObject<HTMLDivElement | null>
  contextPreview: AgentContextPreview | null
  contextLoading: boolean
  summarizing: boolean
  projectLocked: boolean
  onSetShowLearning: (v: boolean) => void
  onSetShowRules: (v: boolean) => void
  onSetShowRoadmap: (v: boolean) => void
  onSetShowQuickBar: (v: boolean) => void
  onSetModelPickerOpen: (v: boolean) => void
  onSetContextPopoverOpen: (v: boolean) => void
  onSetContextModalOpen: (v: boolean) => void
  onModelChange?: (model: string, auto: boolean) => void
  onPickProject: () => void
  onOpenRecentProject?: (path: string) => void
  onSummarizeContext: () => Promise<void>
}

function formatModelShort(model: string): string {
  const name = (model || '').trim()
  if (!name) return '—'
  const base = name.includes(':') ? name.split(':')[0]! : name
  return base.length > 16 ? base.slice(0, 15) + '…' : base
}

export function ChatInputMeta({
  projectPath,
  recentProjects = [],
  settings,
  busy,
  runModel,
  displayModels,
  showLearningPanel,
  showRulesPanel,
  showRoadmapPanel,
  showQuickBar,
  modelPickerOpen,
  modelPickerRef,
  contextPopoverOpen,
  contextPopoverRef,
  contextPreview,
  contextLoading,
  summarizing,
  projectLocked,
  onSetShowLearning,
  onSetShowRules,
  onSetShowRoadmap,
  onSetShowQuickBar,
  onSetModelPickerOpen,
  onSetContextPopoverOpen,
  onSetContextModalOpen,
  onModelChange,
  onPickProject,
  onOpenRecentProject,
  onSummarizeContext
}: Props) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const recents = recentProjects.filter((path) => path.trim())

  useEffect(() => {
    if (!projectMenuOpen) return
    function handleOutside(e: MouseEvent) {
      if (projectMenuRef.current && !projectMenuRef.current.contains(e.target as Node)) {
        setProjectMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [projectMenuOpen])

  return (
    <div className={styles.inputMeta}>
      <div className={styles.metaLeft}>
        <div className={styles.projectPicker} ref={projectMenuRef}>
          <button
            type="button"
            className={styles.metaBtn}
            title={
              projectLocked
                ? `Проект зафиксирован — чат уже содержит сообщения (${projectPath})`
                : projectPath || 'Открыть проект'
            }
            onClick={!projectLocked ? () => setProjectMenuOpen((open) => !open) : undefined}
            style={projectLocked ? { cursor: 'default' } : undefined}
            disabled={busy && !projectLocked}
            aria-haspopup={!projectLocked ? 'menu' : undefined}
            aria-expanded={!projectLocked ? projectMenuOpen : undefined}
          >
            📁 {projectPath ? formatProjectLabel(projectPath) : 'Открыть'}
            {!projectLocked && (
              <span className={styles.modelChevron}>{projectMenuOpen ? '▴' : '▾'}</span>
            )}
            {projectLocked && <span style={{ opacity: 0.45, fontSize: 9, marginLeft: 2 }}>🔒</span>}
          </button>
          {projectMenuOpen && !projectLocked && (
            <div className={styles.projectMenu} role="menu">
              {recents.length > 0 && (
                <>
                  <div className={styles.projectMenuTitle}>Недавние</div>
                  {recents.map((path) => {
                    const isCurrent = path === projectPath
                    return (
                      <button
                        key={path}
                        type="button"
                        role="menuitem"
                        className={`${styles.projectMenuItem}${isCurrent ? ` ${styles.projectMenuItemActive}` : ''}`}
                        title={path}
                        disabled={isCurrent}
                        onClick={() => {
                          setProjectMenuOpen(false)
                          onOpenRecentProject?.(path)
                        }}
                      >
                        <span className={styles.projectMenuName}>
                          {formatRecentProjectLabel(path)}
                        </span>
                        <span className={styles.projectMenuPath}>{path}</span>
                      </button>
                    )
                  })}
                  <div className={styles.projectMenuSep} />
                </>
              )}
              <button
                type="button"
                role="menuitem"
                className={styles.projectMenuBrowse}
                onClick={() => {
                  setProjectMenuOpen(false)
                  onPickProject()
                }}
              >
                Обзор папок…
              </button>
            </div>
          )}
        </div>
      </div>

      <div className={styles.metaRight}>
        <button
          type="button"
          className={`${styles.metaBtn}${showRulesPanel ? ' ' + styles.metaBtnActive : ''}`}
          title="Правила проекта (.codeviper/rules.md)"
          onClick={() => onSetShowRules(!showRulesPanel)}
          disabled={!projectPath}
        >
          📋
        </button>

        <button
          type="button"
          className={`${styles.metaBtn}${showLearningPanel ? ' ' + styles.metaBtnActive : ''}`}
          title="Коллективное обучение"
          onClick={() => onSetShowLearning(!showLearningPanel)}
        >
          ☁️
        </button>

        <button
          type="button"
          className={`${styles.metaBtn}${showRoadmapPanel ? ' ' + styles.metaBtnActive : ''}`}
          title="ROADMAP — выбрать задачу самоулучшения"
          onClick={() => onSetShowRoadmap(!showRoadmapPanel)}
          disabled={!projectPath}
        >
          🗺
        </button>

        <button
          type="button"
          className={`${styles.metaBtn}${showQuickBar ? ' ' + styles.metaBtnActive : ''}`}
          title="Быстрые промпты"
          onClick={() => onSetShowQuickBar(!showQuickBar)}
          disabled={!projectPath}
        >
          /
        </button>

        <div className={styles.modelPicker} ref={modelPickerRef}>
          <button
            type="button"
            className={`${styles.metaBtn} ${styles.metaModelBtn}`}
            title={settings.model}
            data-testid="model-picker-btn"
            onClick={() => onSetModelPickerOpen(!modelPickerOpen)}
          >
            {settings.autoModel !== false && <span className={styles.modelAuto}>Авто · </span>}
            {formatModelShort(runModel || settings.model)}
            <span className={styles.modelChevron}>{modelPickerOpen ? '▴' : '▾'}</span>
          </button>
          {modelPickerOpen && (
            <div className={styles.modelPickerDropdown} role="listbox">
              <button
                type="button"
                className={`${styles.modelPickerItem}${settings.autoModel !== false ? ' ' + styles.modelPickerActive : ''}`}
                role="option"
                aria-selected={settings.autoModel !== false}
                onClick={() => {
                  onModelChange?.(settings.model, true)
                  onSetModelPickerOpen(false)
                }}
              >
                <span className={styles.modelPickerName}>Авто</span>
                <span className={styles.modelPickerDesc}>Лучшая доступная модель</span>
                {settings.autoModel !== false && <span className={styles.modelPickerCheck}>✓</span>}
              </button>
              {displayModels.length > 0 && <div className={styles.modelPickerSep} />}
              {displayModels.map((m: OllamaModel) => {
                const isActive = settings.autoModel === false && settings.model === m.name
                const isLocal = (settings.modelProvider ?? 'ollama') === 'ollama'
                const freeModel =
                  settings.modelProvider === 'gemini' && (settings.geminiTier ?? 'free') === 'free'
                    ? GEMINI_FREE_MODELS.find((f) => f.id === m.name)
                    : undefined
                const displayName = freeModel ? freeModel.label : m.name.split(':')[0]
                const hint = isLocal ? getModelPickerHint(m, !settings.chatMode) : undefined
                const tag = freeModel
                  ? `${freeModel.rpm} RPM · ${freeModel.tpm != null ? `${freeModel.tpm / 1000}K` : '∞'} TPM`
                  : hint
                    ? undefined
                    : (m.parameterSize ?? (m.name.includes(':') ? m.name.split(':')[1] : undefined))
                return (
                  <button
                    key={m.name}
                    type="button"
                    className={`${styles.modelPickerItem}${isActive ? ' ' + styles.modelPickerActive : ''}`}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onModelChange?.(m.name, false)
                      onSetModelPickerOpen(false)
                    }}
                  >
                    <span className={styles.modelPickerName}>{displayName}</span>
                    {hint && <span className={styles.modelPickerDesc}>{hint}</span>}
                    {tag && <span className={styles.modelPickerTag}>{tag}</span>}
                    {isActive && <span className={styles.modelPickerCheck}>✓</span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className={styles.contextPopoverWrap} ref={contextPopoverRef}>
          <button
            type="button"
            className={`${styles.contextCircleBtn}${contextPopoverOpen ? ' ' + styles.contextCircleActive : ''}`}
            onClick={() => onSetContextPopoverOpen(!contextPopoverOpen)}
            title="Использование контекста"
            aria-label="Использование контекста"
            style={{
              padding: 0,
              border: 'none',
              background: 'transparent',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {contextLoading && !contextPreview ? (
              <span style={{ fontSize: '14px' }}>…</span>
            ) : contextPreview ? (
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: `conic-gradient(var(--blue, #0969da) 0deg ${contextPreview.contextUsagePercent * 3.6}deg, var(--border, #30363d) ${contextPreview.contextUsagePercent * 3.6}deg 360deg)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative'
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: 'var(--bg-secondary, #161b22)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '9px',
                    fontWeight: '600',
                    color: 'var(--text-secondary, #c9d1d9)'
                  }}
                >
                  {contextPreview.contextUsagePercent}%
                </div>
              </div>
            ) : (
              <span style={{ fontSize: '14px' }}>◎</span>
            )}
          </button>

          {contextPopoverOpen && (
            <div className={styles.contextPopover} role="tooltip">
              {contextLoading && !contextPreview ? (
                <div className={styles.ctxTitle}>Загрузка…</div>
              ) : contextPreview ? (
                <>
                  <div className={styles.ctxTitle}>Контекст модели</div>
                  <div className={styles.ctxRows}>
                    {contextPreview.sections.map((s) => (
                      <div key={s.id} className={styles.ctxRow}>
                        <span className={styles.ctxRowName}>{s.title}</span>
                        <span className={styles.ctxRowVal}>
                          ~{(s.charCount / 4000).toFixed(1)}k tok
                          <span className={styles.ctxRowKb}>
                            {' '}
                            ({(s.charCount / 1024).toFixed(1)} KB)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.ctxBar}>
                    <div
                      className={styles.ctxBarFill}
                      style={{
                        width: `${Math.min(100, contextPreview.contextUsagePercent)}%`,
                        background:
                          contextPreview.contextUsagePercent >= 90
                            ? 'var(--red, #f85149)'
                            : contextPreview.contextUsagePercent >= 70
                              ? 'var(--yellow, #d29922)'
                              : 'var(--blue, #1f6feb)'
                      }}
                    />
                  </div>
                  <div className={styles.ctxTotal}>
                    ~{contextPreview.estimatedTokens.toLocaleString('ru-RU')} /{' '}
                    {contextPreview.contextLimitTokens.toLocaleString('ru-RU')} tok
                  </div>
                  <button
                    type="button"
                    className={styles.ctxDetails}
                    onClick={() => {
                      onSetContextPopoverOpen(false)
                      onSetContextModalOpen(true)
                    }}
                  >
                    Детали →
                  </button>
                  {contextPreview.contextUsagePercent > 60 && (
                    <button
                      type="button"
                      className={styles.ctxDetails}
                      style={{ marginTop: 4, opacity: summarizing ? 0.6 : 1 }}
                      disabled={summarizing}
                      onClick={() => void onSummarizeContext()}
                      title="Суммаризировать старые сообщения, чтобы освободить контекст"
                    >
                      {summarizing ? 'Сжимаю…' : 'Сжать историю'}
                    </button>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
