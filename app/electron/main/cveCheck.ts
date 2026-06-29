const NVD_API_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0'
const OSV_API_URL = 'https://api.osv.dev/v1/query'
const DEFAULT_TIMEOUT_MS = 20_000

export const CVE_ID_RE = /^CVE-\d{4}-\d{4,}$/i

type NvdCvssMetric = {
  cvssData?: { baseScore?: number; baseSeverity?: string; vectorString?: string }
}

type NvdCve = {
  id?: string
  published?: string
  lastModified?: string
  descriptions?: Array<{ lang?: string; value?: string }>
  metrics?: {
    cvssMetricV31?: NvdCvssMetric[]
    cvssMetricV30?: NvdCvssMetric[]
    cvssMetricV2?: NvdCvssMetric[]
  }
  references?: Array<{ url?: string }>
  weaknesses?: Array<{ description?: Array<{ value?: string }> }>
}

type NvdResponse = {
  totalResults?: number
  message?: string
  vulnerabilities?: Array<{ cve?: NvdCve }>
}

type OsvVuln = {
  id?: string
  summary?: string
  details?: string
  aliases?: string[]
  severity?: Array<{ type?: string; score?: string }>
  affected?: Array<{
    package?: { name?: string; ecosystem?: string }
    ranges?: Array<{ events?: Array<{ introduced?: string; fixed?: string }> }>
  }>
}

type OsvResponse = {
  vulns?: OsvVuln[]
}

function pickDescription(cve: NvdCve): string {
  const en = cve.descriptions?.find((d) => d.lang === 'en')?.value
  return en ?? cve.descriptions?.[0]?.value ?? '—'
}

function pickCvss(cve: NvdCve): { score?: number; severity?: string; vector?: string } {
  const metric =
    cve.metrics?.cvssMetricV31?.[0] ??
    cve.metrics?.cvssMetricV30?.[0] ??
    cve.metrics?.cvssMetricV2?.[0]
  return {
    score: metric?.cvssData?.baseScore,
    severity: metric?.cvssData?.baseSeverity,
    vector: metric?.cvssData?.vectorString
  }
}

function pickCwe(cve: NvdCve): string {
  const values =
    cve.weaknesses
      ?.flatMap((w) => w.description?.map((d) => d.value).filter(Boolean) ?? [])
      .filter((v): v is string => Boolean(v)) ?? []
  return values.length ? [...new Set(values)].join(', ') : '—'
}

export function formatNvdCveReport(cve: NvdCve): string {
  const cvss = pickCvss(cve)
  const lines = [
    `## ${cve.id ?? 'CVE'}`,
    '',
    `**Опубликовано:** ${cve.published ?? '—'}`,
    `**Обновлено:** ${cve.lastModified ?? '—'}`
  ]
  if (cvss.score != null) {
    lines.push(`**CVSS:** ${cvss.score}${cvss.severity ? ` (${cvss.severity})` : ''}`)
  }
  if (cvss.vector) lines.push(`**Вектор:** ${cvss.vector}`)
  lines.push(`**CWE:** ${pickCwe(cve)}`, '', pickDescription(cve))

  const refs = cve.references?.map((r) => r.url).filter(Boolean) as string[] | undefined
  if (refs?.length) {
    lines.push('', '**Ссылки:**')
    for (const url of refs.slice(0, 8)) lines.push(`- ${url}`)
    if (refs.length > 8) lines.push(`- …ещё ${refs.length - 8}`)
  }
  return lines.join('\n')
}

export function formatNvdSearchReport(
  keyword: string,
  vulnerabilities: Array<{ cve?: NvdCve }>
): string {
  if (!vulnerabilities.length) {
    return `По ключевому слову «${keyword}» в NVD CVE не найдено.`
  }
  const header = `# NVD: «${keyword}» — ${vulnerabilities.length} результат(ов)\n`
  return (
    header +
    vulnerabilities
      .map((v) => {
        const cve = v.cve
        if (!cve) return '—'
        const cvss = pickCvss(cve)
        const score = cvss.score != null ? ` CVSS ${cvss.score}` : ''
        const desc = pickDescription(cve).slice(0, 200)
        return `- **${cve.id}**${score} — ${desc}${desc.length >= 200 ? '…' : ''}`
      })
      .join('\n')
  )
}

