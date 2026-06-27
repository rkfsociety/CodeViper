import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateReleaseNotes, generateReleaseTitle } from './generate-release-notes.mjs'

const SAMPLE_COMMITS = [
  'test: windowsGitEnv — portable тест без mock fs',
  'fix(release): live runtime after auto-update — git clone and PATH (v0.3.6)',
  'feat(ui): показывать путь файла в статусе read/edit инструментов',
  'feat: авто git clone CodeViper в userData/source при синхронизации',
  'fix(ci): nightly — gh release create',
  'ui: более плотный список чатов в боковой панели',
  'fix: коллективная память через gh auth token и bundled source'
]

describe('generate-release-notes', () => {
  it('пропускает ci/test/docs коммиты', () => {
    const notes = generateReleaseNotes('v0.3.6', 'v0.3.5', SAMPLE_COMMITS)
    assert.ok(!notes.includes('windowsGitEnv'))
    assert.ok(!notes.includes('nightly'))
    assert.ok(!notes.includes('gh release create'))
  })

  it('группирует по категориям', () => {
    const notes = generateReleaseNotes('v0.3.6', 'v0.3.5', SAMPLE_COMMITS)
    assert.ok(notes.includes('### Что изменилось для пользователя'))
    assert.ok(notes.includes('**Обновление без переустановки**'))
    assert.ok(notes.includes('**Интерфейс**'))
    assert.ok(notes.includes('**Агент и интеграции**'))
    assert.ok(notes.includes('путь файла'))
  })

  it('добавляет таблицу установки с версией', () => {
    const notes = generateReleaseNotes('v0.3.6', 'v0.3.5', SAMPLE_COMMITS)
    assert.ok(notes.includes('CodeViper-Setup-0.3.6.exe'))
    assert.ok(notes.includes('CodeViper-0.3.6.AppImage'))
  })

  it('генерирует короткий заголовок релиза', () => {
    const title = generateReleaseTitle('v0.3.6')
    assert.equal(title, 'CodeViper 0.3.6')
  })

  it('инструкция после обновления для Windows', () => {
    const notes = generateReleaseNotes('v0.3.6', 'v0.3.5', SAMPLE_COMMITS)
    assert.ok(notes.includes('### После обновления (Windows)'))
    assert.ok(notes.includes('clone ok'))
  })
})
