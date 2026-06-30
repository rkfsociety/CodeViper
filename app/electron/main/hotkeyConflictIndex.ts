import { readFile } from 'fs/promises'
import { resolve } from 'path'

export interface HotkeyBinding {
  combo: string
  action: string
  line: number
}

export interface HotkeyConflict {
  combo: string
  actions: string[]
  lines: number[]
  severity: 'high' | 'medium' | 'low'
  kind: 'duplicate_binding' | 'reserved_combo' | 'modal_overlap'
  note: string
}

export interface HotkeyConflictReport {
  path: string
  bindings: HotkeyBinding[]
  conflicts: HotkeyConflict[]
}

const RESERVED_COMBOS = new Map<string, string>([
  ['ctrl+p', 'common browser print shortcut'],
  ['ctrl+,', 'common settings shortcut in many apps'],
  ['ctrl+shift+t', 'common browser reopen-tab shortcut']
])

function normalizeCombo(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '').replace(/meta/g, 'cmd')
}

function comboLabel(combo: string): string {
  return combo
    .split('+')
    .map((part) => {
      if (part === '`') return 'Backquote'
      return part.toUpperCase()
    })
    .join('+')
}

function extractBindings(source: string): HotkeyBinding[] {
  const bindings: HotkeyBinding[] = []
  const lines = source.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(
      /if\s*\(\s*e\.ctrlKey(?:\s*&&\s*e\.shiftKey)?(?:\s*&&\s*!e\.shiftKey)?(?:\s*&&\s*!e\.altKey)?(?:\s*&&\s*!e\.metaKey)?\s*&&\s*(?:e\.key(?:\.toLowerCase\(\))?\s*===\s*['"`]([^'"`]+)['"`]|e\.key\s*===\s*['"`]([^'"`]+)['"`]|\(e\.key\s*===\s*['"`]([^'"`]+)['"`]\s*\|\|\s*e\.code\s*===\s*['"`]([^'"`]+)['"`]\))/
    )
    if (!match) continue

    const key = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? '').trim()
    if (!key) continue

    const combo = normalizeCombo(
      `${line.includes('e.ctrlKey') ? 'ctrl+' : ''}` +
        `${line.includes('e.shiftKey') ? 'shift+' : ''}` +
        `${key === 'Backquote' ? '`' : key}`
    )
    const actionLine = lines.slice(i, Math.min(lines.length, i + 8)).join('\n')
    const action = actionLine.includes('setQuickOpenOpen(true)')
      ? 'open_quick_open'
      : actionLine.includes('setSettingsOpen(true)')
        ? 'open_settings'
        : actionLine.includes('focusInput()')
          ? 'focus_chat_input'
          : actionLine.includes('createChat()')
            ? 'create_chat'
            : actionLine.includes('exportTrace()')
              ? 'export_trace'
              : actionLine.includes('toggleFileTree()')
                ? 'toggle_file_tree'
                : actionLine.includes('setTerminalOpen')
                  ? 'toggle_terminal'
                  : actionLine.includes('setShortcutsOpen')
                    ? 'toggle_shortcuts'
                    : actionLine.includes('stopAgent')
                      ? 'stop_agent'
                      : 'unknown_action'

    bindings.push({ combo, action, line: i + 1 })
  }

  return bindings
}

export async function findHotkeyConflicts(
  projectRoot: string,
  options?: { path?: string }
): Promise<HotkeyConflictReport> {
  const filePath = resolve(projectRoot, options?.path?.trim() || 'app/src/App.tsx')
  const content = await readFile(filePath, 'utf-8')
  const bindings = extractBindings(content)
  const conflicts: HotkeyConflict[] = []

  const grouped = new Map<string, HotkeyBinding[]>()
  for (const binding of bindings) {
    const list = grouped.get(binding.combo) ?? []
    list.push(binding)
    grouped.set(binding.combo, list)
  }

  for (const [combo, list] of grouped) {
    const actions = [...new Set(list.map((item) => item.action))]
    if (actions.length > 1) {
      conflicts.push({
        combo,
        actions,
        lines: list.map((item) => item.line),
        severity: 'high',
        kind: 'duplicate_binding',
        note: 'Один hotkey ведёт к нескольким действиям в одном обработчике.'
      })
    }
    const reserved = RESERVED_COMBOS.get(combo)
    if (reserved) {
      conflicts.push({
        combo,
        actions: actions.length ? actions : ['unknown'],
        lines: list.map((item) => item.line),
        severity: 'medium',
        kind: 'reserved_combo',
        note: `Комбинация часто занята вне приложения: ${reserved}.`
      })
    }
  }

  const modalEsc = bindings.find((b) => b.combo === 'escape')
  if (modalEsc) {
    conflicts.push({
      combo: 'Escape',
      actions: ['close_modal', 'stop_agent'],
      lines: [modalEsc.line],
      severity: 'low',
      kind: 'modal_overlap',
      note: 'Escape используется для закрытия модалок и остановки агента в зависимости от контекста.'
    })
  }

  conflicts.sort((a, b) => a.severity.localeCompare(b.severity) || a.combo.localeCompare(b.combo))
  return { path: filePath, bindings, conflicts }
}

export function formatHotkeyConflictReport(report: HotkeyConflictReport): string {
  const relPath = report.path.replace(/\\/g, '/')
  if (!report.conflicts.length) {
    return [
      `Отчёт find_hotkey_conflicts: 0 конфликтов в ${relPath}.`,
      `Найдено hotkey bindings: ${report.bindings.length}.`
    ].join('\n')
  }

  const lines = [
    `Отчёт find_hotkey_conflicts: ${report.conflicts.length} конфликт(ов) в ${relPath}.`,
    `Найдено hotkey bindings: ${report.bindings.length}.`,
    ''
  ]

  for (const conflict of report.conflicts) {
    lines.push(
      `- [${conflict.severity}] ${comboLabel(conflict.combo)} · ${conflict.kind}`,
      `  actions: ${conflict.actions.join(', ')}`,
      `  lines: ${conflict.lines.join(', ')}`,
      `  note: ${conflict.note}`
    )
  }

  return lines.join('\n')
}