export function formatOsvReport(
  pkg: string,
  version: string,
  ecosystem: string,
  vulns: OsvVuln[]
): string {
  if (!vulns.length) {
    return `Пакет **${pkg}@${version}** (${ecosystem}): известных уязвимостей в OSV не найдено.`
  }

  const lines = [
    `# OSV: ${pkg}@${version} (${ecosystem})`,
    `Найдено уязвимостей: **${vulns.length}**`,
    ''
  ]

  for (const vuln of vulns) {
    const cveAliases = vuln.aliases?.filter((a) => a.toUpperCase().startsWith('CVE-')) ?? []
    const cvePart = cveAliases.length ? ` (${cveAliases.join(', ')})` : ''
    lines.push(`## ${vuln.id ?? 'уязвимость'}${cvePart}`)
    if (vuln.summary) lines.push(vuln.summary)
    const sev = vuln.severity?.[0]
    if (sev?.score) lines.push(`**Severity:** ${sev.type ?? 'score'} ${sev.score}`)
    const fixed = vuln.affected
      ?.flatMap(
        (a) => a.ranges?.flatMap((r) => r.events?.map((e) => e.fixed).filter(Boolean) ?? []) ?? []
      )
      .filter(Boolean)
    if (fixed?.length) lines.push(`**Исправлено в:** ${[...new Set(fixed)].join(', ')}`)
    if (vuln.details && vuln.details !== vuln.summary) {
      lines.push('', vuln.details.slice(0, 500) + (vuln.details.length > 500 ? '…' : ''))
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

async function fetchJson<T>(url: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`)
    }
    return (await response.json()) as T
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Таймаут запроса (${DEFAULT_TIMEOUT_MS / 1000} с)`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function queryNvdByCveId(cveId: string): Promise<string> {
  const normalized = cveId.trim().toUpperCase()
  if (!CVE_ID_RE.test(normalized)) {
    return `Некорректный CVE ID: «${cveId}». Ожидается формат CVE-YYYY-NNNN.`
  }

  const url = `${NVD_API_BASE}?cveId=${encodeURIComponent(normalized)}`
  const data = await fetchJson<NvdResponse>(url)

  if (data.message) return `NVD: ${data.message}`
  const cve = data.vulnerabilities?.[0]?.cve
  if (!cve) return `CVE ${normalized} не найден в NVD.`
  return formatNvdCveReport(cve)
}

export async function queryNvdByKeyword(keyword: string, limit = 5): Promise<string> {
  const q = keyword.trim()
  if (!q) return 'Не указано ключевое слово для поиска в NVD.'

  const capped = Math.min(Math.max(limit, 1), 10)
  const url = `${NVD_API_BASE}?keywordSearch=${encodeURIComponent(q)}&resultsPerPage=${capped}`
  const data = await fetchJson<NvdResponse>(url)

  if (data.message) return `NVD: ${data.message}`
  return formatNvdSearchReport(q, data.vulnerabilities ?? [])
}

export async function queryOsvPackage(
  pkg: string,
  version: string,
  ecosystem: string
): Promise<string> {
  const name = pkg.trim()
  const ver = version.trim()
  const eco = ecosystem.trim() || 'npm'

  if (!name) return 'Не указано имя пакета (package).'
  if (!ver) return 'Не указана версия пакета (version).'

  const data = await fetchJson<OsvResponse>(OSV_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: { name, ecosystem: eco }, version: ver })
  })

  return formatOsvReport(name, ver, eco, data.vulns ?? [])
}

export type CheckCveArgs = {
  cve_id?: string
  keyword?: string
  package?: string
  version?: string
  ecosystem?: string
  max_results?: number
}

export async function runCheckCve(args: CheckCveArgs): Promise<string> {
  const cveId = args.cve_id?.trim()
  const keyword = args.keyword?.trim()
  const pkg = args.package?.trim()
  const version = args.version?.trim()

  const modes = [Boolean(cveId), Boolean(keyword), Boolean(pkg || version)].filter(Boolean).length
  if (modes === 0) {
    return 'Укажи один из режимов: cve_id (CVE-YYYY-NNNN), keyword (поиск в NVD) или package+version (проверка через OSV).'
  }
  if (modes > 1) {
    return 'Укажи только один режим: cve_id, keyword или package+version.'
  }

  try {
    if (cveId) return await queryNvdByCveId(cveId)
    if (keyword) return await queryNvdByKeyword(keyword, args.max_results ?? 5)
    return await queryOsvPackage(pkg!, version!, args.ecosystem ?? 'npm')
  } catch (err: unknown) {
    return `Ошибка CVE API: ${err instanceof Error ? err.message : String(err)}`
  }
}
