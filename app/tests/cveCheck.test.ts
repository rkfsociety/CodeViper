import { describe, expect, it } from 'vitest'
import {
  CVE_ID_RE,
  formatNvdCveReport,
  formatNvdSearchReport,
  formatOsvReport,
  runCheckCve
} from '../electron/main/cveCheck'

describe('CVE_ID_RE', () => {
  it('принимает корректный CVE ID', () => {
    expect(CVE_ID_RE.test('CVE-2024-1234')).toBe(true)
    expect(CVE_ID_RE.test('cve-2021-44228')).toBe(true)
  })

  it('отклоняет некорректный формат', () => {
    expect(CVE_ID_RE.test('GHSA-xxxx')).toBe(false)
    expect(CVE_ID_RE.test('CVE-24-1')).toBe(false)
  })
})

describe('formatNvdCveReport', () => {
  it('формирует отчёт с CVSS и описанием', () => {
    const report = formatNvdCveReport({
      id: 'CVE-2021-44228',
      published: '2021-12-10',
      lastModified: '2021-12-14',
      descriptions: [{ lang: 'en', value: 'Log4Shell remote code execution.' }],
      metrics: {
        cvssMetricV31: [
          { cvssData: { baseScore: 10, baseSeverity: 'CRITICAL', vectorString: 'CVSS:3.1/AV:N' } }
        ]
      },
      references: [{ url: 'https://nvd.nist.gov' }]
    })
    expect(report).toContain('CVE-2021-44228')
    expect(report).toContain('CVSS:** 10')
    expect(report).toContain('Log4Shell')
  })
})

describe('formatNvdSearchReport', () => {
  it('возвращает сообщение при пустом списке', () => {
    expect(formatNvdSearchReport('unknown-product-xyz', [])).toContain('не найдено')
  })
})

describe('formatOsvReport', () => {
  it('сообщает об отсутствии уязвимостей', () => {
    expect(formatOsvReport('lodash', '4.17.21', 'npm', [])).toContain('не найдено')
  })

  it('перечисляет найденные уязвимости', () => {
    const report = formatOsvReport('example', '1.0.0', 'npm', [
      { id: 'GHSA-abc', summary: 'Test vuln', aliases: ['CVE-2024-0001'] }
    ])
    expect(report).toContain('GHSA-abc')
    expect(report).toContain('CVE-2024-0001')
  })
})

describe('runCheckCve', () => {
  it('требует один режим запроса', async () => {
    expect(await runCheckCve({})).toContain('Укажи один из режимов')
    expect(await runCheckCve({ cve_id: 'CVE-2024-1', keyword: 'lodash' })).toContain(
      'только один режим'
    )
  })

  it('валидирует формат CVE ID', async () => {
    expect(await runCheckCve({ cve_id: 'bad-id' })).toContain('Некорректный CVE ID')
  })
})
