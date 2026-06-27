import { describe, it, expect } from 'vitest'
import { toolTouchesRoadmapDocs } from '../electron/main/agentToolExecutor'

describe('toolTouchesRoadmapDocs', () => {
  it('detects ROADMAP and README edits', () => {
    expect(toolTouchesRoadmapDocs('edit_codeviper_file', { path: '../ROADMAP.md' })).toBe(true)
    expect(toolTouchesRoadmapDocs('edit_codeviper_file', { path: '../ROADMAP_DONE.md' })).toBe(true)
    expect(toolTouchesRoadmapDocs('write_codeviper_file', { path: '../README.md' })).toBe(true)
    expect(toolTouchesRoadmapDocs('edit_codeviper_file', { path: 'tests/foo.test.ts' })).toBe(false)
    expect(toolTouchesRoadmapDocs('read_file', { path: '../ROADMAP.md' })).toBe(false)
  })
})
