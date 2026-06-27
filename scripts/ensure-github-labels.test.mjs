import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { REQUIRED_LABELS } from './ensure-github-labels.mjs'

describe('ensure-github-labels', () => {
  it('содержит trace-report для отчётов из панели трассы', () => {
    const trace = REQUIRED_LABELS.find((l) => l.name === 'trace-report')
    assert.ok(trace)
    assert.match(trace.description, /трейс/i)
  })
})
