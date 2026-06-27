import { useEffect, useRef } from 'react'
import {
  AGENT_WAITING_APPROVAL_MESSAGE,
  shouldNotifyAgentWaitingApproval
} from '../../shared/agentNotifications'

export function useAgentWaitingApprovalNotify(
  pendingApproval: boolean,
  notify: (message: string) => void
): void {
  const pendingRef = useRef(pendingApproval)
  const notifiedRef = useRef(false)
  const notifyRef = useRef(notify)

  pendingRef.current = pendingApproval
  notifyRef.current = notify

  useEffect(() => {
    if (!pendingApproval) {
      notifiedRef.current = false
      return
    }

    const tryNotify = () => {
      if (!pendingRef.current || notifiedRef.current) return
      if (!shouldNotifyAgentWaitingApproval(document.hasFocus())) return
      notifiedRef.current = true
      notifyRef.current(AGENT_WAITING_APPROVAL_MESSAGE)
      if (document.visibilityState === 'hidden') {
        void window.codeviper.showAgentDoneNotification({
          title: 'CodeViper',
          body: AGENT_WAITING_APPROVAL_MESSAGE
        })
      }
    }

    tryNotify()
    const onFocus = () => {
      notifiedRef.current = false
    }
    window.addEventListener('blur', tryNotify)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', tryNotify)
      window.removeEventListener('focus', onFocus)
    }
  }, [pendingApproval])
}
