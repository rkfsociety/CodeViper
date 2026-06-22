export async function createJiraIssue(
  summary: string,
  projectKey: string,
  jiraUrl: string | undefined,
  jiraToken: string | undefined,
  description?: string,
  issueType: string = 'Task'
): Promise<string> {
  if (!jiraUrl || !jiraToken) {
    return 'Ошибка: не настроены jiraUrl или jiraToken. Проверьте настройки.'
  }

  const baseUrl = jiraUrl.replace(/\/$/, '')
  const issueTypeNormalized = issueType || 'Task'

  const payload = {
    fields: {
      project: { key: projectKey },
      summary: summary,
      description: description || '',
      issuetype: { name: issueTypeNormalized }
    }
  }

  try {
    const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${jiraToken}`).toString('base64')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const error = await response.text()
      return `Ошибка Jira (${response.status}): ${error}`
    }

    const result = (await response.json()) as { key: string; id: string }
    return `✓ Issue создан: ${result.key}\nID: ${result.id}`
  } catch (err) {
    return `Ошибка при создании issue: ${err instanceof Error ? err.message : String(err)}`
  }
}
