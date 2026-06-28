import { describe, it, expect } from 'vitest'
import { resolveToolPathArg } from '../electron/main/agentHandlersUtils'

describe('agentHandlersUtils', () => {
  it('resolveToolPathArg читает path, paths[0] и file_path', () => {
    expect(resolveToolPathArg({ path: 'app/src/App.tsx' })).toBe('app/src/App.tsx')
    expect(resolveToolPathArg({ paths: ['app/src/App.tsx'] })).toBe('app/src/App.tsx')
    expect(resolveToolPathArg({ paths: '["electron/main/agent.ts"]' })).toBe(
      'electron/main/agent.ts'
    )
    expect(resolveToolPathArg({ file_path: 'shared/constants.ts' })).toBe('shared/constants.ts')
    expect(resolveToolPathArg({})).toBeUndefined()
  })
})
