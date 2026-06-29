import { spawn } from 'child_process'
import { cliSpawnBase } from './windowsGitEnv'

const DEFAULT_GITLAB_URL = 'https://gitlab.com'

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('git', args, cliSpawnBase(cwd))
    let stdout = ''
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
    child.on('close', () => resolve(stdout.trim()))
    child.on('error', () => resolve(''))
  })
}

async function detectProject(projectPath: string): Promise<string | null> {
  const url = await runGit(['remote', 'get-url', 'origin'], projectPath)
  if (!url) return null
  const httpsMatch = url.match(/https?:\/\/[^/]+\/(.+?)(?:\.git)?$/)
  const sshMatch = url.match(/@[^:]+:(.+?)(?:\.git)?$/)
  return httpsMatch?.[1] ?? sshMatch?.[1] ?? null
}

interface GitlabResponse {
  ok: boolean
  status: number
  data: unknown
}

async function gitlabApi(
  token: string,
  baseUrl: string,
  endpoint: string,
  method = 'GET',
  body?: object
): Promise<GitlabResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v4${endpoint}`
  const resp = await fetch(url, {
    method,
    headers: {
      'PRIVATE-TOKEN': token,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  let data: unknown
  try {
    data = await resp.json()
  } catch {
    data = await resp.text()
  }
  return { ok: resp.ok, status: resp.status, data }
}

function resolveBaseUrl(gitlabUrl: string | undefined): string {
  return gitlabUrl?.trim() || DEFAULT_GITLAB_URL
}

function checkToken(token: string | undefined): string | null {
  const t = token?.trim()
  return t || null
}

export async function listGitlabMrs(
  projectPath: string,
  token: string | undefined,
  gitlabUrl: string | undefined
): Promise<string> {
  const t = checkToken(token)
  if (!t) return 'GitLab токен не настроен: укажи gitlabToken в настройках'

  const project = await detectProject(projectPath)
  if (!project) return 'Не удалось определить GitLab-проект из git remote origin'

  const { ok, status, data } = await gitlabApi(
    t,
    resolveBaseUrl(gitlabUrl),
    `/projects/${encodeURIComponent(project)}/merge_requests?state=opened&per_page=20&order_by=updated_at`
  )
  if (!ok) return `GitLab API ошибка ${status}: ${JSON.stringify(data)}`

  const mrs = data as Array<{
    iid: number
    title: string
    web_url: string
    source_branch: string
    target_branch: string
    author: { name: string }
  }>

  if (!mrs.length) return `Нет открытых MR в ${project}`

  return (
    `Открытые MR в ${project}:\n\n` +
    mrs
      .map(
        (mr) =>
          `!${mr.iid}  ${mr.title}\n  ${mr.source_branch} → ${mr.target_branch}  [${mr.author.name}]\n  ${mr.web_url}`
      )
      .join('\n\n')
  )
}

export async function createGitlabMr(
  projectPath: string,
  token: string | undefined,
  gitlabUrl: string | undefined,
  sourceBranch: string,
  targetBranch: string,
  title: string,
  description?: string
): Promise<string> {
  const t = checkToken(token)
  if (!t) return 'GitLab токен не настроен: укажи gitlabToken в настройках'

  const project = await detectProject(projectPath)
  if (!project) return 'Не удалось определить GitLab-проект из git remote origin'

  const body: Record<string, string> = {
    source_branch: sourceBranch.trim(),
    target_branch: targetBranch.trim(),
    title: title.trim()
  }
  if (description?.trim()) body.description = description.trim()

  const { ok, status, data } = await gitlabApi(
    t,
    resolveBaseUrl(gitlabUrl),
    `/projects/${encodeURIComponent(project)}/merge_requests`,
    'POST',
    body
  )
  if (!ok) return `GitLab API ошибка ${status}: ${JSON.stringify(data)}`

  const mr = data as { iid: number; web_url: string; title: string }
  return `✅ MR создан: !${mr.iid} "${mr.title}"\n${mr.web_url}`
}

export async function getGitlabPipeline(
  projectPath: string,
  token: string | undefined,
  gitlabUrl: string | undefined,
  pipelineId?: string
): Promise<string> {
  const t = checkToken(token)
  if (!t) return 'GitLab токен не настроен: укажи gitlabToken в настройках'

  const project = await detectProject(projectPath)
  if (!project) return 'Не удалось определить GitLab-проект из git remote origin'

  const base = resolveBaseUrl(gitlabUrl)
  const encoded = encodeURIComponent(project)
  const endpoint = pipelineId?.trim()
    ? `/projects/${encoded}/pipelines/${pipelineId.trim()}`
    : `/projects/${encoded}/pipelines?per_page=1&order_by=updated_at&sort=desc`

  const { ok, status, data } = await gitlabApi(t, base, endpoint)
  if (!ok) return `GitLab API ошибка ${status}: ${JSON.stringify(data)}`

  const pipeline = (Array.isArray(data) ? data[0] : data) as
    | { id: number; status: string; ref: string; created_at: string; web_url: string }
    | undefined

  if (!pipeline) return `Пайплайны не найдены в ${project}`

  return [
    `Pipeline #${pipeline.id}  [${pipeline.status.toUpperCase()}]`,
    `Ветка: ${pipeline.ref}`,
    `Создан: ${pipeline.created_at}`,
    `URL: ${pipeline.web_url}`
  ].join('\n')
}
