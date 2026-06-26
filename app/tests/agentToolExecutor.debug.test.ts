import { describe, it, expect } from 'vitest'
import {
  buildToolCallLogEntry,
  buildToolResultLogEntry,
  truncateDebugAgentOutput
} from '../electron/main/agentToolExecutor'
import { FILE_SIZE_LIMIT_BYTES } from '../shared/constants'

describe('debugAgent NDJSON payloads', () => {
  it('buildToolResultLogEntry в debug-режиме пишет полный output', () => {
    const entry = buildToolResultLogEntry(true, 2, 'read_file', true, 42, 'file contents')
    expect(entry.debug).toBe(true)
    expect(entry.output).toBe('file contents')
    expect(entry.output_len).toBeUndefined()
  })

  it('buildToolResultLogEntry без debug — только output_len', () => {
    const entry = buildToolResultLogEntry(false, 1, 'grep_files', true, 10, 'matches')
    expect(entry.output_len).toBe(7)
    expect(entry.output).toBeUndefined()
    expect(entry.debug).toBeUndefined()
  })

  it('buildToolCallLogEntry помечает debug', () => {
    expect(buildToolCallLogEntry(true, 1, 'list_directory', { path: '/tmp' }).debug).toBe(true)
    expect(buildToolCallLogEntry(false, 1, 'list_directory', {}).debug).toBeUndefined()
  })

  it('truncateDebugAgentOutput обрезает слишком длинный вывод', () => {
    const long = 'x'.repeat(FILE_SIZE_LIMIT_BYTES + 100)
    const truncated = truncateDebugAgentOutput(long)
    expect(truncated.length).toBeLessThan(long.length)
    expect(truncated).toContain('[truncated 100 chars]')
  })
})
