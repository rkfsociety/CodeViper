import { describe, it, expect } from 'vitest'
import { compactToolChatLine } from '../shared/toolDisplay'

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

  it('показывает код выхода для run_command', () => {
    expect(compactToolChatLine('run_command', 'exit: 0\nstdout:\nok', 'end')).toBe(
      '✓ Выполняю команду — код 0'
    )
  })
})
