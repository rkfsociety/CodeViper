import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findCommitMessageIssues } from '../electron/main/gitTools'

function initTempRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cv-commit-analysis-'))
  execSync('git init', { cwd: dir, stdio: 'ignore' })
  execSync('git config user.email test@test.com', { cwd: dir, stdio: 'ignore' })
  execSync('git config user.name Test', { cwd: dir, stdio: 'ignore' })
  return dir
}

describe('findCommitMessageIssues', () => {
  it('reports commit subjects that do not follow Conventional Commits', async () => {
    const dir = initTempRepo()
    try {
      writeFileSync(join(dir, 'a.txt'), 'v1', 'utf8')
      execSync('git add a.txt', { cwd: dir, stdio: 'ignore' })
      execSync('git commit -m "feat: add api"', { cwd: dir, stdio: 'ignore' })

      writeFileSync(join(dir, 'b.txt'), 'v2', 'utf8')
      execSync('git add b.txt', { cwd: dir, stdio: 'ignore' })
      execSync('git commit -m "Update readme"', { cwd: dir, stdio: 'ignore' })

      const result = await findCommitMessageIssues(dir, { limit: '10' })
      expect(result).toMatch(/Conventional Commits: 1/)
      expect(result).toMatch(/Update readme/)
      expect(result).not.toMatch(/feat: add api/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
