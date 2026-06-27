import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { AGENT_TOOL_NAMES } from '../shared/toolCalls'

const TOOLS_API_PATH = join(process.cwd(), '..', 'docs', 'tools-api.md')

describe('tools-api.md', () => {
  const doc = readFileSync(TOOLS_API_PATH, 'utf8')

  it('ссылается на agentTools/ и AGENT_TOOL_NAMES', () => {
    expect(doc).toContain('agentTools/')
    expect(doc).toContain('AGENT_TOOL_NAMES')
    expect(doc).toContain('toolCalls.ts')
  })

  it.each([...AGENT_TOOL_NAMES])('упоминает `%s`', (name) => {
    expect(doc).toContain(`\`${name}\``)
  })
})
