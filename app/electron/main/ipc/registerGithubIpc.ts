import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { listPullRequests } from '../githubPr'
import { getGitHubAuthStatus, formatGitHubAuthStatus } from '../githubAuth'
import { createIssue, createPr, listIssues, openIssue, triggerGithubWorkflow } from '../githubTools'
import { createCodeViperPr } from '../selfCommit'
import { listRoadmapItems } from '../roadmapParser'
import { reportAgentTraceToGithub } from '../traceGithubReport'

export function registerGithubIpc(): void {
  ipcMain.handle('list-pull-requests', async () => listPullRequests())

  ipcMain.handle('create-issue', async (_e, title: string, body?: string, labels?: string) =>
    createIssue(title, body, labels)
  )

  ipcMain.handle('create-pr', async (_e, title?: string, body?: string) => createPr(title, body))

  ipcMain.handle('create-codeviper-pr', async (_e, title?: string, body?: string) => {
    const result = await createCodeViperPr(title, body)
    if (!result.ok) throw new Error(result.message)
    return result.message
  })

  ipcMain.handle('list-issues', async () => listIssues())

  ipcMain.handle('open-issue', async (_e, number: string) => openIssue(number))

  ipcMain.handle(
    'trigger-github-workflow',
    async (_e, workflowId: string, ref?: string, fields?: string) =>
      triggerGithubWorkflow(workflowId, ref, fields)
  )

  ipcMain.handle(IPC.LIST_ROADMAP_ITEMS, async () => listRoadmapItems())

  ipcMain.handle(IPC.CHECK_GITHUB_AUTH, async () => {
    const status = await getGitHubAuthStatus()
    return { ...status, formatted: formatGitHubAuthStatus(status) }
  })

  ipcMain.handle(IPC.REPORT_TRACE_TO_GITHUB, async (_e, ...a) => {
    const [chatId, events, projectPath, userNote] = parseIpcArgs(
      Contracts[IPC.REPORT_TRACE_TO_GITHUB].args,
      a
    )
    return reportAgentTraceToGithub(chatId, events, projectPath, userNote)
  })
}
