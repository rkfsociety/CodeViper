import type { AgentPrerequisiteIssue } from '../types'

interface PendingRun {
  userMessageId: string
  text: string
}

interface Props {
  issues: AgentPrerequisiteIssue[]
  pendingRun: PendingRun
  installing: boolean
  onInstallNodeDeps: () => void
  onDownloadModel: (modelName: string) => void
  onOpenSettings: () => void
  onRetry: () => void
  onDismiss: () => void
}

export function AgentPrerequisitesBanner({
  issues,
  pendingRun,
  installing,
  onInstallNodeDeps,
  onDownloadModel,
  onOpenSettings,
  onRetry,
  onDismiss
}: Props) {
  const nodeIssue = issues.find((issue) => issue.type === 'node_install')
  const modelIssue = issues.find((issue) => issue.type === 'no_model')
  const ollamaOffline = issues.some((issue) => issue.type === 'ollama_offline')

  return (
    <div className="agent-prerequisites-banner">
      <div className="agent-prerequisites-title">Нужны зависимости перед запуском агента</div>
      <ul className="agent-prerequisites-list">
        {ollamaOffline && <li>Ollama не отвечает — запустите приложение Ollama</li>}
        {modelIssue && (
          <li>
            Нет модели с tool calling для агента
            {modelIssue.suggestedModels.length > 0 && (
              <span> — рекомендуем: {modelIssue.suggestedModels.slice(0, 2).join(', ')}</span>
            )}
          </li>
        )}
        {nodeIssue && (
          <li>
            В проекте есть package.json, но нет node_modules — нужен{' '}
            <code>{nodeIssue.installCommand}</code>
          </li>
        )}
      </ul>

      <div className="agent-prerequisites-actions">
        {nodeIssue && (
          <button
            type="button"
            className="btn primary"
            disabled={installing}
            onClick={onInstallNodeDeps}
          >
            {installing ? 'Установка…' : `Установить (${nodeIssue.installCommand})`}
          </button>
        )}
        {modelIssue?.suggestedModels.map((model) => (
          <button
            key={model}
            type="button"
            className="btn"
            disabled={installing || ollamaOffline}
            onClick={() => onDownloadModel(model)}
          >
            Скачать {model}
          </button>
        ))}
        {ollamaOffline && (
          <button type="button" className="btn" onClick={onOpenSettings}>
            Настройки Ollama
          </button>
        )}
        <button type="button" className="btn" disabled={installing} onClick={onRetry}>
          Проверить снова
        </button>
        <button type="button" className="btn" disabled={installing} onClick={onDismiss}>
          Отменить запрос
        </button>
      </div>

      <div className="agent-prerequisites-hint">
        Запрос сохранён в чате. После установки нажмите «Проверить снова» — агент продолжит: «
        {pendingRun.text.length > 80 ? `${pendingRun.text.slice(0, 80)}…` : pendingRun.text}»
      </div>
    </div>
  )
}
