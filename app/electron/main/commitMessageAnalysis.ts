export const DEFAULT_COMMIT_MESSAGE_LOG_LIMIT = 50

const CONVENTIONAL_COMMIT_RE =
  /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(.+\))?!?: .+/i

export function analyzeCommitMessages(messages: string[], requestedLimit: number): string {
  if (!messages.length) {
    return `Пустая история commit-сообщений за последние ${requestedLimit} коммитов.`
  }

  const issues = messages.flatMap((message, index) =>
    CONVENTIONAL_COMMIT_RE.test(message) ? [] : [`[${index + 1}] ${message}`]
  )

  const badCount = issues.length
  const goodCount = messages.length - badCount
  const header = [
    `Проверено commit-ов: ${messages.length}`,
    `Conventional Commits: ${goodCount}`,
    `Не по conventional: ${badCount}`
  ]

  if (!issues.length) {
    return [...header, 'Проблем не найдено.'].join('\n')
  }

  return [...header, '', 'Нестандартные commit-сообщения:', ...issues].join('\n')
}
