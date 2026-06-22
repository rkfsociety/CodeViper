export async function createLinearIssue(
  title: string,
  teamKey: string,
  linearApiKey: string | undefined,
  description?: string,
  priority?: string
): Promise<string> {
  if (!linearApiKey) {
    return 'Ошибка: не настроен linearApiKey. Проверьте настройки.'
  }

  const priorityNum = priority ? parseInt(priority, 10) : 3 // 3 = Medium по умолчанию

  const query = `
    mutation CreateIssue($title: String!, $teamId: String!, $description: String, $priority: Int) {
      issueCreate(input: {
        title: $title
        teamId: $teamId
        description: $description
        priority: $priority
      }) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `

  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${linearApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        variables: {
          title,
          teamId: teamKey,
          description: description || null,
          priority: !isNaN(priorityNum) ? priorityNum : 3
        }
      })
    })

    const result = (await response.json()) as {
      data?: { issueCreate?: { success: boolean; issue?: { identifier: string; url: string } } }
      errors?: Array<{ message: string }>
    }

    if (result.errors) {
      const errorMsg = result.errors.map((e) => e.message).join('; ')
      return `Ошибка Linear API: ${errorMsg}`
    }

    if (result.data?.issueCreate?.success && result.data.issueCreate.issue) {
      const issue = result.data.issueCreate.issue
      return `✓ Issue создан: ${issue.identifier}\nURL: ${issue.url}`
    }

    return 'Ошибка Linear API: не удалось создать issue'
  } catch (err) {
    return `Ошибка при создании issue: ${err instanceof Error ? err.message : String(err)}`
  }
}
