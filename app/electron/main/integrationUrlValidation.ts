const RESOURCE_PATH_SEGMENTS = new Set([
  'api',
  'browse',
  'issues',
  'issue',
  'merge_requests',
  'merge-requests',
  'pipelines',
  'projects',
  'pull',
  'runs',
  'secure',
  'workflows'
])

function parseHttpUrl(
  raw: string,
  label: string
): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: `${label}: URL не может быть пустым` }

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withProtocol)
  } catch {
    return { ok: false, error: `${label}: некорректный URL` }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, error: `${label}: URL должен начинаться с http:// или https://` }
  }

  if (!url.hostname) {
    return { ok: false, error: `${label}: отсутствует домен` }
  }

  return { ok: true, url }
}

function hasResourceLikePath(url: URL): boolean {
  const segments = url.pathname.split('/').filter(Boolean)
  return segments.some((segment) => RESOURCE_PATH_SEGMENTS.has(segment.toLowerCase()))
}

export function normalizeGitLabBaseUrl(
  raw: string | undefined
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw?.trim()
  if (!trimmed) return { ok: true, value: 'https://gitlab.com' }

  const parsed = parseHttpUrl(trimmed, 'GitLab URL')
  if (!parsed.ok) return parsed

  const { url } = parsed
  if (url.search || url.hash) {
    return { ok: false, error: 'GitLab URL: уберите query/hash и оставьте базовый адрес инстанса' }
  }
  if (hasResourceLikePath(url)) {
    return {
      ok: false,
      error: 'GitLab URL: ожидается базовый адрес инстанса, а не ссылка на API/MR/pipeline/project'
    }
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return { ok: true, value: url.toString().replace(/\/$/, '') }
}

export function normalizeJiraBaseUrl(
  raw: string | undefined
): { ok: true; value: string } | { ok: false; error: string } {
  const trimmed = raw?.trim()
  if (!trimmed) {
    return { ok: false, error: 'Jira URL не настроен: укажите базовый адрес Jira в настройках' }
  }

  const parsed = parseHttpUrl(trimmed, 'Jira URL')
  if (!parsed.ok) return parsed

  const { url } = parsed
  if (url.search || url.hash) {
    return { ok: false, error: 'Jira URL: уберите query/hash и оставьте базовый адрес сайта' }
  }
  const loweredPath = url.pathname.toLowerCase()
  if (
    loweredPath.includes('/rest/api/') ||
    loweredPath.includes('/browse/') ||
    loweredPath.includes('/issues/')
  ) {
    return {
      ok: false,
      error:
        'Jira URL: ожидается базовый адрес сайта, а не ссылка на REST API или конкретную задачу'
    }
  }

  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''
  return { ok: true, value: url.toString().replace(/\/$/, '') }
}

export function validateGitHubIssueNumber(number: string): string | null {
  const trimmed = number.trim()
  if (!trimmed) return 'Пустой номер issue'
  if (!/^\d+$/.test(trimmed)) return 'Номер issue должен быть числом, а не URL или путём'
  return null
}

export type IntegrationUrlIssue = {
  field: string
  value: string
  message: string
}

function pushUrlIssue(
  issues: IntegrationUrlIssue[],
  field: string,
  raw: string | undefined,
  message: string
) {
  issues.push({ field, value: raw?.trim() ?? '', message })
}

export function collectIntegrationUrlIssues(settings: {
  gitlabUrl?: string
  jiraUrl?: string
  jiraToken?: string
  gitlabToken?: string
  linearApiKey?: string
  webhookUrl?: string
  discordWebhookUrl?: string
  p2pServerUrl?: string
}): IntegrationUrlIssue[] {
  const issues: IntegrationUrlIssue[] = []

  const gitlab = normalizeGitLabBaseUrl(settings.gitlabUrl)
  if (!gitlab.ok) pushUrlIssue(issues, 'gitlabUrl', settings.gitlabUrl, gitlab.error)

  if (settings.gitlabToken?.trim() && !settings.gitlabUrl?.trim()) {
    pushUrlIssue(
      issues,
      'gitlabUrl',
      settings.gitlabUrl,
      'GitLab token задан, но gitlabUrl пуст — укажите базовый URL инстанса'
    )
  }

  if (settings.jiraToken?.trim()) {
    const jira = normalizeJiraBaseUrl(settings.jiraUrl)
    if (!jira.ok) pushUrlIssue(issues, 'jiraUrl', settings.jiraUrl, jira.error)
  } else if (settings.jiraUrl?.trim()) {
    pushUrlIssue(
      issues,
      'jiraToken',
      settings.jiraToken,
      'Jira URL задан, но jiraToken пуст — API token обязателен'
    )
  }

  if (settings.linearApiKey?.trim() && settings.linearApiKey.trim().length < 8) {
    pushUrlIssue(issues, 'linearApiKey', settings.linearApiKey, 'Linear API key слишком короткий')
  }

  for (const [field, raw] of [
    ['webhookUrl', settings.webhookUrl],
    ['discordWebhookUrl', settings.discordWebhookUrl]
  ] as const) {
    if (!raw?.trim()) continue
    const parsed = parseHttpUrl(raw, field)
    if (!parsed.ok) pushUrlIssue(issues, field, raw, parsed.error)
  }

  if (settings.p2pServerUrl?.trim()) {
    const parsed = parseHttpUrl(settings.p2pServerUrl, 'p2pServerUrl')
    if (!parsed.ok) {
      pushUrlIssue(issues, 'p2pServerUrl', settings.p2pServerUrl, parsed.error)
    } else if (parsed.url.protocol !== 'wss:' && parsed.url.protocol !== 'ws:') {
      pushUrlIssue(
        issues,
        'p2pServerUrl',
        settings.p2pServerUrl,
        'P2P server URL должен использовать ws:// или wss://'
      )
    }
  }

  return issues
}

export function formatIntegrationUrlIssuesOutput(issues: IntegrationUrlIssue[]): string {
  if (!issues.length) return 'Нарушений URL интеграций не найдено.'
  const parts = [`Найдено ${issues.length} проблем URL интеграций:`]
  issues.forEach((issue, index) => {
    parts.push(
      `[${index + 1}] ${issue.field}\n    значение: ${issue.value || '(пусто)'}\n    ${issue.message}`
    )
  })
  return parts.join('\n')
}
