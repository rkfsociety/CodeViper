export interface AutomationRule {
  id: string
  cron: string
  prompt: string
  enabled: boolean
}

export type CronIssue = {
  ruleId: string
  cron: string
  message: string
}

const CRON_FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 6 }
] as const

function validateCronPart(
  part: string,
  min: number,
  max: number,
  fieldName: string
): string | null {
  if (part === '*') return null

  if (part.includes('/')) {
    const [base, stepRaw] = part.split('/')
    if (!stepRaw || base === '') {
      return `invalid ${fieldName}: некорректный шаг ${part}`
    }
    const step = Number(stepRaw)
    if (!Number.isInteger(step) || step < 1) {
      return `invalid ${fieldName}: step must be >= 1`
    }
    if (base !== '*') {
      const baseErr = validateCronPart(base, min, max, fieldName)
      if (baseErr) return baseErr
    }
    return null
  }

  if (part.includes('-')) {
    const [fromRaw, toRaw] = part.split('-')
    const from = Number(fromRaw)
    const to = Number(toRaw)
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < min || to > max || from > to) {
      return `invalid ${fieldName} range: ${part}`
    }
    return null
  }

  const value = Number(part)
  if (!Number.isInteger(value) || value < min || value > max) {
    return `invalid ${fieldName}: ${part}`
  }
  return null
}

export function parseCronExpression(cron: string): string | null {
  const trimmed = cron.trim()
  if (!trimmed) return 'cron expression is empty'

  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length !== 5) {
    return `expected 5 cron fields, got ${parts.length}`
  }

  for (let i = 0; i < CRON_FIELDS.length; i++) {
    const field = CRON_FIELDS[i]
    for (const segment of parts[i].split(',')) {
      const err = validateCronPart(segment, field.min, field.max, field.name)
      if (err) return err
    }
  }

  return null
}

export function validateAutomationRuleCron(
  rule: AutomationRule
): { valid: true } | { valid: false; issue: CronIssue } {
  const cronError = parseCronExpression(rule.cron)
  if (cronError) {
    return {
      valid: false,
      issue: { ruleId: rule.id, cron: rule.cron, message: cronError }
    }
  }
  if (!rule.id.trim()) {
    return {
      valid: false,
      issue: { ruleId: rule.id, cron: rule.cron, message: 'rule id is empty' }
    }
  }
  if (!rule.prompt.trim()) {
    return {
      valid: false,
      issue: { ruleId: rule.id, cron: rule.cron, message: 'prompt is empty' }
    }
  }
  return { valid: true }
}

export function collectInvalidAutomationRules(rules: AutomationRule[]): CronIssue[] {
  const issues: CronIssue[] = []
  const seenIds = new Set<string>()

  for (const rule of rules) {
    if (!rule.enabled) continue

    if (seenIds.has(rule.id)) {
      issues.push({
        ruleId: rule.id,
        cron: rule.cron,
        message: `duplicate rule id: ${rule.id}`
      })
      continue
    }
    seenIds.add(rule.id)

    const result = validateAutomationRuleCron(rule)
    if (!result.valid) issues.push(result.issue)
  }

  return issues
}

export function formatCronIssuesOutput(issues: CronIssue[]): string {
  if (!issues.length) return 'Невалидных cron-правил не найдено.'
  const parts = [`Найдено ${issues.length} проблем cron:`]
  issues.forEach((issue, index) => {
    parts.push(`[${index + 1}] rule=${issue.ruleId} cron="${issue.cron}"\n    ${issue.message}`)
  })
  return parts.join('\n')
}
