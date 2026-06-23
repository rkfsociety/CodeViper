export function playAgentDoneSound(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // AudioContext может быть недоступен без жеста пользователя
  }
}

/** Desktop toast — когда чат в фоне или окно свёрнуто/не в фокусе. */
export function shouldShowAgentDoneToast(
  isBackgroundChat: boolean,
  documentHidden: boolean
): boolean {
  return isBackgroundChat || documentHidden
}

export function formatAgentDoneNotificationBody(chatTitle: string): string {
  const title = chatTitle.trim() || 'Чат'
  return `${title}: агент завершил задачу`
}
