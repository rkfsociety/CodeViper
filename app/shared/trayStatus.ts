/** Текст подсказки иконки в системном трее. */
export function trayTooltip(activeAgentChats: number): string {
  if (activeAgentChats > 0) {
    const n =
      activeAgentChats === 1
        ? '1 чат'
        : activeAgentChats < 5
          ? `${activeAgentChats} чата`
          : `${activeAgentChats} чатов`
    return `CodeViper — агент работает (${n})`
  }
  return 'CodeViper'
}
