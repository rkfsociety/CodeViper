import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findDockerPortIssues } from '../electron/main/dockerComposeAnalysis'

function initTempProject(): string {
  return mkdtempSync(join(tmpdir(), 'cv-docker-compose-'))
}

describe('findDockerPortIssues', () => {
  it('reports duplicate host ports and publish without bind', async () => {
    const dir = initTempProject()
    try {
      writeFileSync(
        join(dir, 'docker-compose.yml'),
        `services:
  web:
    image: nginx
    ports:
      - "8080:80"
      - "9090"
  api:
    image: node
    ports:
      - "8080:3000"
`,
        'utf8'
      )

      const result = await findDockerPortIssues(dir)
      expect(result).toMatch(/Найдено 2 проблем/)
      expect(result).toMatch(/дублируется host-порт 8080/)
      expect(result).toMatch(/publish без bind/)
      expect(result).toMatch(/container=9090/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
