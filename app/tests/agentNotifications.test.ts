import { describe, it, expect } from 'vitest'
import {
  AGENT_WAITING_APPROVAL_MESSAGE,
  formatAgentDoneNotificationBody,
  shouldNotifyAgentWaitingApproval,
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

  it('shouldNotifyAgentWaitingApproval — только без фокуса окна', () => {
    expect(shouldNotifyAgentWaitingApproval(false)).toBe(true)
    expect(shouldNotifyAgentWaitingApproval(true)).toBe(false)
  })

  it('AGENT_WAITING_APPROVAL_MESSAGE — фиксированный текст toast', () => {
    expect(AGENT_WAITING_APPROVAL_MESSAGE).toBe('Агент ждёт подтверждения')
  })
})
