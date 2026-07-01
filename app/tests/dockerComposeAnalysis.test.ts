import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findDockerEnvIssues, findDockerPortIssues } from '../electron/main/dockerComposeAnalysis'

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

  it('reports duplicate host ports from long syntax and host ip mappings', async () => {
    const dir = initTempProject()
    try {
      writeFileSync(
        join(dir, 'docker-compose.yml'),
        `services:
  web:
    image: nginx
    ports:
      - target: 80
        published: 8080
      - "127.0.0.1:9000:90"
  api:
    image: node
    ports:
      - target: 3000
        published: "8080"
  worker:
    image: alpine
    ports:
      - "9000:9000"
`,
        'utf8'
      )

      const result = await findDockerPortIssues(dir)
      expect(result).toMatch(/host=8080/)
      expect(result).toMatch(/web: 8080:80/)
      expect(result).toMatch(/api: 8080:3000/)
      expect(result).toMatch(/host=9000/)
      expect(result).toMatch(/web: 127\.0\.0\.1:9000:90/)
      expect(result).toMatch(/worker: 9000:9000/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('findDockerEnvIssues', () => {
  it('reports compose env keys missing from .env.example', async () => {
    const dir = initTempProject()
    try {
      writeFileSync(
        join(dir, 'docker-compose.yml'),
        `services:
  app:
    image: node
    environment:
      API_URL: ${'${API_URL}'}
      SECRET_KEY: ${'${SECRET_KEY}'}
`,
        'utf8'
      )
      writeFileSync(
        join(dir, '.env.example'),
        `API_URL=https://example.test
`,
        'utf8'
      )
      writeFileSync(
        join(dir, '.env'),
        `API_URL=https://local.test
SECRET_KEY=dev-secret
`,
        'utf8'
      )

      const result = await findDockerEnvIssues(dir)
      expect(result).toMatch(/Найдено 1 проблем/)
      expect(result).toMatch(/SECRET_KEY/)
      expect(result).toMatch(/отсутствует в \.env\.example/)
      expect(result).not.toMatch(/API_URL/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reports list-style passthrough env keys missing from .env.example', async () => {
    const dir = initTempProject()
    try {
      writeFileSync(
        join(dir, 'docker-compose.yml'),
        `services:
  app:
    image: node
    environment:
      - API_URL=https://example.test
      - SECRET_KEY
      - DEBUG:
`,
        'utf8'
      )
      writeFileSync(
        join(dir, '.env.example'),
        `API_URL=https://example.test
DEBUG=false
`,
        'utf8'
      )
      writeFileSync(
        join(dir, '.env'),
        `SECRET_KEY=dev-secret
`,
        'utf8'
      )

      const result = await findDockerEnvIssues(dir)
      expect(result).toMatch(/SECRET_KEY/)
      expect(result).toMatch(/\.env/)
      expect(result).not.toMatch(/API_URL/)
      expect(result).not.toMatch(/DEBUG/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
