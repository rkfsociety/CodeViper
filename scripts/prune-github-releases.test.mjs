import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareSemverTagsDesc,
  selectReleasesToDelete,
  DEFAULT_STABLE_KEEP
} from './prune-github-releases.mjs'

describe('prune-github-releases', () => {
  it('сортирует semver-теги по убыванию', () => {
    const tags = ['v0.3.1', 'v0.3.10', 'v0.2.9', 'v0.3.2']
    tags.sort(compareSemverTagsDesc)
    assert.deepEqual(tags, ['v0.3.10', 'v0.3.2', 'v0.3.1', 'v0.2.9'])
  })

  it('оставляет N последних стабильных релизов', () => {
    const releases = [
      { tagName: 'v0.3.1' },
      { tagName: 'v0.3.2' },
      { tagName: 'v0.3.3' },
      { tagName: 'v0.3.4' },
      { tagName: 'v0.3.5' },
      { tagName: 'v0.3.6' },
      { tagName: 'v0.3.7' },
      { tagName: 'nightly-2025.06.27' }
    ]
    const toDelete = selectReleasesToDelete(releases, /^v[0-9]/, DEFAULT_STABLE_KEEP, 'v0.3.7')
    assert.deepEqual(toDelete, ['v0.3.1'])
  })

  it('не удаляет exclude-тег даже при keep=0', () => {
    const releases = [{ tagName: 'nightly-2025.06.26' }, { tagName: 'nightly-2025.06.27' }]
    const toDelete = selectReleasesToDelete(releases, /^nightly-/, 0, 'nightly-2025.06.27')
    assert.deepEqual(toDelete, ['nightly-2025.06.26'])
  })

  it('keep=0 удаляет все подходящие теги', () => {
    const releases = [{ tagName: 'nightly-a' }, { tagName: 'nightly-b' }]
    const toDelete = selectReleasesToDelete(releases, /^nightly-/, 0)
    assert.equal(toDelete.length, 2)
  })
})
