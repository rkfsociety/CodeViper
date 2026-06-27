import { describe, it, expect } from 'vitest'
import { compactToolChatLine, extractToolFilePath } from '../shared/toolDisplay'

describe('compactToolChatLine', () => {
  it('показывает короткую строку для list_directory', () => {
    const output = '├── src/\n│   └── App.tsx\n└── package.json'
    expect(compactToolChatLine('list_directory', output, 'end')).toBe(
      '✓ Смотрю структуру проекта — 3 элементов'
    )
  })

  it('показывает фазу запуска', () => {
    expect(compactToolChatLine('read_file', undefined, 'start')).toBe('▶ Читаю файл…')
  })

  it('показывает путь файла при чтении', () => {
    const toolInput = JSON.stringify({ path: 'src/App.tsx' })
    expect(compactToolChatLine('read_file', undefined, 'start', toolInput)).toBe(
      '▶ Читаю файл — src/App.tsx…'
    )
    const output = 'line1\nline2\nline3'
    expect(compactToolChatLine('read_file', output, 'end', toolInput)).toBe(
      '✓ Читаю файл — src/App.tsx — 3 строк'
    )
  })

  it('показывает путь файла при редактировании', () => {
    const toolInput = JSON.stringify({ path: 'app/shared/toolDisplay.ts' })
    const output = 'Файл изменён: app/shared/toolDisplay.ts (замен: 1)'
    expect(compactToolChatLine('edit_file', output, 'end', toolInput)).toBe(
      '✓ Редактирую файл — app/shared/toolDisplay.ts'
    )
  })

  it('извлекает путь из заголовка read_file', () => {
    const output = '[Файл: F:/github/CodeViper/src/App.tsx | 4 строк]\nline1'
    expect(extractToolFilePath('read_file', undefined, output)).toBe(
      'F:/github/CodeViper/src/App.tsx'
    )
  })

  it('показывает код выхода для run_command', () => {
    expect(compactToolChatLine('run_command', 'exit: 0\nstdout:\nok', 'end')).toBe(
      '✓ Выполняю команду — код 0'
    )
  })
})
