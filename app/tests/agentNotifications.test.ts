import { describe, it, expect } from 'vitest'
import {
  formatAgentDoneNotificationBody,
  shouldShowAgentDoneToast
} from '../shared/agentNotifications'

describe('agentNotifications', () => {
  it('toast показывается для фонового чата', () => {
    expect(shouldShowAgentDoneToast(true, false)).toBe(true)
  })

  it('toast показывается при скрытом окне', () => {
    expect(shouldShowAgentDoneToast(false, true)).toBe(true)
  })

  it('toast не показывается для активного видимого чата', () => {
    expect(shouldShowAgentDoneToast(false, false)).toBe(false)
  })

  it('formatAgentDoneNotificationBody подставляет название чата', () => {
    expect(formatAgentDoneNotificationBody('Рефакторинг auth')).toBe(
      'Рефакторинг auth: агент завершил задачу'
    )
  })
})
